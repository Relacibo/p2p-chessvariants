// Seirawan Chess (S-Chess) - API v2
fn config() { #{ api_version: 1, name: "Seirawan Chess", version: "2.0.0", colors: ["white","black"], allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } } }

const PIECE_DEFS = #{
            "king": [#{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }],
            "queen": [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "rook": [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0]] }],
            "bishop": [#{ type: "slide", dirs: [[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "knight": [#{ type: "jump", offsets: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }],
            "pawn:white": [ #{ type:"jump",offsets:[[-1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-2,0]],condition:|s,f,t|f.row==6&&engine::board::get(s.board,Coords(f.row-1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-1,-1],[-1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
            "pawn:black": [ #{ type:"jump",offsets:[[1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[2,0]],condition:|s,f,t|f.row==1&&engine::board::get(s.board,Coords(f.row+1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[1,-1],[1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
        };

fn get_piece_defs(piece) {
    let color_key = piece.type + ":" + piece.color; if color_key in PIECE_DEFS { return PIECE_DEFS[color_key]; } if piece.type in PIECE_DEFS { return PIECE_DEFS[piece.type]; } []; }

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from); if piece == () { return []; }
    let comps = get_piece_defs(piece); if comps == () || comps.len == 0 { return []; }
    let dests = [];
    for comp in comps { let raw = switch comp.type { "jump"=>engine::moves::jump(board,from,comp.offsets,piece.color), "slide"=>engine::moves::slide(board,from,comp.dirs,piece.color), _=>[] }; if comp.condition!=() { raw=raw.filter(|t|comp.condition(state,from,t)); } for d in raw { dests.push(d); } }
    dests
}

fn sq_attacked_by(board,square,enemy_colors,state) {
    if enemy_colors==()||enemy_colors.len==0 { return false; }
    for r in 0..board.rows { for c in 0..board.cols { let pos=Coords(r,c);let piece=engine::board::get(board,pos);if piece!=()&&enemy_colors.contains(piece.color) { let dests=get_pseudo_dests(board,pos,state);for d in dests { if d==square {return true;} } } } }
    false
}

fn is_in_check(board,king_color,enemy_colors,state) { let k=engine::board::find(board,Piece(king_color,"king"));if k==()||k.len==0 {return false;} sq_attacked_by(board,k[0],enemy_colors,state) }

fn init(player_count) { #{ board: standard_start_position(), players: [#{ id:0,name:"White",team:0,data:#{color:"white"} },#{ id:1,name:"Black",team:1,data:#{color:"black"} }], turn: 0 } }

fn valid_moves(state, player) {
    if player.id != state["turn"] { return []; }
    let candidates = [];
    for r in 0..8 { for c in 0..8 { let piece = engine::board::get(state.board, Coords(r, c)); if piece != () && piece.color == player.data.color { let from = Coords(r, c); let dests = get_pseudo_dests(state.board, from, state); for to in dests { candidates.push(Move(from, to)); } } } }
    candidates.filter(|m| { try { handle_action(state, player, m); true } catch(err) { false } })
}

fn derive_game_progress(state, all_valid_moves) { for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } } Draw() }

fn handle_action(state, player, action) {
    let player_color = player.data.color; if state["turn"] != player.id { throw "not active"; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from); if src == () { throw "no piece"; } if src.color != player_color { throw "not yours"; }
        let dst = engine::board::get(state.board, action.to); if dst != () && dst.color == player_color { throw "own piece"; }
        let b = engine::board::move_piece(state.board, action.from, action.to);
        let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.data.color); if enemies.len == 0 { enemies = state.players.filter(|p| p.data.color != player_color).map(|p| p.data.color); }
        if is_in_check(b, player_color, enemies, state) { throw "leaves king in check"; }
        for p in state.players { let kings = engine::board::find(b, Piece(p.data.color, "king")); if kings.len == 0 { let oc = if p.data.color == "white" { "black" } else { "white" }; let wi = state.players.filter(|q| q.data.color == oc).map(|q| q.id)[0]; let wt = state.players.filter(|q| q.id == wi).map(|q| q.team)[0]; state.board = b; state["outcome"] = Winner(wt); return state; } }
        let next = if player.id == 0 { 1 } else { 0 }; state.board = b; state["turn"] = next; return state;
    }
    state
}
