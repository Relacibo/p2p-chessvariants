// Chess - full rules: castling, en passant, pawn promotion
// API v2: piece definitions in script, engine provides only geometry helpers.

fn config() {
    #{ api_version: 1, name: "Chess", version: "2.0.0", colors: ["white", "black"],
       allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}

fn build_piece_defs() {
    #{ king: [#{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }],
       queen: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }],
       rook: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0]] }],
       bishop: [#{ type: "slide", dirs: [[1,1],[1,-1],[-1,1],[-1,-1]] }],
       knight: [#{ type: "jump", offsets: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }] }
}

fn build_color_piece_defs() {
    #{ white: #{ pawn: [
         #{ type: "jump", offsets: [[-1, 0]], cond: "pawn_push_empty" },
         #{ type: "jump", offsets: [[-2, 0]], cond: "pawn_double_white" },
         #{ type: "jump", offsets: [[-1, -1], [-1, 1]], cond: "pawn_capture" },
    ]},
    black: #{ pawn: [
         #{ type: "jump", offsets: [[1, 0]], cond: "pawn_push_empty" },
         #{ type: "jump", offsets: [[2, 0]], cond: "pawn_double_black" },
         #{ type: "jump", offsets: [[1, -1], [1, 1]], cond: "pawn_capture" },
    ]} }
}

// Condition functions (called by name from piece definitions)
fn cond_pawn_push_empty(state, from, to) {
    engine::board::get(state.board, to) == ()
}

fn cond_pawn_double_white(state, from, to) {
    from.row == 6
    && engine::board::get(state.board, Coords(from.row - 1, from.col)) == ()
    && engine::board::get(state.board, to) == ()
}

fn cond_pawn_double_black(state, from, to) {
    from.row == 1
    && engine::board::get(state.board, Coords(from.row + 1, from.col)) == ()
    && engine::board::get(state.board, to) == ()
}

fn cond_pawn_capture(state, from, to) {
    let target = engine::board::get(state.board, to);
    let my = engine::board::get(state.board, from);
    target == () || target.color != my.color
}

fn get_piece_defs(piece, state) {
    if piece.color in state.color_piece_defs && piece.type in state.color_piece_defs[piece.color] {
        return state.color_piece_defs[piece.color][piece.type];
    }
    if piece.type in state.piece_defs { return state.piece_defs[piece.type]; }
    [];
}

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from);
    if piece == () { return []; }
    let comps = get_piece_defs(piece, state);
    if comps == () || comps.len == 0 { return []; }
    let dests = [];
    for comp in comps {
        let raw = switch comp.type {
            "jump"  => engine::moves::jump(board, from, comp.offsets, piece.color),
            "slide" => engine::moves::slide(board, from, comp.dirs, piece.color),
            _ => [],
        };
        if comp.cond != () {
            raw = switch comp.cond {
                "pawn_push_empty" => raw.filter(|t| cond_pawn_push_empty(state, from, t)),
                "pawn_double_white" => raw.filter(|t| cond_pawn_double_white(state, from, t)),
                "pawn_double_black" => raw.filter(|t| cond_pawn_double_black(state, from, t)),
                "pawn_capture" => raw.filter(|t| cond_pawn_capture(state, from, t)),
                _ => raw,
            };
        }
        for d in raw { dests.push(d); }
    }
    dests
}

fn sq_attacked_by(board, square, enemy_colors, state) {
    if enemy_colors == () || enemy_colors.len == 0 { return false; }
    for r in 0..board.rows { for c in 0..board.cols {
        let pos = Coords(r, c); let piece = engine::board::get(board, pos);
        if piece != () && enemy_colors.contains(piece.color) {
            let dests = get_pseudo_dests(board, pos, state);
            for d in dests { if d == square { return true; } }
        }
    }}
    false
}

fn is_in_check(board, king_color, enemy_colors, state) {
    let king_pos = engine::board::find(board, Piece(king_color, "king"));
    if king_pos == () || king_pos.len == 0 { return false; }
    sq_attacked_by(board, king_pos[0], enemy_colors, state)
}

