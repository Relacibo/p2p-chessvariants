// Seirawan Chess (S-Chess) — API v1
fn config() {
    #{ api_version: 1, name: "Seirawan Chess", version: "1.0.0", colors: ["white","black"], allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}
fn init(player_count) {
    #{ board: standard_start_position(), players: [#{ id: 0, name: "White", board: 0, color: "white", team: 0 },#{ id: 1, name: "Black", board: 0, color: "black", team: 1 }], turn: 0 }
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
    for r in 0..8 { for c in 0..8 {
        let piece = engine::board::get(state.board, Coords(r, c));
        if piece != () && piece.color == player.color {
            let from = Coords(r, c);
            let dests = moves_for_piece(state.board, from, piece.type, player.color);
            for to in dests { candidates.push(Move(from, to)); }
        }
    }}
    candidates.filter(|m| {
        try { handle_action(state, player, m); true }
        catch(err) { false }
    })
}
fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    for entry in all_valid_moves { if entry.moves.len > 0 { return false; } }
    true
}
fn handle_action(state, player, action) {
    let player_color = player.color;
    if state.turn != player.id { throw "not active"; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from);
        if src == () { throw "no piece"; }
        if src.color != player_color { throw "not yours"; }
        let dst = engine::board::get(state.board, action.to);
        if dst != () && dst.color == player_color { throw "own piece"; }
        let b = engine::board::move_piece(state.board, action.from, action.to);
        let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.color);
        if enemies.len == 0 {
            enemies = state.players.filter(|p| p.color != player_color).map(|p| p.color);
        }
        if is_in_check(b, player_color, enemies) { throw "leaves king in check"; }
        for p in state.players {
            let kings = engine::board::find(b, Piece(p.color, "king"));
            if kings.len == 0 {
                let oc = if p.color == "white" { "black" } else { "white" };
                let wi = state.players.filter(|q| q.color == oc).map(|q| q.board)[0];
                return merge(state, #{ board: b, outcome: Winner(wi) });
            }
        }
        let next = if player.id == 0 { 1 } else { 0 };
        return merge(state, #{ board: b, turn: next });
    }
    state
}
