// ============================================================
// BUGHOUSE — api_version 1
//
// Two linked chess boards. Captured pieces go to the partner's
// reserve and can be dropped instead of moving.
//
// Player layout:
//   Board 0: white (team 0) vs black (team 1)
//   Board 1: white (team 1) vs black (team 0)
// Teams:
//   Team 0 = white(board 0) + black(board 1)
//   Team 1 = black(board 0) + white(board 1)
// Partners: same team, opposite board/color.
//
// NOTE: Move validation below is simplified (no check detection).
// ============================================================

fn config() {
  #{
    api_version:      1,
    name:             "Bughouse",
    version:          "1.0.0",
    colors:           ["white", "black"],
    allowed_player_count: 4,
    board: #{
      type:  "rectangle",
      rows:  8,
      cols:  8,
      count: 2,
    },
    reserve_pile:     true,
    check_protection: false,  // custom move validation per board
    promotion_pieces: ["queen","rook","bishop","knight"],
  }
}

// ── Player helpers ───────────────────────────────────────────

fn player_board(p) { p.board }

fn opponent_color(color) { if color == "white" { "black" } else { "white" } }

// Partner: same team, opposite board + opposite color.
// Team 0: white(board0) ↔ black(board1)
// Team 1: black(board0) ↔ white(board1)
fn partner(p) {
  let other_board = if p.board == 0 { 1 } else { 0 };
  Player(other_board, opponent_color(p.color))
}

// Board opponent: same board, opposite color.
fn board_opponent(p) {
  Player(p.board, opponent_color(p.color))
}

fn pawn_dir(color) {
  // white moves "up" (decreasing row), black moves "down" (increasing row)
  if color == "white" { -1 } else { 1 }
}

fn pawn_start_row(color) {
  if color == "white" { 6 } else { 1 }
}

fn pawn_promo_row(color) {
  if color == "white" { 0 } else { 7 }
}

fn own_piece(piece, color) {
  piece != () && piece.color == color
}

fn enemy_piece(piece, color) {
  piece != () && piece.color != color
}

// ── Movement helpers ─────────────────────────────────────────

fn ray_moves(board, from, dr, dc, color) {
  let moves = [];
  for sq in ray(board, from, [dr, dc]) {
    if sq.piece == () {
      moves.push(sq.coords);
    } else {
      if enemy_piece(sq.piece, color) { moves.push(sq.coords); }
      break;
    }
  }
  moves
}

fn rook_moves(board, from, color) {
  ray_moves(board, from, -1,  0, color) +
  ray_moves(board, from,  1,  0, color) +
  ray_moves(board, from,  0, -1, color) +
  ray_moves(board, from,  0,  1, color)
}

fn bishop_moves(board, from, color) {
  ray_moves(board, from, -1, -1, color) +
  ray_moves(board, from, -1,  1, color) +
  ray_moves(board, from,  1, -1, color) +
  ray_moves(board, from,  1,  1, color)
}

fn knight_moves(board, from, color) {
  let offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  jump(board, from, offsets)
    .filter(|sq| sq.piece == () || enemy_piece(sq.piece, color))
    .map(|sq| sq.coords)
}

fn queen_moves(board, from, color) {
  rook_moves(board, from, color) + bishop_moves(board, from, color)
}

fn king_moves(board, from, color) {
  let offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  jump(board, from, offsets)
    .filter(|sq| sq.piece == () || enemy_piece(sq.piece, color))
    .map(|sq| sq.coords)
}

fn pawn_moves(state, board_index, from, color) {
  let board  = state.board[board_index];
  let dir    = pawn_dir(color);
  let moves  = [];
  let r      = from.row;
  let c      = from.col;

  // Single push
  let fwd = Coords(r + dir, c);
  if board_get(board, fwd) == () {
    moves.push(fwd);
    // Double push from start row
    if r == pawn_start_row(color) {
      let fwd2 = Coords(r + 2 * dir, c);
      if board_get(board, fwd2) == () {
        moves.push(fwd2);
      }
    }
  }

  // Captures
  for dc in [-1, 1] {
    let cap = Coords(r + dir, c + dc);
    let sq  = board_get(board, cap);
    if sq != () && enemy_piece(sq, color) {
      moves.push(cap);
    }
  }

  moves
}

