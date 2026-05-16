// Minimal board for game-over / king-capture tests.
// Board layout (rows 0-7, cols 0-7):
//   (0,4) black king
//   (1,4) white queen  <- one step from black king
//   (7,4) white king
// White wins by moving queen from (1,4) to (0,4).

fn config() {
    #{
        api_version: 1,
        name: "King Capture Test",
        version: "1.0.0",
        min_players: 2,
        max_players: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
    }
}

fn init(player_count) {
    let board = board_empty(8, 8);
    board = board_set(board, Coords(0, 4), King("black"));
    board = board_set(board, Coords(1, 4), Queen("white"));
    board = board_set(board, Coords(7, 4), King("white"));
    #{
        board: board,
        turn: 0,
        game_over: (),
    }
}

fn apply(state, player, action) {
    if player != state.turn { throw `not your turn (expected ${state.turn}, got ${player})`; }
    if action.type != "move" { throw "only move actions are supported"; }

    let src_piece = board_get(state.board, action.from);
    if src_piece == () { throw "no piece at source square"; }

    let player_colors = ["white", "black"];
    if src_piece.color != player_colors[player] { throw "that piece does not belong to you"; }

    let dst_piece = board_get(state.board, action.to);
    if dst_piece != () && dst_piece.color == player_colors[player] { throw "cannot capture your own piece"; }

    let new_board = board_move_piece(state.board, action.from, action.to);

    let game_over = ();
    if dst_piece != () && dst_piece.type == "king" {
        game_over = Winner(player);
    }

    state.board = new_board;
    state.turn = (state.turn + 1) % 2;
    state.game_over = game_over;
    state
}
