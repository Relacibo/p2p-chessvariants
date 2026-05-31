// A minimal chess variant for the dev board.
// Enforces turn order and basic piece ownership.
// Game ends when a king is captured (checked by check_game_over).

fn config() {
    #{
        api_version: 2,
        name: "Simple Chess",
        version: "1.0.0",
        colors: ["white", "black"],
        allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
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
    []
}

fn on_move(state, player, from, to, piece) {
    let player_color = player.color;

    if !state.active_players.contains(player) {
        throw `${player_color} is not active`;
    }

    let src = engine::board::get(state.board, from);
    if src == () { throw "no piece at source square"; }
    if src.color != player_color { throw "that piece does not belong to you"; }

    let dst = engine::board::get(state.board, to);
    if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

    let new_board = engine::board::move_piece(state.board, from, to);

    let next = Player(if player_color == "white" { "black" } else { "white" });
    merge(state, #{
        board: new_board,
        active_players: [next],
    })
}

// Called automatically by the engine after every state change.
fn check_game_over(state) {
    for p in state.players {
        let kings = engine::board::find(state.board, Piece(p.color, "king"));
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