fn init(player_count) {
    #{ board: standard_start_position(),
       players: [#{ id: 0, name: "White", board: 0, color: "white", team: 0 },
                 #{ id: 1, name: "Black", board: 0, color: "black", team: 1 }],
       turn: 0, castling_rights: #{ wk: true, wq: true, bk: true, bq: true }, en_passant: (),
       piece_defs: build_piece_defs(), color_piece_defs: build_color_piece_defs() }
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    if player.id != state.turn { return []; }
    let color = player.color;
    let candidates = [];
    for r in 0..8 { for c in 0..8 {
        let from = Coords(r, c);
        let piece = engine::board::get(state.board, from);
        if piece == () || piece.color != color { continue; }
        let dests = get_pseudo_dests(state.board, from, state);
        for to in dests { candidates.push(Move(from, to)); }
    }}
    let king_row = if color == "white" { 7 } else { 0 };
    let king = engine::board::get(state.board, Coords(king_row, 4));
    if king != () && king.color == color && king.type == "king" {
        let ks = if color == "white" { state.castling_rights.wk } else { state.castling_rights.bk };
        let qs = if color == "white" { state.castling_rights.wq } else { state.castling_rights.bq };
        if ks { candidates.push(Move(Coords(king_row, 4), Coords(king_row, 6))); }
        if qs { candidates.push(Move(Coords(king_row, 4), Coords(king_row, 2))); }
    }
    candidates.filter(|m| { try { handle_action(state, player, m); true } catch(err) { false } })
}

fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    for entry in all_valid_moves { if entry.moves.len > 0 { return false; } }
    true
}

