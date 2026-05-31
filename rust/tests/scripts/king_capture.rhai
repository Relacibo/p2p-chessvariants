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
        colors: ["white", "black"],
        allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
        promotion_pieces: ["queen","rook","bishop","knight"],
    }
}

fn init(player_count) {
    let board = board_empty(8, 8);
    board = board_set(board, Coords(0, 4), King("black"));
    board = board_set(board, Coords(1, 4), Queen("white"));
    board = board_set(board, Coords(7, 4), King("white"));
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

fn handle_event(state, player, event) {
    let player_color = player.color;

    if event.type == "move" {
        if !state.active_players.contains(player) {
            throw "not your turn";
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