// 4-Player Chess - API v2
fn config() { #{ api_version: 1, name: "4-Player Chess", version: "2.0.0", colors: ["red","blue","yellow","green"], allowed_player_count: 4, board: #{ type: "rectangle", rows: 14, cols: 14, disabled_rects: [#{ r1:0,c1:0,r2:3,c2:3 },#{ r1:0,c1:11,r2:3,c2:3 },#{ r1:11,c1:0,r2:3,c2:3 },#{ r1:11,c1:11,r2:3,c2:3 }] } } }

const PIECE_DEFS = #{
            "king": [#{ type:"jump",offsets:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }],
            "queen": [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "rook": [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0]] }],
            "bishop": [#{ type:"slide",dirs:[[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "knight": [#{ type:"jump",offsets:[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }],
            "pawn:yellow": [ #{ type:"jump",offsets:[[1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[2,0]],condition:|s,f,t|f.row==1&&engine::board::get(s.board,Coords(f.row+1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[1,-1],[1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
            "pawn:green":  [ #{ type:"jump",offsets:[[0,-1]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[0,-2]],condition:|s,f,t|f.col==12&&engine::board::get(s.board,Coords(f.row,f.col-1))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-1,-1],[1,-1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
            "pawn:red":    [ #{ type:"jump",offsets:[[-1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-2,0]],condition:|s,f,t|f.row==12&&engine::board::get(s.board,Coords(f.row-1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-1,-1],[-1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
            "pawn:blue":   [ #{ type:"jump",offsets:[[0,1]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[0,2]],condition:|s,f,t|f.col==1&&engine::board::get(s.board,Coords(f.row,f.col+1))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-1,1],[1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
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

fn init(player_count) {
    let board = board_empty(14, 14);
    let yb=[Piece("yellow","rook"),Piece("yellow","knight"),Piece("yellow","bishop"),Piece("yellow","queen"),Piece("yellow","king"),Piece("yellow","bishop"),Piece("yellow","knight"),Piece("yellow","rook")];
    for i in 0..yb.len{board=engine::board::set(board,Coords(0,3+i,0),yb[i]);board=engine::board::set(board,Coords(1,3+i,0),Piece("yellow","pawn"))}
    let gb=[Piece("green","rook"),Piece("green","knight"),Piece("green","bishop"),Piece("green","queen"),Piece("green","king"),Piece("green","bishop"),Piece("green","knight"),Piece("green","rook")];
    for i in 0..gb.len{board=engine::board::set(board,Coords(3+i,13,0),gb[i]);board=engine::board::set(board,Coords(3+i,12,0),Piece("green","pawn"))}
    let rb=[Piece("red","rook"),Piece("red","knight"),Piece("red","bishop"),Piece("red","queen"),Piece("red","king"),Piece("red","bishop"),Piece("red","knight"),Piece("red","rook")];
    for i in 0..rb.len{board=engine::board::set(board,Coords(13,3+i,0),rb[i]);board=engine::board::set(board,Coords(12,3+i,0),Piece("red","pawn"))}
    let bb=[Piece("blue","rook"),Piece("blue","knight"),Piece("blue","bishop"),Piece("blue","queen"),Piece("blue","king"),Piece("blue","bishop"),Piece("blue","knight"),Piece("blue","rook")];
    for i in 0..bb.len{board=engine::board::set(board,Coords(3+i,0,0),bb[i]);board=engine::board::set(board,Coords(3+i,1,0),Piece("blue","pawn"))}
     #{ board: board, players: [#{id:0,name:"Yellow",team:0,data:#{color:"yellow"}},#{id:1,name:"Green",team:1,data:#{color:"green"}},#{id:2,name:"Red",team:2,data:#{color:"red"}},#{id:3,name:"Blue",team:3,data:#{color:"blue"}}], teams: [#{id:0,orientations:[#{board:0,orientation:"flipped"}]},#{id:1,orientations:[#{board:0,orientation:"clockwise"}]},#{id:2,orientations:[#{board:0,orientation:"normal"}]},#{id:3,orientations:[#{board:0,orientation:"counterclockwise"}]}], turn:2, turn_order:[2,3,0,1] }
}

fn valid_moves(state, player) {
    if player.id != state["turn"] { return []; }
    let moves = [];
    for r in 0..14 { for c in 0..14 { let piece = engine::board::get(state.board, Coords(r, c)); if piece != () && piece.color == player.data.color { let from = Coords(r, c); let dests = get_pseudo_dests(state.board, from, state); for to in dests { let bt = engine::board::get(state.board, to); if bt != () && bt.color == player.data.color { continue; } moves.push(Move(from, to)); } } } }
    moves
}

fn handle_action(state, player, action) {
    if state["turn"] != player.id { throw `not ${player.id}'s turn`; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from); if src == () { throw "no piece there"; } if src.color != player.data.color { throw "not yours"; }
        let dst = engine::board::get(state.board, action.to); if dst != () && dst.color == player.data.color { throw "own piece"; }
        state.board = engine::board::move_piece(state.board, action.from, action.to);
        for p in state.players { let kings = engine::board::find(state.board, Piece(p.data.color, "king")); if kings.len == 0 { let survivors = state.players.filter(|q| q.data.color != p.data.color); state["outcome"] = Winner(survivors[0].team); return state; } }
        let idx = state["turn_order"].index_of(player.id); state["turn"] = state["turn_order"][(idx + 1) % 4];
    }
    state
}

fn derive_game_progress(state, all_valid_moves) { for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } } Draw() }
