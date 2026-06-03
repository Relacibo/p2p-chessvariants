// Simple Chess — API v1
// handle_action validates all legality including king safety (is_in_check).
// valid_moves generates candidates and filters via handle_action try/catch.

fn config() {
    #{
        api_version: 1,
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
            #{ id: 0, name: "White", board: 0, color: "white", team: 0 },
            #{ id: 1, name: "Black", board: 0, color: "black", team: 1 },
        ],
        turn: 0,
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

fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.id != state.turn { return []; }

    let candidates = [];
    for r in 0..8 {
        for c in 0..8 {
            let piece = engine::board::get(state.board, Coords(r, c));
            if piece != () && piece.color == player.color {
                let from = Coords(r, c);
                let dests = moves_for_piece(state.board, from, piece.type, player.color);
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
    if "outcome" in state { return true; }
    for entry in all_valid_moves {
        if entry.moves.len > 0 { return false; }
    }
    true
}

fn handle_action(state, player, action) {
    let player_color = player.color;

    if state.turn != player.id {
        throw `player ${player.id} is not active — it's ${state.turn}'s turn`;
    }

    if action.type == "move" {
        let src = engine::board::get(state.board, action.from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }

        let dst = engine::board::get(state.board, action.to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let new_board = engine::board::move_piece(state.board, action.from, action.to);

        // King safety: throw if our king is left in check after this move.
        let enemies = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p.color);
        if enemies.len == 0 {
            enemies = state.players
                .filter(|p| p.color != player_color)
                .map(|p| p.color);
        }
        if is_in_check(new_board, player_color, enemies) {
            throw "move leaves king in check";
        }

        // Check for king capture → game over
        for p in state.players {
            let kings = engine::board::find(new_board, Piece(p.color, "king"));
            if kings.len == 0 {
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

        let next = if player.id == 0 { 1 } else { 0 };
        return merge(state, #{ board: new_board, turn: next });
    }

    state
}
