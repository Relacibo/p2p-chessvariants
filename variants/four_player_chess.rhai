// ============================================================
// FOUR-PLAYER CHESS — api_version 1
//
// 14×14 board with 3×3 corners removed.
// Players:
//   white  (bottom,  rows 10-13)
//   red    (left,    cols  0-3)   [rotated perspective]
//   black  (top,     rows  0-3)
//   blue   (right,   cols 10-13)
// Turn order: white → red → black → blue → white …
//
// A player is eliminated when their king is captured.
// Pawns promote on the opposite back rank.
//
// NOTE: No check detection (simplified). En passant omitted.
// ============================================================

fn config() {
  #{
    api_version:      1,
    name:             "Four-Player Chess",
    version:          "1.0.0",
    colors:           ["white", "red", "black", "blue"],
    allowed_player_count: 4,
    board: #{
      type:  "rectangle",
      rows:  14,
      cols:  14,
      disabled_rects: [
        Rect( 0,  0, 3, 3),
        Rect( 0, 11, 3, 3),
        Rect(11,  0, 3, 3),
        Rect(11, 11, 3, 3),
      ],
    },
    check_protection: false,  // king is captured, not checkmated
    promotion_pieces: ["queen","rook","bishop","knight"],
  }
}

// ── Player helpers ───────────────────────────────────────────

// Direction a pawn moves (dr, dc)
fn pawn_dir(color) {
  switch color {
    "white" => [-1,  0],   // white: up
    "red"   => [ 0,  1],   // red:   right
    "black" => [ 1,  0],   // black: down
    _       => [ 0, -1],   // blue:  left
  }
}

fn pawn_start_row_col(color) {
  switch color {
    "white" => #{ row: 11, col: () },   // white pawns on row 11
    "red"   => #{ row: (), col:  2 },   // red   pawns on col  2
    "black" => #{ row:  2, col: () },   // black pawns on row  2
    _       => #{ row: (), col: 11 },   // blue  pawns on col 11
  }
}

fn is_pawn_start(color, row, col) {
  let s = pawn_start_row_col(color);
  if s.row != () { row == s.row } else { col == s.col }
}

fn promo_row_col(color) {
  // Pawn promotes when it reaches the opponent's back rank region
  switch color {
    "white" => #{ row:  2, col: () },
    "red"   => #{ row: (), col: 11 },
    "black" => #{ row: 11, col: () },
    _       => #{ row: (), col:  2 },
  }
}

fn is_promo_square(color, row, col) {
  let p = promo_row_col(color);
  if p.row != () { row == p.row } else { col == p.col }
}

// Is this square on the board? (accounts for cut corners)
fn valid_square(row, col) {
  if row < 0 || row >= 14 || col < 0 || col >= 14 { return false; }
  let in_tl = row < 3 && col < 3;
  let in_tr = row < 3 && col > 10;
  let in_bl = row > 10 && col < 3;
  let in_br = row > 10 && col > 10;
  !(in_tl || in_tr || in_bl || in_br)
}

fn next_active_player(state, current) {
  let n    = state.alive.len();
  let cur  = state.alive.index_of(current.color);
  Player(state.alive[(cur + 1) % n])
}

// ── Movement helpers ─────────────────────────────────────────

fn own_piece(p, color) { p != () && p.color == color }
fn enemy_piece(p, color) { p != () && p.color != color }

fn ray_moves(state, from, dr, dc, color) {
  let moves = [];
  let r = from.row + dr;
  let c = from.col + dc;
  loop {
    if !valid_square(r, c) { break; }
    let sq = board_get(state.board, Coords(r, c));
    if sq == () {
      moves.push(Coords(r, c));
    } else {
      if enemy_piece(sq, color) { moves.push(Coords(r, c)); }
      break;
    }
    r += dr;
    c += dc;
  }
  moves
}

