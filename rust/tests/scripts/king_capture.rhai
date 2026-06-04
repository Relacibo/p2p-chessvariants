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
    }
}

fn init(player_count) {
    let board = engine::board::empty(8, 8);
    board = engine::board::set(board, Coords(0, 4), Piece("black", "king"));
    board = engine::board::set(board, Coords(1, 4), Piece("white", "queen"));
    board = engine::board::set(board, Coords(7, 4), Piece("white", "king"));
    #{
        board: board,
        players: [
            #{ id: 0, name: "White", board: 0, color: "white", team: 0 },
            #{ id: 1, name: "Black", board: 0, color: "black", team: 1 },
        ],
        turn: 0,
    }
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.id != state.turn { return []; }

    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece != () && piece.color == player.color {
                let dests = pseudo_moves(state.board, from);
                for to in dests {
                    candidates.push(Move(from, to));
                }
            }
        }
    }
    candidates.filter(|m| {
        try { handle_action(state, player, m); true }
        catch(err) { false }
    })
}

fn is_game_over(state, all_valid_moves) {
    "outcome" in state
}

fn handle_action(state, player, action) {
    let player_color = player.color;

    if state.turn != player.id {
        throw "not your turn";
    }

    if action.type == "move" {
        let src = engine::board::get(state.board, action.from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }

        let dst = engine::board::get(state.board, action.to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // Check for king capture → game over
        for p in state.players {
            let kings = engine::board::find(new_board, Piece(p.color, "king"));
            if kings.len == 0 {
                let opponent_color = if p.color == "white" { "black" } else { "white" };
                let winner_idx = state.players
                    .filter(|q| q.color == opponent_color)
                    .map(|q| q.id)[0];
                return merge(state, #{
                    board: new_board,
                    outcome: Winner(winner_idx),
                });
            }
        }

        let next = if player.id == 0 { 1 } else { 0 };
        return merge(state, #{ board: new_board, turn: next });
    }

    state
}
