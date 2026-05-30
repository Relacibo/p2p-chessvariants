// ============================================================
// SEIRAWAN CHESS (S-Chess) — api_version 1
//
// Standard chess extended with two new pieces per player:
//   Hawk     (H) = Bishop + Knight  moves
//   Elephant (E) = Rook   + Knight  moves
//
// Gating rule:
//   When a piece moves off its starting back-rank square for the
//   FIRST TIME, the owning player MAY place one of their remaining
//   hand pieces (Hawk or Elephant) on the vacated square.
//   Doing so consumes that hand piece.
//   The player can also decline ("none").
//
// After a back-rank move the state enters phase "gating" and waits
// for a Choose("gate", "hawk"|"elephant"|"none") action from the
// same player before the turn advances.
//
// Hawk and Elephant are declared via combine() in config, so the
// engine auto-generates pseudo_moves for them — no manual move
// functions needed.  check_protection: true gives us is_square_attacked
// and engine_valid_actions for free.
//
// NOTE: En passant and castling omitted for brevity.
// ============================================================

fn config() {
  #{
    api_version:      1,
    name:             "Seirawan Chess",
    version:          "1.0.0",
    min_players:      2,
    max_players:      2,
    board:            #{ type: "rectangle", rows: 8, cols: 8 },
    check_protection: true,   // moves that leave own king in check are illegal
    pieces: #{
      // combine() tells the engine how these pieces move.
      // pseudo_moves, is_square_attacked and engine_valid_actions
      // will handle them automatically — no extra code needed.
      "hawk":     combine("bishop", "knight"),
      "elephant": combine("rook",   "knight"),
    },
  }
}

// ── Player / color helpers ───────────────────────────────────

fn player_color(player) { if player == 0 { "white" } else { "black" } }
fn opponent(player)     { 1 - player }
fn back_rank(player)    { if player == 0 { 7 } else { 0 } }
fn pawn_row(player)     { if player == 0 { 6 } else { 1 } }
fn promo_row(player)    { if player == 0 { 0 } else { 7 } }

fn own(p, player)       { p != () && p.color == player_color(player) }

fn is_gating_square(player, row, col) {
  row == back_rank(player) && col >= 0 && col <= 7
}

fn has_hand_piece(state, player, piece_type) {
  state.hand[player].contains(piece_type)
}

// ── Movement helpers (standard pieces only — hawk/elephant handled by engine) ──

fn ray_moves(board, from, dr, dc, player) {
  let moves = [];
  for sq in ray(board, from, [dr, dc]) {
    if sq.piece == () {
      moves.push(sq.coords);
    } else {
      if sq.piece.color != player_color(player) { moves.push(sq.coords); }
      break;
    }
  }
  moves
}

fn pawn_dests(board, from, player) {
  let r     = from.row;
  let c     = from.col;
  let dir   = if player == 0 { -1 } else { 1 };
  let start = if player == 0 { 6 } else { 1 };
  let moves = [];

  let fwd = Coords(r + dir, c);
  if board_get(board, fwd) == () {
    moves.push(fwd);
    if r == start {
      let fwd2 = Coords(r + 2*dir, c);
      if board_get(board, fwd2) == () { moves.push(fwd2); }
    }
  }
  for dc in [-1, 1] {
    let cap = Coords(r + dir, c + dc);
    let sq  = board_get(board, cap);
    if sq != () && sq.color != player_color(player) { moves.push(cap); }
  }
  moves
}

// ── Gating helpers ───────────────────────────────────────────

// Did this piece move off a back-rank square for the first time?
fn triggers_gating(state, player, from) {
  is_gating_square(player, from.row, from.col) &&
  state.gating_available[player].contains(from.col)
}

fn gate_options(state, player) {
  let opts = ["none"];
  if has_hand_piece(state, player, "hawk")     { opts.push("hawk"); }
  if has_hand_piece(state, player, "elephant") { opts.push("elephant"); }
  opts
}

// ── valid_actions ─────────────────────────────────────────────
//
// engine_valid_actions already handles all pieces including hawk and elephant
// (via combine() in config) and filters check (via check_protection: true).
// We only need to add the gating and promotion choices on top.