fn piece_moves(state, board_index, from, color) {
  let p = board_get(state.board[board_index], from);
  if p == () || !own_piece(p, color) { return []; }
  let board = state.board[board_index];
  switch p.type {
    "pawn"   => pawn_moves(state, board_index, from, color),
    "rook"   => rook_moves(board, from, color),
    "knight" => knight_moves(board, from, color),
    "bishop" => bishop_moves(board, from, color),
    "queen"  => queen_moves(board, from, color),
    "king"   => king_moves(board, from, color),
    _        => [],
  }
}

// Drop destinations: any empty square (except pawn on first/last rank)
fn drop_destinations(state, board_index, piece_type) {
  let board = state.board[board_index];
  let dests = [];
  for r in 0..8 {
    for c in 0..8 {
      let sq = board_get(board, Coords(r, c));
      if sq != () { continue; }
      // Pawns cannot be dropped on rank 0 or 7
      if piece_type == "pawn" && (r == 0 || r == 7) { continue; }
      dests.push(Coords(r, c, board_index));
    }
  }
  dests
}

// ── valid_actions ────────────────────────────────────────────

fn valid_actions(state, player) {
  let color = player.color;
  let b = player.board;

  if state.pending_promotion != () {
    let pp = state.pending_promotion;
    if player != pp.player { return []; }
    return [];  // UI modal handles the choice
  }

  let actions = [];

  // Regular moves
  for r in 0..8 {
    for c in 0..8 {
      let from = Coords(r, c, b);
      let p    = board_get(state.board[b], from);
      if p == () || !own_piece(p, color) { continue; }
      for dest in piece_moves(state, b, from, color) {
        actions.push(Move(from, Coords(dest.row, dest.col, b)));
      }
    }
  }

  // Drops from reserve — use ReserveCoords(i) as the "from"
  let reserve = reserve_for_player(state, player);
  for i in 0..reserve.len() {
    let piece = reserve[i];
    for dest in drop_destinations(state, b, piece.type) {
      actions.push(Move(ReserveCoords(i), dest));
    }
  }

  actions
}

fn reserve_for_player(state, player) {
  for r in state.reserve {
    if r.player == player { return r.pieces; }
  }
  []  // default fallback
}

// Remove one piece of the given type from a player's reserve. Returns updated reserve.
fn remove_from_reserve(reserve, player, piece_type) {
  for r in reserve {
    if r.player == player {
      let idx = r.pieces
        .map(|p| p.type)   // get type of each piece
        .index_of(piece_type);  // find first occurrence
      if idx >= 0 { r.pieces.remove(idx); }
    }
  }
  reserve
}

