// Minimal board for game-over / king-capture tests.
// Board layout (rows 0-7, cols 0-7):
//   (0,4) black king
//   (1,4) white queen  <- one step from black king
//   (7,4) white king
// White wins by moving queen from (1,4) to (0,4).

fn config() {
    #{
        api_version: 2,
        name: "King Capture Test",
        version: "1.0.0",
        colors: ["white", "black"],
        allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
    }
}

fn init(player_count) {
    let board = engine::board::empty(8, 8);
    board = engine::board::set(board, Coords(0, 4), King("black"));
    board = engine::board::set(board, Coords(1, 4), Queen("white"));
    board = engine::board::set(board, Coords(7, 4), King("white"));
    #{
        board: board,
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
        throw "not your turn";
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