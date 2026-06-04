// 4-Player Chess - API v2
fn config() { #{ api_version: 1, name: "4-Player Chess", version: "2.0.0", colors: ["red","blue","yellow","green"], allowed_player_count: 4, board: #{ type: "rectangle", rows: 14, cols: 14, disabled_rects: [#{ r1:0,c1:0,r2:3,c2:3 },#{ r1:0,c1:11,r2:3,c2:3 },#{ r1:11,c1:0,r2:3,c2:3 },#{ r1:11,c1:11,r2:3,c2:3 }] } } }

fn build_piece_defs() { #{ king: [#{ type:"jump",offsets:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }], queen: [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }], rook: [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0]] }], bishop: [#{ type:"slide",dirs:[[1,1],[1,-1],[-1,1],[-1,-1]] }], knight: [#{ type:"jump",offsets:[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }] } }

fn build_color_piece_defs() {
    #{ yellow: #{ pawn: [ #{ type:"jump",offsets:[[1,0]],cond:"cond_push_empty" }, #{ type:"jump",offsets:[[2,0]],cond:"cond_double_yellow" }, #{ type:"jump",offsets:[[1,-1],[1,1]],cond:"cond_capture" } ]},
       green:  #{ pawn: [ #{ type:"jump",offsets:[[0,-1]],cond:"cond_push_empty" }, #{ type:"jump",offsets:[[0,-2]],cond:"cond_double_green" }, #{ type:"jump",offsets:[[-1,-1],[1,-1]],cond:"cond_capture" } ]},
       red:    #{ pawn: [ #{ type:"jump",offsets:[[-1,0]],cond:"cond_push_empty" }, #{ type:"jump",offsets:[[-2,0]],cond:"cond_double_red" }, #{ type:"jump",offsets:[[-1,-1],[-1,1]],cond:"cond_capture" } ]},
       blue:   #{ pawn: [ #{ type:"jump",offsets:[[0,1]],cond:"cond_push_empty" }, #{ type:"jump",offsets:[[0,2]],cond:"cond_double_blue" }, #{ type:"jump",offsets:[[-1,1],[1,1]],cond:"cond_capture" } ]} }
}

fn cond_push_empty(s,f,t) { engine::board::get(s.board,t)==() }
fn cond_double_yellow(s,f,t) { f.row==1 && engine::board::get(s.board,Coords(f.row+1,f.col))==() && engine::board::get(s.board,t)==() }
fn cond_double_green(s,f,t) { f.col==12 && engine::board::get(s.board,Coords(f.row,f.col-1))==() && engine::board::get(s.board,t)==() }
fn cond_double_red(s,f,t) { f.row==12 && engine::board::get(s.board,Coords(f.row-1,f.col))==() && engine::board::get(s.board,t)==() }
fn cond_double_blue(s,f,t) { f.col==1 && engine::board::get(s.board,Coords(f.row,f.col+1))==() && engine::board::get(s.board,t)==() }
fn cond_capture(s,f,t) { let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x!=()&&x.color!=y.color }

fn get_piece_defs(piece, state) { if piece.color in state.color_piece_defs && piece.type in state.color_piece_defs[piece.color] { return state.color_piece_defs[piece.color][piece.type]; } if piece.type in state.piece_defs { return state.piece_defs[piece.type]; } []; }

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from); if piece == () { return []; }
    let comps = get_piece_defs(piece, state); if comps == () || comps.len == 0 { return []; }
    let dests = [];
    for comp in comps { let raw = switch comp.type { "jump"=>engine::moves::jump(board,from,comp.offsets,piece.color), "slide"=>engine::moves::slide(board,from,comp.dirs,piece.color), _=>[] }; if comp.cond!=() { raw=switch comp.cond{"cond_push_empty"=>raw.filter(|t|cond_push_empty(state,from,t)),"cond_double_yellow"=>raw.filter(|t|cond_double_yellow(state,from,t)),"cond_double_green"=>raw.filter(|t|cond_double_green(state,from,t)),"cond_double_red"=>raw.filter(|t|cond_double_red(state,from,t)),"cond_double_blue"=>raw.filter(|t|cond_double_blue(state,from,t)),"cond_capture"=>raw.filter(|t|cond_capture(state,from,t)),_=>raw}; } for d in raw { dests.push(d); } }
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
    #{ board: board, players: [#{id:0,name:"Yellow",board:0,color:"yellow",team:0},#{id:1,name:"Green",board:0,color:"green",team:1},#{id:2,name:"Red",board:0,color:"red",team:2},#{id:3,name:"Blue",board:0,color:"blue",team:3}], teams: [#{id:0,orientations:[#{board:0,orientation:"flipped"}]},#{id:1,orientations:[#{board:0,orientation:"clockwise"}]},#{id:2,orientations:[#{board:0,orientation:"normal"}]},#{id:3,orientations:[#{board:0,orientation:"counterclockwise"}]}], turn:2, turn_order:[2,3,0,1], piece_defs:build_piece_defs(), color_piece_defs:build_color_piece_defs() }
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; } if player.id != state.turn { return []; }
    let moves = [];
    for r in 0..14 { for c in 0..14 { let piece = engine::board::get(state.board, Coords(r, c)); if piece != () && piece.color == player.color { let from = Coords(r, c); let dests = get_pseudo_dests(state.board, from, state); for to in dests { let bt = engine::board::get(state.board, to); if bt != () && bt.color == player.color { continue; } moves.push(Move(from, to)); } } } }
    moves
}

fn handle_action(state, player, action) {
    if state.turn != player.id { throw `not ${player.id}'s turn`; }
    if action.type == "move" {
        let src = engine::board::get(state.board, action.from); if src == () { throw "no piece there"; } if src.color != player.color { throw "not yours"; }
        let dst = engine::board::get(state.board, action.to); if dst != () && dst.color == player.color { throw "own piece"; }
        state.board = engine::board::move_piece(state.board, action.from, action.to);
        for p in state.players { let kings = engine::board::find(state.board, Piece(p.color, "king")); if kings.len == 0 { let survivors = state.players.filter(|q| q.color != p.color); state.outcome = Winners(survivors.map(|q| q.id)); return state; } }
        let idx = state.turn_order.index_of(player.id); state.turn = state.turn_order[(idx + 1) % 4];
    }
    state
}

fn is_game_over(state, all_valid_moves) { if "outcome" in state { return true; } for entry in all_valid_moves { if entry.moves.len > 0 { return false; } } true }
