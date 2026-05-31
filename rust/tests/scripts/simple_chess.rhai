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
    // Simple chess doesn't validate moves — any piece can go anywhere.
    // During a pending state (e.g. promotion) the script returns [] here.
    []
}

fn handle_event(state, player, event) {
    // player is a map #{ board, color }
    let player_color = player.color;

    if event.type == "move" {
        if !state.active_players.contains(player_color) {
            throw `${player_color} is not active`;
        }

        let src = board_get(state.board, event.from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }

        let dst = board_get(state.board, event.to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let new_board = board_move_piece(state.board, event.from, event.to);

        let game_over = ();
        if dst != () && dst.type == "king" {
            let player_idx = state.players
                .filter(|p| p.color == player_color)
                .map(|p| p.board)[0];
            game_over = Winner(player_idx);
        }

        let next = if player_color == "white" { "black" } else { "white" };
        return #{
            state: merge(state, #{
                board: new_board,
                active_players: [next],
                running_clocks: [next],
                game_over: game_over,
            }),
            ui: [],
        };
    }

    throw `unknown event type: ${event.type}`;
}