fn handle_action(state, player, action) {
    let player_color = player.color;
    if state.turn != player.id { throw `${player.id} is not active — it's ${state.turn}'s turn`; }

    if action.type == "move" {
        let from = action.from; let to = action.to;
        let src = engine::board::get(state.board, from);
        if src == () { throw "no piece at source square"; }
        if src.color != player_color { throw "that piece does not belong to you"; }
        let dst = engine::board::get(state.board, to);
        if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }

        let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.color);
        if enemies.len == 0 { enemies = state.players.filter(|p| p.color != player_color).map(|p| p.color); }

        let dr = to.row - from.row; let dc = to.col - from.col;
        let new_board = (); let new_castling_rights = state.castling_rights; let new_en_passant = ();

        if src.type == "king" && dr == 0 && (dc == 2 || dc == -2) {
            if is_in_check(state.board, player_color, enemies, state) { throw "cannot castle while in check"; }
            let is_kingside = dc == 2; let row = from.row;
            let rook_col = if is_kingside { 7 } else { 0 };
            let rook_from = Coords(row, rook_col);
            let rook_piece = engine::board::get(state.board, rook_from);
            if rook_piece == () || rook_piece.color != player_color || rook_piece.type != "rook" { throw "no rook at castling position"; }
            if player_color == "white" {
                if is_kingside && !state.castling_rights.wk { throw "white kingside castling rights lost"; }
                if !is_kingside && !state.castling_rights.wq { throw "white queenside castling rights lost"; }
            } else {
                if is_kingside && !state.castling_rights.bk { throw "black kingside castling rights lost"; }
                if !is_kingside && !state.castling_rights.bq { throw "black queenside castling rights lost"; }
            }
            if is_kingside { for c in (from.col + 1)..rook_col { if engine::board::get(state.board, Coords(row, c)) != () { throw "castling path is blocked"; } } }
            else { for c in (rook_col + 1)..from.col { if engine::board::get(state.board, Coords(row, c)) != () { throw "castling path is blocked"; } } }
            let pass_col = if is_kingside { from.col + 1 } else { from.col - 1 };
            if sq_attacked_by(state.board, Coords(row, pass_col), enemies, state) { throw "king passes through attacked square"; }
            if sq_attacked_by(state.board, Coords(row, to.col), enemies, state) { throw "king lands on attacked square"; }
            let rook_to_col = if is_kingside { from.col + 1 } else { from.col - 1 };
            new_board = engine::board::move_piece(state.board, from, to);
            new_board = engine::board::move_piece(new_board, rook_from, Coords(row, rook_to_col));
            if player_color == "white" { new_castling_rights = merge(new_castling_rights, #{ wk: false, wq: false }); }
            else { new_castling_rights = merge(new_castling_rights, #{ bk: false, bq: false }); }
        }
        else if src.type == "pawn" && dc != 0 && dst == () {
            if state.en_passant == () || to != state.en_passant { throw "invalid en passant target"; }
            let captured_pawn_pos = Coords(from.row, to.col);
            new_board = engine::board::move_piece(state.board, from, to);
            new_board = engine::board::set(new_board, captured_pawn_pos, ());
            if is_in_check(new_board, player_color, enemies, state) { throw "move leaves king in check"; }
        }
        else {
            if src.type == "pawn" {
                if (player_color == "white" && to.row == 0) || (player_color == "black" && to.row == 7) {
                    return merge(state, #{ promotion_pending: #{ from: from, to: to, color: player_color } });
                }
            }
            new_board = engine::board::move_piece(state.board, from, to);
            if is_in_check(new_board, player_color, enemies, state) { throw "move leaves king in check"; }
            if src.type == "pawn" {
                if (player_color == "white" && from.row == 6 && to.row == 4) || (player_color == "black" && from.row == 1 && to.row == 3) {
                    new_en_passant = Coords((from.row + to.row) / 2, from.col);
                }
            }
            if src.type == "king" {
                if player_color == "white" { new_castling_rights = merge(new_castling_rights, #{ wk: false, wq: false }); }
                else { new_castling_rights = merge(new_castling_rights, #{ bk: false, bq: false }); }
            }
            if src.type == "rook" {
                if from == Coords(7, 7) { new_castling_rights = merge(new_castling_rights, #{ wk: false }); }
                if from == Coords(7, 0) { new_castling_rights = merge(new_castling_rights, #{ wq: false }); }
                if from == Coords(0, 7) { new_castling_rights = merge(new_castling_rights, #{ bk: false }); }
                if from == Coords(0, 0) { new_castling_rights = merge(new_castling_rights, #{ bq: false }); }
            }
            if dst != () {
                if to == Coords(7, 7) { new_castling_rights = merge(new_castling_rights, #{ wk: false }); }
                if to == Coords(7, 0) { new_castling_rights = merge(new_castling_rights, #{ wq: false }); }
                if to == Coords(0, 7) { new_castling_rights = merge(new_castling_rights, #{ bk: false }); }
                if to == Coords(0, 0) { new_castling_rights = merge(new_castling_rights, #{ bq: false }); }
            }
        }
        let next_turn = if player.id == 0 { 1 } else { 0 };
        return merge(state, #{ board: new_board, turn: next_turn, castling_rights: new_castling_rights, en_passant: new_en_passant });
    }

    if action.type == "select_piece" {
        let pp = state.promotion_pending;
        if pp == () { throw "no promotion pending"; }
        if pp.color != player_color { throw "not your promotion"; }
        let new_board = engine::board::move_piece(state.board, pp.from, pp.to);
        new_board = engine::board::set(new_board, pp.to, action.piece);
        let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.color);
        if is_in_check(new_board, player_color, enemies, state) { throw "promotion leaves king in check"; }
        let next_turn = if player.id == 0 { 1 } else { 0 };
        return merge(state, #{ board: new_board, turn: next_turn, promotion_pending: () });
    }

    if action.type == "cancel" {
        if "promotion_pending" in state && state.promotion_pending != () {
            let pp = state.promotion_pending;
            if pp.color != player_color { throw "not your promotion to cancel"; }
            return merge(state, #{ promotion_pending: () });
        }
        throw "nothing to cancel";
    }
    state
}

fn derive_ui(state, player) {
    if "promotion_pending" in state && state.promotion_pending != () {
        let pp = state.promotion_pending;
        if pp.color == player.color {
            return #{ promotion: #{ type: "piece_picker", cancelable: true, title: "Promote pawn to:",
               pieces: [Piece(pp.color, "queen"), Piece(pp.color, "rook"), Piece(pp.color, "bishop"), Piece(pp.color, "knight")] } };
        }
    }
    #{}
}
