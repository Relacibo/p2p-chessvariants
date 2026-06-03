// Chess — full rules: castling, en passant, pawn promotion
// API v3: handle_action validates all legality including king safety.
// valid_moves generates candidates and filters via handle_action try/catch.

fn config() {
    #{
        api_version: 3,
        name: "Chess",
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
        turn: "white",
        castling_rights: #{ wk: true, wq: true, bk: true, bq: true },
        en_passant: (),
    }
}

// Returns true if `pos` is attacked by any piece of any color in `colors`.
fn sq_attacked_by(board, pos, colors) {
    for color in colors {
        if engine::is_square_attacked(board, pos, color) {
            return true;
        }
    }
    false
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.color != state.turn { return []; }

    let color = player.color;
    let candidates = [];

    // Normal pseudo-moves for all pieces of this color
    for r in 0..8 {
        for c in 0..8 {
            let from = Coords(r, c);
            let piece = engine::board::get(state.board, from);
            if piece == () || piece.color != color { continue; }
            let dests = pseudo_moves(state.board, from);
            for to in dests {
                candidates.push(Move(from, to));
            }
        }
    }

    // Castling candidates (handle_action validates full legality)
    let king_row = if color == "white" { 7 } else { 0 };
    let king = engine::board::get(state.board, Coords(king_row, 4));
    if king != () && king.color == color && king.type == "king" {
        let ks = if color == "white" { state.castling_rights.wk } else { state.castling_rights.bk };
        let qs = if color == "white" { state.castling_rights.wq } else { state.castling_rights.bq };
        if ks { candidates.push(Move(Coords(king_row, 4), Coords(king_row, 6))); }
        if qs { candidates.push(Move(Coords(king_row, 4), Coords(king_row, 2))); }
    }

    // En passant candidates
    if state.en_passant != () {
        let ep = state.en_passant;
        let pawn_row = if color == "white" { ep.row + 1 } else { ep.row - 1 };
        for dc in [-1, 1] {
            let pawn_col = ep.col + dc;
            if pawn_col >= 0 && pawn_col < 8 {
                let p = engine::board::get(state.board, Coords(pawn_row, pawn_col));
                if p != () && p.color == color && p.type == "pawn" {
                    candidates.push(Move(Coords(pawn_row, pawn_col), ep));
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

    if state.turn != player_color {
        throw `${player_color} is not active — it's ${state.turn}'s turn`;
    }

    if action.type == "move" {
        let from = action.from;
        let to = action.to;

        let src = engine::board::get(state.board, from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }

        let dst = engine::board::get(state.board, to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let enemies = state.players
            .filter(|p| p.team != player.team)
            .map(|p| p.color);
        if enemies.len() == 0 {
            enemies = state.players
                .filter(|p| p.color != player_color)
                .map(|p| p.color);
        }

        let dr = to.row - from.row;
        let dc = to.col - from.col;

        let new_board = ();
        let new_castling_rights = state.castling_rights;
        let new_en_passant = ();

        // Castling: king moves exactly 2 squares horizontally
        if src.type == "king" && dr == 0 && (dc == 2 || dc == -2) {
            if is_in_check(state.board, player_color, enemies) {
                throw "cannot castle while in check";
            }

            let is_kingside = dc == 2;
            let row = from.row;
            let rook_col = if is_kingside { 7 } else { 0 };
            let rook_from = Coords(row, rook_col);

            let rook_piece = engine::board::get(state.board, rook_from);
            if rook_piece == () || rook_piece.color != player_color || rook_piece.type != "rook" {
                throw "no rook at castling position";
            }

            if player_color == "white" {
                if is_kingside && !state.castling_rights.wk { throw "white kingside castling rights lost"; }
                if !is_kingside && !state.castling_rights.wq { throw "white queenside castling rights lost"; }
            } else {
                if is_kingside && !state.castling_rights.bk { throw "black kingside castling rights lost"; }
                if !is_kingside && !state.castling_rights.bq { throw "black queenside castling rights lost"; }
            }

            // All squares between king and rook must be empty
            if is_kingside {
                for c in (from.col + 1)..rook_col {
                    if engine::board::get(state.board, Coords(row, c)) != () {
                        throw "castling path is blocked";
                    }
                }
            } else {
                for c in (rook_col + 1)..from.col {
                    if engine::board::get(state.board, Coords(row, c)) != () {
                        throw "castling path is blocked";
                    }
                }
            }

            // King must not pass through or land on an attacked square
            let pass_col = if is_kingside { from.col + 1 } else { from.col - 1 };
            if sq_attacked_by(state.board, Coords(row, pass_col), enemies) {
                throw "king passes through attacked square";
            }
            if sq_attacked_by(state.board, Coords(row, to.col), enemies) {
                throw "king lands on attacked square";
            }

            // Move king and rook simultaneously
            let rook_to_col = if is_kingside { from.col + 1 } else { from.col - 1 };
            new_board = engine::board::move_piece(state.board, from, to);
            new_board = engine::board::move_piece(new_board, rook_from, Coords(row, rook_to_col));

            if player_color == "white" {
                new_castling_rights = merge(new_castling_rights, #{ wk: false, wq: false });
            } else {
                new_castling_rights = merge(new_castling_rights, #{ bk: false, bq: false });
            }
        }
        // En passant: pawn moves diagonally to an empty square
        else if src.type == "pawn" && dc != 0 && dst == () {
            if state.en_passant == () || to != state.en_passant {
                throw "invalid en passant target";
            }

            let captured_pawn_pos = Coords(from.row, to.col);
            new_board = engine::board::move_piece(state.board, from, to);
            new_board = engine::board::set(new_board, captured_pawn_pos, ());

            if is_in_check(new_board, player_color, enemies) {
                throw "move leaves king in check";
            }
        }
        // Normal move (includes promotion)
        else {
            new_board = engine::board::move_piece(state.board, from, to);

            // Pawn promotion: auto-promote to queen
            if src.type == "pawn" {
                if (player_color == "white" && to.row == 0) || (player_color == "black" && to.row == 7) {
                    new_board = engine::board::set(new_board, to, Piece(player_color, "queen"));
                }
            }

            if is_in_check(new_board, player_color, enemies) {
                throw "move leaves king in check";
            }

            // Track en passant square for double pawn push
            if src.type == "pawn" {
                if (player_color == "white" && from.row == 6 && to.row == 4) ||
                   (player_color == "black" && from.row == 1 && to.row == 3) {
                    new_en_passant = Coords((from.row + to.row) / 2, from.col);
                }
            }

            // Update castling rights on king/rook moves
            if src.type == "king" {
                if player_color == "white" {
                    new_castling_rights = merge(new_castling_rights, #{ wk: false, wq: false });
                } else {
                    new_castling_rights = merge(new_castling_rights, #{ bk: false, bq: false });
                }
            }
            if src.type == "rook" {
                if from == Coords(7, 7) { new_castling_rights = merge(new_castling_rights, #{ wk: false }); }
                if from == Coords(7, 0) { new_castling_rights = merge(new_castling_rights, #{ wq: false }); }
                if from == Coords(0, 7) { new_castling_rights = merge(new_castling_rights, #{ bk: false }); }
                if from == Coords(0, 0) { new_castling_rights = merge(new_castling_rights, #{ bq: false }); }
            }
            // Remove castling rights if an original rook square is captured
            if dst != () {
                if to == Coords(7, 7) { new_castling_rights = merge(new_castling_rights, #{ wk: false }); }
                if to == Coords(7, 0) { new_castling_rights = merge(new_castling_rights, #{ wq: false }); }
                if to == Coords(0, 7) { new_castling_rights = merge(new_castling_rights, #{ bk: false }); }
                if to == Coords(0, 0) { new_castling_rights = merge(new_castling_rights, #{ bq: false }); }
            }
        }

        let next_turn = if player_color == "white" { "black" } else { "white" };
        return merge(state, #{
            board: new_board,
            turn: next_turn,
            castling_rights: new_castling_rights,
            en_passant: new_en_passant,
        });
    }

    state
}
