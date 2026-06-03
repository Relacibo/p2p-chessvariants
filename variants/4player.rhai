// 4-Player Chess — API v3
// Cross-shaped board (14×14, 4 disabled corners).
// Each player starts in their arm with team-based orientation.

fn config() {
    #{
        api_version: 3,
        name: "4-Player Chess",
        version: "1.0.0",
        colors: ["north", "east", "south", "west"],
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

    // North (team 0) — top arm, cols 3..10, rows 0..2
    let north_back = [
        Piece("north", "rook"), Piece("north", "knight"), Piece("north", "bishop"),
        Piece("north", "queen"), Piece("north", "king"), Piece("north", "bishop"),
        Piece("north", "knight"), Piece("north", "rook"),
    ];
    for i in 0..north_back.len() {
        board = engine::board::set(board, Coords(0, 3 + i, 0), north_back[i]);
        board = engine::board::set(board, Coords(1, 3 + i, 0), Piece("north", "pawn"));
    }

    // East (team 1) — right arm, rows 3..10, cols 11..13
    let east_back = [
        Piece("east", "rook"), Piece("east", "knight"), Piece("east", "bishop"),
        Piece("east", "queen"), Piece("east", "king"), Piece("east", "bishop"),
        Piece("east", "knight"), Piece("east", "rook"),
    ];
    for i in 0..east_back.len() {
        board = engine::board::set(board, Coords(3 + i, 11, 0), east_back[i]);
        board = engine::board::set(board, Coords(3 + i, 12, 0), Piece("east", "pawn"));
    }

    // South (team 2) — bottom arm, cols 3..10, rows 11..13
    // Flipped: row 13 = back rank, row 12 = pawns
    let south_back = [
        Piece("south", "rook"), Piece("south", "knight"), Piece("south", "bishop"),
        Piece("south", "queen"), Piece("south", "king"), Piece("south", "bishop"),
        Piece("south", "knight"), Piece("south", "rook"),
    ];
    for i in 0..south_back.len() {
        board = engine::board::set(board, Coords(13, 3 + i, 0), south_back[i]);
        board = engine::board::set(board, Coords(12, 3 + i, 0), Piece("south", "pawn"));
    }

    // West (team 3) — left arm, rows 3..10, cols 0..2
    // Flipped: col 2 = back rank, col 1 = pawns
    let west_back = [
        Piece("west", "rook"), Piece("west", "knight"), Piece("west", "bishop"),
        Piece("west", "queen"), Piece("west", "king"), Piece("west", "bishop"),
        Piece("west", "knight"), Piece("west", "rook"),
    ];
    for i in 0..west_back.len() {
        board = engine::board::set(board, Coords(3 + i, 2, 0), west_back[i]);
        board = engine::board::set(board, Coords(3 + i, 1, 0), Piece("west", "pawn"));
    }

    #{
        board: board,
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
