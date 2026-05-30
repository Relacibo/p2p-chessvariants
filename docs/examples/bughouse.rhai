// ============================================================
// BUGHOUSE — api_version 1
//
// Two linked chess boards. Captured pieces go to the partner's
// reserve and can be dropped instead of moving.
//
// Player layout:
//   Board 0: white-a (white) vs black-a (black)
//   Board 1: white-b (white) vs black-b (black)
// Teams:
//   Team A = white-a + black-a
//   Team B = white-b + black-b
// Partners: white-a↔black-a, white-b↔black-b
//
// NOTE: Move validation below is simplified (no check detection).
// ============================================================

fn config() {
  #{
    api_version:      1,
    name:             "Bughouse",
    version:          "1.0.0",
    players:          ["white-a", "black-a", "white-b", "black-b"],
    board: #{
      type:  "rectangle",
      rows:  8,
      cols:  8,
      count: 2,
    },
    reserve_pile:     true,
    check_protection: true,   // standard chess rules apply per board
  }
}

// ── Helpers ─────────────────────────────────────────────────

fn player_board(player) {
  switch player {
    "white-a" | "black-a" => 0,
    "white-b" | "black-b" => 1
  }
}

fn player_color(player) {
  switch player {
    "white-a" | "white-b" => "white",
    _ => "black"
  }
}

fn partner(player) {
  switch player {
    "white-a" => "black-a",
    "black-a" => "white-a",
    "white-b" => "black-b",
    _ => "white-b"
  }
}

fn pawn_dir(player) {
  // white moves "up" (decreasing row), black moves "down" (increasing row)
  if player_color(player) == "white" { -1 } else { 1 }
}

fn pawn_start_row(player) {
  if player_color(player) == "white" { 6 } else { 1 }
}

fn pawn_promo_row(player) {
  if player_color(player) == "white" { 0 } else { 7 }
}

fn back_rank_row(player) {
  if player_color(player) == "white" { 7 } else { 0 }
}

// Returns the board sub-array for board_index
fn get_board(state, board_index) {
  state.board[board_index]
}

fn piece_at(state, board_index, row, col) {
  board_get(get_board(state, board_index), Coords(row, col))
}

fn own_piece(piece, player) {
  piece != () && piece.color == player_color(player)
}

fn enemy_piece(piece, player) {
  piece != () && piece.color != player_color(player)
}

// ── Movement helpers ─────────────────────────────────────────

fn ray_moves(state, board_index, from, dr, dc, player) {
  let moves = [];
  for sq in ray(get_board(state, board_index), from, [dr, dc]) {
    if sq.piece == () {
      moves.push(sq.coords);
    } else {
      if enemy_piece(sq.piece, player) { moves.push(sq.coords); }
      break;
    }
  }
  moves
}

fn rook_moves(state, board_index, from, player) {
  ray_moves(state, board_index, from, -1,  0, player) +
  ray_moves(state, board_index, from,  1,  0, player) +
  ray_moves(state, board_index, from,  0, -1, player) +
  ray_moves(state, board_index, from,  0,  1, player)
}

fn bishop_moves(state, board_index, from, player) {
  ray_moves(state, board_index, from, -1, -1, player) +
  ray_moves(state, board_index, from, -1,  1, player) +
  ray_moves(state, board_index, from,  1, -1, player) +
  ray_moves(state, board_index, from,  1,  1, player)
}

fn knight_moves(state, board_index, from, player) {
  let offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  jump(get_board(state, board_index), from, offsets)
    .filter(|sq| sq.piece == () || enemy_piece(sq.piece, player))
    .map(|sq| sq.coords)
}

fn queen_moves(state, board_index, from, player) {
  rook_moves(state, board_index, from, player) +
  bishop_moves(state, board_index, from, player)
}

fn king_moves(state, board_index, from, player) {
  let offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  jump(get_board(state, board_index), from, offsets)
    .filter(|sq| sq.piece == () || enemy_piece(sq.piece, player))
    .map(|sq| sq.coords)
}

