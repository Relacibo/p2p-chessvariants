// A minimal chess variant for integration tests.
// Enforces turn order and basic piece ownership,
// but does NOT validate chess rules (any piece may move anywhere).
// Game ends when a king is captured.

fn config() {
    #{
        api_version: 1,
        name: "Simple Chess (test)",
        version: "1.0.0",
        min_players: 2,
        max_players: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
    }
}

fn init(player_count) {
    #{
        board: standard_start_position(),
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

    // Game ends if a king was captured
    let game_over = ();
    if dst_piece != () && dst_piece.type == "king" {
        game_over = Winner(player);
    }

    state.board = new_board;
    state.turn = (state.turn + 1) % 2;
    state.game_over = game_over;
    state
}