fn rook_moves(state, from, color) {
  ray_moves(state, from, -1, 0, color) + ray_moves(state, from, 1, 0, color) +
  ray_moves(state, from, 0, -1, color) + ray_moves(state, from, 0, 1, color)
}

fn bishop_moves(state, from, color) {
  ray_moves(state, from, -1,-1, color) + ray_moves(state, from, -1, 1, color) +
  ray_moves(state, from,  1,-1, color) + ray_moves(state, from,  1, 1, color)
}

fn queen_moves(state, from, color) {
  rook_moves(state, from, color) + bishop_moves(state, from, color)
}

fn knight_moves(state, from, color) {
  let offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  offsets
    .map(|o| Coords(from.row + o[0], from.col + o[1]))
    .filter(|c| valid_square(c.row, c.col))
    .filter(|c| {
      let sq = board_get(state.board, c);
      sq == () || enemy_piece(sq, color)
    })
}

fn king_moves(state, from, color) {
  let offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  offsets
    .map(|o| Coords(from.row + o[0], from.col + o[1]))
    .filter(|c| valid_square(c.row, c.col))
    .filter(|c| {
      let sq = board_get(state.board, c);
      sq == () || enemy_piece(sq, color)
    })
}

fn pawn_moves(state, from, color) {
  let d     = pawn_dir(color);
  let dr    = d[0];
  let dc    = d[1];
  let moves = [];
  let r     = from.row;
  let c     = from.col;

  // Forward
  let fwd = Coords(r + dr, c + dc);
  if valid_square(fwd.row, fwd.col) && board_get(state.board, fwd) == () {
    moves.push(fwd);
    if is_pawn_start(color, r, c) {
      let fwd2 = Coords(r + 2*dr, c + 2*dc);
      if valid_square(fwd2.row, fwd2.col) && board_get(state.board, fwd2) == () {
        moves.push(fwd2);
      }
    }
  }

  // Capture
  for dc in [-1, 1] {
    let cap = Coords(r + dr, c + dc);
    if valid_square(cap.row, cap.col) {
      let sq = board_get(state.board, cap);
      if sq != () && enemy_piece(sq, color) { moves.push(cap); }
    }
  }
  moves
}

fn piece_moves(state, from, player) {
  let color = player.color;
  let p = board_get(state.board, from);
  if p == () || !own_piece(p, color) { return []; }
  switch p.type {
    "pawn"   => pawn_moves(state, from, color),
    "rook"   => rook_moves(state, from, color),
    "knight" => knight_moves(state, from, color),
    "bishop" => bishop_moves(state, from, color),
    "queen"  => queen_moves(state, from, color),
    "king"   => king_moves(state, from, color),
    _        => [],
  }
}

// ── valid_actions ─────────────────────────────────────────────

fn valid_actions(state, player) {
  let player_color = player.color;

  if state.pending_promotion != () {
    let pp = state.pending_promotion;
    if player_color != pp.player { return []; }
    return [];  // UI modal handles the promotion choice
  }

  let actions = [];
  for r in 0..14 {
    for c in 0..14 {
      if !valid_square(r, c) { continue; }
      let from = Coords(r, c);
      let sq   = board_get(state.board, from);
      if sq == () || !own_piece(sq, player_color) { continue; }
      for dest in piece_moves(state, from, player) {
        actions.push(Move(from, dest));
      }
    }
  }
  actions
}

// ── handle_event ──────────────────────────────────────────────

