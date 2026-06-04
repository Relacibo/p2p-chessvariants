// Minimal board for game-over / king-capture tests.
fn config() { #{ api_version: 1, name: "King Capture Test", version: "2.0.0", colors: ["white", "black"], allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } } }

fn init_static(player_count) {
    #{
        PIECE_DEFS: #{
            "king": [#{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }],
            "queen": [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }],
        }
    }
}

fn get_piece_defs(piece) {
    if piece.type in PIECE_DEFS { return PIECE_DEFS[piece.type]; }
    [];
}

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from); if piece == () { return []; }
    let comps = get_piece_defs(piece); if comps == () || comps.len == 0 { return []; }
    let dests = [];
    for comp in comps { let raw = switch comp.type { "jump"=>engine::moves::jump(board,from,comp.offsets,piece.color), "slide"=>engine::moves::slide(board,from,comp.dirs,piece.color), _=>[] }; for d in raw { dests.push(d); } }
    dests
}

fn init(player_count) {
    let board = engine::board::empty(8, 8);
    board = engine::board::set(board, Coords(0, 4), Piece("black", "king"));
    board = engine::board::set(board, Coords(1, 4), Piece("white", "queen"));
    board = engine::board::set(board, Coords(7, 4), Piece("white", "king"));
     #{ board: board, players: [#{ id: 0, name: "White", team: 0, data: #{ color: "white" } }, #{ id: 1, name: "Black", team: 1, data: #{ color: "black" } }], turn: 0 }
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; } if player.id != state.turn { return []; }
    let candidates = [];
    for r in 0..8 { for c in 0..8 { let from = Coords(r, c); let piece = engine::board::get(state.board, from); if piece != () && piece.color == player.data.color { let dests = get_pseudo_dests(state.board, from, state); for to in dests { candidates.push(Move(from, to)); } } } }
    candidates.filter(|m| { try { handle_action(state, player, m); true } catch(err) { false } })
}

fn derive_game_progress(state, all_valid_moves) { if "outcome" in state { return state.outcome; } InProgress() }

fn handle_action(state, player, action) {
    let player_color = player.data.color; if state.turn != player.id { throw "not your turn"; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from); if src == () { throw "no piece at source square"; } if src.color != player_color { throw "that piece does not belong to you"; }
        let dst = engine::board::get(state.board, action.to); if dst != () && dst.color == player_color { throw "cannot capture your own piece"; }
        let new_board = engine::board::move_piece(state.board, action.from, action.to);
        for p in state.players { let kings = engine::board::find(new_board, Piece(p.data.color, "king")); if kings.len == 0 { let oc = if p.data.color == "white" { "black" } else { "white" }; let wi = state.players.filter(|q| q.data.color == oc).map(|q| q.id)[0]; let wt = state.players.filter(|q| q.id == wi).map(|q| q.team)[0]; return merge(state, #{ board: new_board, outcome: Winner(wt) }); } }
        let next = if player.id == 0 { 1 } else { 0 }; return merge(state, #{ board: new_board, turn: next });
    }
    state
}
