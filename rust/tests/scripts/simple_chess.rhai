// A minimal chess variant for integration tests.
// Enforces turn order and basic piece ownership,
// but does NOT validate chess rules (any piece may move anywhere).
// Game ends when a king is captured (checked by check_game_over).

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
            #{ board: 0, color: "white", team: 0 },
            #{ board: 0, color: "black", team: 1 },
        ],
        active_players: [Player("white")],
        game_over: (),
    }
}

fn valid_actions(state, player) {
    // Simple chess doesn't validate moves — any piece can go anywhere.
    // During a pending state (e.g. promotion) the script returns [] here.
    []
}

fn handle_event(state, player, event) {
    let player_color = player.color;

    if event.type == "move" {
        if !state.active_players.contains(player) {
            throw `${player_color} is not active`;
        }

        let src = board_get(state.board, event.from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }

        let dst = board_get(state.board, event.to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let new_board = board_move_piece(state.board, event.from, event.to);

        let next = Player(if player_color == "white" { "black" } else { "white" });
        return #{
            state: merge(state, #{
                board: new_board,
                active_players: [next],
            }),
            ui: [],
        };
    }

    throw `unknown event type: ${event.type}`;
}

// Called automatically by the engine after every event.
fn check_game_over(state) {
    for p in state.players {
        let kings = board_find(state.board, Piece(p.color, "king"));
        if kings.len() == 0 {
            let opponent_color = if p.color == "white" { "black" } else { "white" };
            let winner_idx = state.players
                .filter(|q| q.color == opponent_color)
                .map(|q| q.board)[0];
            return merge(state, #{ game_over: Winner(winner_idx) });
        }
    }
    state
}