// Add a piece to a player's reserve. Returns updated reserve.
fn add_to_reserve(reserve, player, piece) {
  let found = false;
  for r in reserve {
    if r.player == player {
      r.pieces.push(piece);
      found = true;
    }
  }
  if !found {
    reserve.push(#{ player: player, pieces: [piece] });
  }
  reserve
}

// ── handle_event ─────────────────────────────────────────────

fn handle_event(state, player, event) {
  let color = player.color;
  let b = player.board;

  if !state.active_players.contains(player) {
    throw `Player ${color} on board ${b} is not active`;
  }

  // Promotion choice
  if event.type == "promote" {
    let pp = state.pending_promotion;
    if pp == () || pp.player != player { throw "no pending promotion"; }
    let valid = ["queen", "rook", "bishop", "knight"];
    if !valid.contains(event.value) { throw "invalid promotion piece"; }
    let board = board_set(state.board[pp.board], pp.to, Piece(color, event.value));
    return #{ state: finish_turn(state, player, board, pp.board, ()), ui: [] };
  }

  if event.type != "move" { throw `unknown event type: ${event.type}`; }

  let from = event.from;
  let to   = event.to;

  // Reserve drop: from is ReserveCoords
  if from.type == "reserve" {
    let reserve = reserve_for_player(state, player);
    let piece   = reserve[from.index];
    if piece == () { throw "invalid reserve index"; }

    let board = state.board[b];
    if board_get(board, to) != () { throw "target square occupied"; }
    if piece.type == "pawn" && (to.row == 0 || to.row == 7) {
      throw "cannot drop pawn on back rank";
    }
    let new_board   = board_set(board, to, piece);
    let new_reserve = remove_from_reserve(state.reserve, player, piece.type);
    return #{ state: finish_turn(state, player, new_board, b, new_reserve), ui: [] };
  }

  // Board move
  let board = state.board[b];
  let piece = board_get(board, from);

  if piece == () || !own_piece(piece, color) { throw "no own piece at source"; }

  let legal = piece_moves(state, b, from, color);
  if !legal.contains(to) { throw "illegal move"; }

  let captured    = board_get(board, to);
  let new_reserve = state.reserve;
  if captured != () {
    let flipped = Piece(partner(player).color, captured.type);
    new_reserve = add_to_reserve(new_reserve, partner(player), flipped);
  }

  let new_board = board_move_piece(board, from, to);

  // Promotion
  let promo_row = pawn_promo_row(color);
  if piece.type == "pawn" && to.row == promo_row {
    let new_state = merge(state, #{
      board:             update_board(state, b, board_set(new_board, to, ())),
      reserve:           new_reserve,
      pending_promotion: #{ player: player, to: to, board: b },
    });
    return #{
      state: new_state,
      ui: [#{
        type: "choice",
        action: "promote",
        title: "Promote pawn",
        options: ["queen","rook","bishop","knight"],
        players: [color],
      }],
    };
  }

  return #{ state: finish_turn(state, player, new_board, b, new_reserve), ui: [] };
}

fn finish_turn(state, player, new_board, board_index, new_reserve) {
  let boards = update_board(state, board_index, new_board);

  // Determine next active players: replace this player with their opponent on same board
  let opp    = board_opponent(player);
  let active = state.active_players.filter(|p| p != player);
  active.push(opp);

  let new_state = merge(state, #{
    board:              boards,
    reserve:            if new_reserve != () { new_reserve } else { state.reserve },
    active_players:     active,
    pending_promotion:  (),
  });

  new_state
}

fn update_board(state, board_index, new_board) {
  let boards = state.board;
  boards[board_index] = new_board;
  boards
}

fn check_game_over(state) {
  // If a king is missing on either board → losing team loses
  for board_index in [0, 1] {
    let board = state.board[board_index];
    for color in ["white", "black"] {
      let kings = board_find(board, Piece(color, "king"));
      if kings.len() == 0 {
        // Determine the losing team from board+color:
        // Board 0: white=team0, black=team1
        // Board 1: white=team1, black=team0
        let losing_team = if board_index == 0 {
          if color == "white" { 0 } else { 1 }
        } else {
          if color == "white" { 1 } else { 0 }
        };
        let winning_team = if losing_team == 0 { 1 } else { 0 };
        // Winners: all player color strings on the winning team
        let winners = state.players
          .filter(|p| p.team == winning_team)
          .map(|p| p.color);
        return merge(state, #{ game_over: Winners(winners) });
      }
    }
  }
  state
}

// ── init ─────────────────────────────────────────────────────

fn init(player_count) {
  let pos = standard_start_position();  // engine helper: returns 8x8 board
  #{
    board:              [pos, pos],   // two identical starting positions
    players:            [
      #{ board: 0, color: "white", team: 0 },
      #{ board: 0, color: "black", team: 1 },
      #{ board: 1, color: "white", team: 1 },
      #{ board: 1, color: "black", team: 0 },
    ],
    active_players:     [Player(0, "white"), Player(1, "white")],
    pending_promotion:  (),
    game_over:          (),
  }
}