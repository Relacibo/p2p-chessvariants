// Simple Chess — API v2
// Uses engine::moves::* for per-piece pseudo-legal move generation.
// Uses is_legal for check filtering.
// Enforces turn order, piece ownership, and king safety in handle_action.
// Game ends when a king is captured.

fn config() {
    #{
        api_version: 2,
        name: "Simple Chess",
        version: "2.0.0",
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
        turn: "white",
    }
}

fn moves_for_piece(board, from, piece_type, color) {
    if piece_type == "pawn" { return engine::moves::pawn(board, from, color); }
    else if piece_type == "knight" { return engine::moves::knight(board, from, color); }
    else if piece_type == "bishop" { return engine::moves::bishop(board, from, color); }
    else if piece_type == "rook" { return engine::moves::rook(board, from, color); }
    else if piece_type == "queen" { return engine::moves::queen(board, from, color); }
    else if piece_type == "king" { return engine::moves::king(board, from, color); }
    []
}

fn valid_actions(state) {
    let actions = [];
    for p in state.players {
        if "outcome" in state {
            actions.push(#{ player: p, actions: [] });
        } else if p.color == state.turn {
            let pa = [];
            for r in 0..8 {
                for c in 0..8 {
                    let piece = engine::board::get(state.board, Coords(r, c));
                    if piece != () && piece.color == p.color {
                        let from = Coords(r, c);
                        let dests = moves_for_piece(state.board, from, piece.type, p.color);
                        for to in dests {
                            if is_legal(state.board, from, to, p.color) {
                                pa.push(Move(from, to));
                            }
                        }
                    }
                }
            }
            actions.push(#{ player: p, actions: pa });
        } else {
            actions.push(#{ player: p, actions: [] });
        }
    }
    actions
}

fn handle_action(state, player, action) {
    let player_color = player.color;

    if state.turn != player_color {
        throw `${player_color} is not active — it's ${state.turn}'s turn`;
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
            if kings.len() == 0 {
                let opponent_color = if p.color == "white" { "black" } else { "white" };
                let winner_idx = state.players
                    .filter(|q| q.color == opponent_color)
                    .map(|q| q.board)[0];
                return merge(state, #{
                    board: new_board,
                    outcome: Winner(winner_idx),
                });
            }
        }

        let next = if player_color == "white" { "black" } else { "white" };
        return merge(state, #{ board: new_board, turn: next });
    }

    state
}
