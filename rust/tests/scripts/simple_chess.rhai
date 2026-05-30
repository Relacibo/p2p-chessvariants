// A minimal chess variant for integration tests.
// Enforces turn order and basic piece ownership,
// but does NOT validate chess rules (any piece may move anywhere).
// Game ends when a king is captured.

fn config() {
    #{
        api_version: 1,
        name: "Simple Chess (test)",
        version: "1.0.0",
        colors: ["white", "black"],
        allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
        promotion_pieces: ["queen","rook","bishop","knight"],
    }
}

fn init(player_count) {
    #{
        board: standard_start_position(),
        players: [
            #{ name: "white", board: 0, color: "white", team: 0 },
            #{ name: "black", board: 0, color: "black", team: 1 },
        ],
        active_players: ["white"],
        running_clocks: ["white"],
        game_over: (),
    }
}

fn valid_actions(state, player) {
    // Simple chess doesn't define valid_actions - any piece can move anywhere
    []
}

fn apply(state, player, action) {
    if !state.active_players.contains(player) { throw `${player} is not active`; }
    if action.type != "move" { throw "only move actions are supported"; }

    let src_piece = board_get(state.board, action.from);
    if src_piece == () { throw "no piece at source square"; }

    // Get player's color from state.players
    let player_color = state.players
        .filter(|p| p.name == player)
        .map(|p| p.color)[0];
    if src_piece.color != player_color { throw "that piece does not belong to you"; }

    let dst_piece = board_get(state.board, action.to);
    if dst_piece != () && dst_piece.color == player_color { throw "cannot capture your own piece"; }

    let new_board = board_move_piece(state.board, action.from, action.to);

    // Game ends if a king was captured
    let game_over = ();
    if dst_piece != () && dst_piece.type == "king" {
        // Find player index
        let player_idx = state.players
            .filter(|p| p.name == player)
            .map(|p| p.board)[0];
        game_over = Winner(player_idx);
    }

    // Switch turn
    let next = if player == "white" { "black" } else { "white" };
    state.board = new_board;
    state.active_players = [next];
    state.running_clocks = [next];
    state.game_over = game_over;
    state
}