fn pawn_moves(state, board_index, from, player) {
  let board  = get_board(state, board_index);
  let dir    = pawn_dir(player);
  let moves  = [];
  let r      = from.row;
  let c      = from.col;

  // Single push
  let fwd = Coords(r + dir, c);
  if board_get(board, fwd) == () {
    moves.push(fwd);
    // Double push from start row
    if r == pawn_start_row(player) {
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
    if sq != () && enemy_piece(sq, player) {
      moves.push(cap);
    }
  }

  // Dropped pawns cannot be placed on the back rank and cannot promote in Bughouse.
  // Standard en-passant omitted for brevity (TODO).
  moves
}

fn piece_moves(state, board_index, from, player) {
  let p = piece_at(state, board_index, from.row, from.col);
  if p == () || !own_piece(p, player) { return []; }
  switch p.type {
    "pawn"   => pawn_moves(state, board_index, from, player),
    "rook"   => rook_moves(state, board_index, from, player),
    "knight" => knight_moves(state, board_index, from, player),
    "bishop" => bishop_moves(state, board_index, from, player),
    "queen"  => queen_moves(state, board_index, from, player),
    "king"   => king_moves(state, board_index, from, player),
    _        => [],
  }
}

// Drop destinations: any empty square (except pawn on first/last rank)
fn drop_destinations(state, board_index, piece_type) {
  let board = get_board(state, board_index);
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
  let actions = [];
  let b = player_board(player);

  // Regular moves
  for r in 0..8 {
    for c in 0..8 {
      let from = Coords(r, c, b);
      let p    = piece_at(state, b, r, c);
      if p == () || !own_piece(p, player) { continue; }
      for dest in piece_moves(state, b, from, player) {
        actions.push(Move(from, Coords(dest.row, dest.col, b)));
      }
    }
  }

  // Drops from reserve
  for piece in reserve_for_player(state, player) {
    for dest in drop_destinations(state, b, piece.type) {
      actions.push(Drop(piece, dest));
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

// ── apply ────────────────────────────────────────────────────

fn apply(state, player, action) {
  if !state.active_players.contains(player) {
    throw `Player ${player} is not active`;
  }
  let b = player_board(player);

  // Handle pending promotion choice
  if state.pending_promotion != () && state.pending_promotion.player == player {
    if action.type != "choose" || action.tag != "promote" {
      throw "promotion choice required";
    }
    let valid = ["queen", "rook", "bishop", "knight"];
    if !valid.contains(action.value) { throw "invalid promotion piece"; }
    let pp    = state.pending_promotion;
    let board = board_set(get_board(state, b), pp.to, Piece(player_color(player), action.value));
    return finish_turn(state, player, board, b, ());
  }

  switch action.type {
    "move" => apply_move(state, player, b, action),
    "drop" => apply_drop(state, player, b, action),
    _      => throw `unknown action type: ${action.type}`,
  }
}

fn apply_move(state, player, b, action) {
  let from  = action.from;
  let to    = action.to;
  let board = get_board(state, b);
  let piece = board_get(board, from);

  if piece == () || !own_piece(piece, player) { throw "no own piece at source"; }

  let legal = piece_moves(state, b, from, player);
  if !legal.contains(to) { throw "illegal move"; }

  // Capture: add captured piece to partner's reserve
  let captured    = board_get(board, to);
  let new_reserve = state.reserve;
  if captured != () {
    // Captured piece changes hands: use opponent color
    let flipped = Piece(player_color(partner(player)), captured.type);
    new_reserve  = reserve_add(new_reserve, partner(player), flipped);
  }

  let new_board = board_move_piece(board, from, to);

  // Promotion
  let promo_row = pawn_promo_row(player);
  if piece.type == "pawn" && to.row == promo_row {
    // Await choice
    let new_state = merge(state, #{
      board:              update_board(state, b, board_set(new_board, to, ())),
      reserve:            new_reserve,
      pending_promotion:  #{ player: player, to: to, board: b },
    });
    return new_state;
  }

  finish_turn(state, player, new_board, b, new_reserve)
}

fn apply_drop(state, player, b, action) {
  let piece = action.piece;
  let to    = action.to;

  let player_reserve = reserve_for_player(state, player);
  if !player_reserve.any(|p| p.type == piece.type) {
    throw "piece not in reserve";
  }
  let board = get_board(state, b);
  if board_get(board, to) != () { throw "target square occupied"; }
  if piece.type == "pawn" && (to.row == 0 || to.row == 7) {
    throw "cannot drop pawn on back rank";
  }

  let new_board   = board_set(board, to, piece);
  let new_reserve = reserve_remove(state.reserve, player, piece.type);
  finish_turn(state, player, new_board, b, new_reserve)
}

fn finish_turn(state, player, new_board, board_index, new_reserve) {
  let boards = update_board(state, board_index, new_board);

  // Determine next active players: replace this player with their opponent on same board
  let opp     = board_opponent(player);
  let active  = state.active_players.filter(|p| p != player);
  active.push(opp);

  let new_state = merge(state, #{
    board:              boards,
    reserve:            if new_reserve != () { new_reserve } else { state.reserve },
    active_players:     active,
    pending_promotion:  (),
  });

  // Check if any king is missing (simplified game-over detection)
  check_game_over(new_state)
}

// Board 0 opponent pairs: (white-a,black-a), Board 1: (white-b,black-b)
fn board_opponent(player) {
  switch player {
    "white-a" => "black-a",
    "black-a" => "white-a",
    "white-b" => "black-b",
    _ => "white-b"
  }
}

fn update_board(state, board_index, new_board) {
  let boards = state.board;
  boards[board_index] = new_board;
  boards
}

fn check_game_over(state) {
  // If a king is missing on either board → losing team loses
  for board_index in [0, 1] {
    let board = get_board(state, board_index);
    for color in ["white", "black"] {
      let kings = board_find(board, Piece(color, "king"));
      if kings.len() == 0 {
        // Find which team wins
        let loser_player  = if color == "white" {
          if board_index == 0 { "white-a" } else { "white-b" }
        } else {
          if board_index == 0 { "black-a" } else { "black-b" }
        };
        let winning_team  = [partner(loser_player), board_opponent(partner(loser_player))];
        return merge(state, #{ game_over: Winners(winning_team) });
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
    reserve:            [{ player: "white-a", pieces: [] }, { player: "black-a", pieces: [] },
                         { player: "white-b", pieces: [] }, { player: "black-b", pieces: [] }],
    active_players:     ["white-a", "white-b"],  // white on board 0 and white on board 1 start
    pending_promotion:  (),
    game_over:          (),
  }
}
