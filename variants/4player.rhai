// 4-Player Chess — API v3
// Free-for-all on a single board. Each player views from their side.
// Turn order: north → east → south → west.

fn config() {
    #{
        api_version: 3,
        name: "4-Player Chess",
        version: "1.0.0",
        colors: ["north", "east", "south", "west"],
        allowed_player_count: 4,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
    }
}

fn init(player_count) {
    // Start with empty board, place pieces for each player in their corner
    let b = standard_start_position();
    // Replace white rook at (0,7) with east king + pawns, and black rook at (7,0) with west king + pawns
    b = engine::board::set(b, Coords(0, 7, 0), Piece("east", "king"));
    b = engine::board::set(b, Coords(1, 7, 0), Piece("east", "pawn"));
    b = engine::board::set(b, Coords(1, 6, 0), Piece("east", "pawn"));
    b = engine::board::set(b, Coords(7, 0, 0), Piece("west", "king"));
    b = engine::board::set(b, Coords(6, 0, 0), Piece("west", "pawn"));
    b = engine::board::set(b, Coords(6, 1, 0), Piece("west", "pawn"));
    #{
        board: b,
        players: [
            #{ board: 0, color: "north", team: 0 },
            #{ board: 0, color: "east",  team: 1 },
            #{ board: 0, color: "south", team: 2 },
            #{ board: 0, color: "west",  team: 3 },
        ],
        teams: [
            #{ id: 0, orientations: [#{ board: 0, orientation: "normal" }] },
            #{ id: 1, orientations: [#{ board: 0, orientation: "clockwise" }] },
            #{ id: 2, orientations: [#{ board: 0, orientation: "flipped" }] },
            #{ id: 3, orientations: [#{ board: 0, orientation: "counterclockwise" }] },
        ],
        turn: "north",
        turn_order: ["north", "east", "south", "west"],
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
    if player.color != state.turn { return []; }

    let moves = [];
    for r in 0..8 {
        for c in 0..8 {
            let piece = engine::board::get(state.board, Coords(r, c));
            if piece != () && piece.color == player.color {
                let from = Coords(r, c);
                let dests = moves_for_piece(state.board, from, piece.type, player.color);
                for to in dests {
                    let bt = engine::board::get(state.board, to);
                    if bt != () && bt.color == player.color { continue; }
                    moves.push(Move(from, to));
                }
            }
        }
    }
    moves
}

fn handle_action(state, player, action) {
    if state.turn != player.color { throw `not ${player.color}'s turn`; }

    if action.type == "move" {
        let src = engine::board::get(state.board, action.from);
        if src == () { throw "no piece there"; }
        if src.color != player.color { throw "not yours"; }

        let dst = engine::board::get(state.board, action.to);
        if dst != () && dst.color == player.color { throw "own piece"; }

        state.board = engine::board::move_piece(state.board, action.from, action.to);

        // Check if any king was captured
        for p in state.players {
            let kings = engine::board::find(state.board, Piece(p.color, "king"));
            if kings.len() == 0 {
                // Player eliminated — remaining players win
                let survivors = state.players.filter(|q| q.color != p.color);
                state.outcome = Winners(survivors.map(|q| q.board));
                return state;
            }
        }

        // Next player's turn
        let idx = state.turn_order.index_of(player.color);
        state.turn = state.turn_order[(idx + 1) % 4];
    }

    state
}

fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    for entry in all_valid_moves {
        if entry.moves.len() > 0 { return false; }
    }
    true
}