fn handle_event(state, player, event) {
  let player_color = player.color;

  if !state.active_players.contains(player) {
    throw `${player_color} is not active`;
  }

  // Promotion choice
  if event.type == "promote" {
    let pp = state.pending_promotion;
    if pp == () || pp.player != player_color { throw "no pending promotion"; }
    if !["queen","rook","bishop","knight"].contains(event.value) { throw "invalid piece"; }
    let board = board_set(state.board, pp.to, Piece(player_color, event.value));
    let new_state = advance_turn(merge(state, #{ board: board, pending_promotion: () }));
    return #{ state: new_state, ui: [] };
  }

  if event.type != "move" { throw `unknown event type: ${event.type}`; }

  let from  = event.from;
  let to    = event.to;
  let piece = board_get(state.board, from);

  if piece == () || !own_piece(piece, player_color) { throw "no own piece at source"; }
  if !piece_moves(state, from, player).contains(to) { throw "illegal move"; }

  let captured = board_get(state.board, to);
  let board    = board_move_piece(state.board, from, to);

  let alive = state.alive;
  if captured != () && captured.type == "king" {
    alive = state.alive.filter(|p| p != captured.color);
  }

  // Promotion
  if piece.type == "pawn" && is_promo_square(player_color, to.row, to.col) {
    let new_state = advance_turn(merge(state, #{
      board: board,
      alive: alive,
      pending_promotion: #{ player: player_color, to: to }
    }));
    return #{
      state: new_state,
      ui: [#{
        type: "choice",
        action: "promote",
        title: "Promote pawn",
        options: ["queen","rook","bishop","knight"],
        players: [player_color],
      }],
    };
  }

  let new_state = merge(state, #{ board: board, alive: alive, pending_promotion: () });
  return #{ state: advance_turn(new_state), ui: [] };
}

fn advance_turn(state) {
  if state.alive.len() <= 1 { return state; }
  let next = next_active_player(state, state.active_players[0]);
  merge(state, #{ active_players: [next] })
}

// Called automatically by the engine after every event.
fn check_game_over(state) {
  if state.alive.len() == 1 {
    let winner_color = state.alive[0];
    let winner_idx = state.players
      .map(|p| p.color)
      .index_of(winner_color);
    return merge(state, #{ game_over: Winner(winner_idx) });
  }
  state
}

// ── init ──────────────────────────────────────────────────────

fn init(player_count) {
  let board = empty_board_14x14();

  // White — rows 12-13
  place_back_rank(board, 13, "white");
  place_pawns_row(board, 12, "white");

  // Black — rows 0-1
  place_back_rank(board, 0, "black");
  place_pawns_row(board, 1, "black");

  // Red — cols 0-1 (left side)
  place_back_rank_col(board, 0, "red");
  place_pawns_col(board, 1, "red");

  // Blue — cols 12-13 (right side)
  place_back_rank_col(board, 13, "blue");
  place_pawns_col(board, 12, "blue");

  #{
    board:              board,
    players:            [
      #{ board: 0, color: "white", team: 0 },
      #{ board: 0, color: "red",   team: 1 },
      #{ board: 0, color: "black", team: 2 },
      #{ board: 0, color: "blue",  team: 3 },
    ],
    active_players:     [Player("white")],
    alive:              ["white", "red", "black", "blue"],
    pending_promotion:  (),
    game_over:          (),
  }
}

// Helpers to build the initial 14×14 position.
// Columns 3-10 belong to the central play area; corners are disabled.

fn place_back_rank(board, row, color) {
  let pieces = ["rook","knight","bishop","queen","king","bishop","knight","rook"];
  for i in 0..8 {
    board_set(board, Coords(row, i + 3), Piece(color, pieces[i]));
  }
}

fn place_pawns_row(board, row, color) {
  for c in 3..11 {
    board_set(board, Coords(row, c), Pawn(color));
  }
}

fn place_back_rank_col(board, col, color) {
  let pieces = ["rook","knight","bishop","queen","king","bishop","knight","rook"];
  for i in 0..8 {
    board_set(board, Coords(i + 3, col), Piece(color, pieces[i]));
  }
}

fn place_pawns_col(board, col, color) {
  for r in 3..11 {
    board_set(board, Coords(r, col), Pawn(color));
  }
}

fn empty_board_14x14() {
    engine::board::empty(14, 14)   // engine helper
}