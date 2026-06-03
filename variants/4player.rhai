// 4-Player Chess — API v3
// Cross-shaped board (14×14, 4 disabled corners).
// Red=bottom, Blue=left, Yellow=top, Green=right

fn config() {
    #{
        api_version: 3,
        name: "4-Player Chess",
        version: "1.0.0",
        colors: ["red", "blue", "yellow", "green"],
        allowed_player_count: 4,
        board: #{
            type: "rectangle",
            rows: 14,
            cols: 14,
            disabled_rects: [
                #{ r1: 0, c1: 0, r2: 3, c2: 3 },
                #{ r1: 0, c1: 11, r2: 3, c2: 3 },
                #{ r1: 11, c1: 0, r2: 3, c2: 3 },
                #{ r1: 11, c1: 11, r2: 3, c2: 3 },
            ],
        },
    }
}

fn init(player_count) {
    let board = board_empty(14, 14);

    // Yellow (team 0) — top arm, cols 3..10, rows 0..2
    let y_back = [
        Piece("yellow", "rook"), Piece("yellow", "knight"), Piece("yellow", "bishop"),
        Piece("yellow", "queen"), Piece("yellow", "king"), Piece("yellow", "bishop"),
        Piece("yellow", "knight"), Piece("yellow", "rook"),
    ];
    for i in 0..y_back.len() {
        board = engine::board::set(board, Coords(0, 3 + i, 0), y_back[i]);
        board = engine::board::set(board, Coords(1, 3 + i, 0), Piece("yellow", "pawn"));
    }

    // Green (team 1) — right arm, rows 3..10, cols 11..13
    // Back rank at col 13 (outer edge), pawns at col 12
    let g_back = [
        Piece("green", "rook"), Piece("green", "knight"), Piece("green", "bishop"),
        Piece("green", "queen"), Piece("green", "king"), Piece("green", "bishop"),
        Piece("green", "knight"), Piece("green", "rook"),
    ];
    for i in 0..g_back.len() {
        board = engine::board::set(board, Coords(3 + i, 13, 0), g_back[i]);
        board = engine::board::set(board, Coords(3 + i, 12, 0), Piece("green", "pawn"));
    }

    // Red (team 2) — bottom arm, cols 3..10, rows 11..13
    let r_back = [
        Piece("red", "rook"), Piece("red", "knight"), Piece("red", "bishop"),
        Piece("red", "queen"), Piece("red", "king"), Piece("red", "bishop"),
        Piece("red", "knight"), Piece("red", "rook"),
    ];
    for i in 0..r_back.len() {
        board = engine::board::set(board, Coords(13, 3 + i, 0), r_back[i]);
        board = engine::board::set(board, Coords(12, 3 + i, 0), Piece("red", "pawn"));
    }

    // Blue (team 3) — left arm, rows 3..10, cols 0..2
    // Back rank at col 0 (outer edge), pawns at col 1
    let b_back = [
        Piece("blue", "rook"), Piece("blue", "knight"), Piece("blue", "bishop"),
        Piece("blue", "queen"), Piece("blue", "king"), Piece("blue", "bishop"),
        Piece("blue", "knight"), Piece("blue", "rook"),
    ];
    for i in 0..b_back.len() {
        board = engine::board::set(board, Coords(3 + i, 0, 0), b_back[i]);
        board = engine::board::set(board, Coords(3 + i, 1, 0), Piece("blue", "pawn"));
    }

    #{
        board: board,
        players: [
            #{ board: 0, color: "yellow", team: 0 },
            #{ board: 0, color: "green",  team: 1 },
            #{ board: 0, color: "red",    team: 2 },
            #{ board: 0, color: "blue",   team: 3 },
        ],
        teams: [
            #{ id: 0, orientations: [#{ board: 0, orientation: "flipped" }] },
            #{ id: 1, orientations: [#{ board: 0, orientation: "clockwise" }] },
            #{ id: 2, orientations: [#{ board: 0, orientation: "normal" }] },
            #{ id: 3, orientations: [#{ board: 0, orientation: "counterclockwise" }] },
        ],
        turn: "red",
        turn_order: ["red", "blue", "yellow", "green"],
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
    for r in 0..14 {
        for c in 0..14 {
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