fn valid_actions(state) {
  // Waiting for gating decision
  if state.pending_gate != () {
    let player = state.pending_gate.player;
    return gate_options(state, player)
      .map(|v| #{ player: player, action: Choose("gate", v) });
  }

  // Waiting for promotion
  if state.pending_promotion != () {
    let player = state.pending_promotion.player;
    // S-Chess: can promote to hawk/elephant if still in hand
    let opts = ["queen","rook","bishop","knight"];
    if has_hand_piece(state, player, "hawk")     { opts.push("hawk"); }
    if has_hand_piece(state, player, "elephant") { opts.push("elephant"); }
    return opts.map(|v| #{ player: player, action: Choose("promote", v) });
  }

  // Standard moves — engine handles hawk/elephant + check filtering automatically
  engine_valid_actions(state)
}

// ── apply ─────────────────────────────────────────────────────

fn apply(state, player, action) {
  // ── Gating choice ──
  if state.pending_gate != () {
    let pg = state.pending_gate;
    if player != pg.player { throw "waiting for gating player"; }
    if action.type != "choose" || action.tag != "gate" { throw "gating choice required"; }
    return apply_gate(state, player, pg, action.value);
  }

  // ── Promotion choice ──
  if state.pending_promotion != () {
    let pp = state.pending_promotion;
    if player != pp.player { throw "waiting for promotion player"; }
    if action.type != "choose" || action.tag != "promote" { throw "promotion choice required"; }
    let valid = ["queen","rook","bishop","knight","hawk","elephant"];
    if !valid.contains(action.value) { throw "invalid promotion piece"; }
    // Consuming hawk/elephant from hand when promoting to them
    let hand = state.hand;
    if action.value == "hawk" || action.value == "elephant" {
      hand = remove_from_hand(hand, player, action.value);
    }
    let board = board_set(state.board, pp.to, Piece(player_color(player), action.value));
    return end_turn(merge(state, #{ board: board, hand: hand, pending_promotion: () }));
  }

  // ── Normal move ──
  if player != state.turn { throw "not your turn"; }
  if action.type != "move" { throw "only moves supported"; }

  let from  = action.from;
  let to    = action.to;
  let piece = board_get(state.board, from);

  if piece == () || !own(piece, player) { throw "no own piece at source"; }
  // Delegate legality check to engine (includes check_protection filtering).
  // engine_valid_actions returns Action[] directly (type, from, to fields).
  let legal = engine_valid_actions(state)
    .filter(|a| a.type == "move" && a.from == from)
    .map(|a| a.to);
  if !legal.contains(to) { throw "illegal move"; }

  let board = board_move_piece(state.board, from, to);
  let state = merge(state, #{ board: board });

  // Promotion?
  if piece.type == "pawn" && to.row == promo_row(player) {
    return merge(state, #{ pending_promotion: #{ player: player, to: to } });
  }

  // Gating?
  if triggers_gating(state, player, from) && gate_options(state, player).len() > 1 {
    return merge(state, #{
      pending_gate:      #{ player: player, vacated: from },
      gating_available:  remove_col(state.gating_available, player, from.col),
    });
  }

  let ga = if is_gating_square(player, from.row, from.col) {
    remove_col(state.gating_available, player, from.col)
  } else {
    state.gating_available
  };
  end_turn(merge(state, #{ gating_available: ga }))
}

fn apply_gate(state, player, pg, choice) {
  let valid_choices = gate_options(state, player);
  if !valid_choices.contains(choice) { throw `invalid gate choice: ${choice}`; }

  let board = state.board;
  let hand  = state.hand;

  if choice != "none" {
    board = board_set(board, pg.vacated, Piece(player_color(player), choice));
    hand  = remove_from_hand(hand, player, choice);
  }

  end_turn(merge(state, #{ board: board, hand: hand, pending_gate: () }))
}

fn end_turn(state) {
  let state = check_game_over(state);
  if state.game_over != () { return state; }
  merge(state, #{ turn: opponent(state.turn) })
}

fn check_game_over(state) {
  for p in [0, 1] {
    let kings = board_find(state.board, Piece(player_color(p), "king"));
    if kings.len() == 0 {
      return merge(state, #{ game_over: Winner(opponent(p)) });
    }
  }
  state
}

// ── Utility ──────────────────────────────────────────────────

fn remove_col(gating_available, player, col) {
  let g = gating_available;
  g[player] = g[player].filter(|c| c != col);
  g
}

fn remove_from_hand(hand, player, piece_type) {
  let h = hand;
  let idx = h[player].index_of(piece_type);
  if idx >= 0 { h[player].remove(idx); }
  h
}

// ── init ──────────────────────────────────────────────────────

fn init(player_count) {
  #{
    board:              standard_start_position(),
    turn:               0,
    // Each player holds one Hawk and one Elephant in hand
    hand:               [["hawk", "elephant"], ["hawk", "elephant"]],
    // Columns 0-7 are available for gating (all back-rank squares)
    gating_available:   [[0,1,2,3,4,5,6,7], [0,1,2,3,4,5,6,7]],
    pending_gate:       (),
    pending_promotion:  (),
    game_over:          (),
  }
}
