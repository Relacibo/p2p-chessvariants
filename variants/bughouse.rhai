// Bughouse Chess - API v2
fn config() { #{ api_version:1, name:"Bughouse", version:"2.0.0", colors:["white","black"], allowed_player_count:4, board: #{ type:"rectangle", rows:8, cols:8, count:2 } } }

fn init_static(player_count) {
    #{
        PIECE_DEFS: #{
            "king": [#{ type:"jump",offsets:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }],
            "queen": [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "rook": [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0]] }],
            "bishop": [#{ type:"slide",dirs:[[1,1],[1,-1],[-1,1],[-1,-1]] }],
            "knight": [#{ type:"jump",offsets:[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }],
            "pawn:white": [ #{ type:"jump",offsets:[[-1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-2,0]],condition:|s,f,t|f.row==6&&engine::board::get(s.board,Coords(f.row-1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[-1,-1],[-1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
            "pawn:black": [ #{ type:"jump",offsets:[[1,0]],condition:|s,f,t|engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[2,0]],condition:|s,f,t|f.row==1&&engine::board::get(s.board,Coords(f.row+1,f.col))==()&&engine::board::get(s.board,t)==() }, #{ type:"jump",offsets:[[1,-1],[1,1]],condition:|s,f,t|{let x=engine::board::get(s.board,t);let y=engine::board::get(s.board,f);x==()||x.color!=y.color} } ],
        }
    }
}
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
    let b0=standard_start_position();let b1=standard_start_position();
    #{ board:[b0,b1], players:[#{id:0,name:"White A",board:0,color:"white",team:0,orientation:"normal"},#{id:1,name:"Black A",board:0,color:"black",team:1,orientation:"flipped"},#{id:2,name:"White B",board:1,color:"white",team:1,orientation:"normal"},#{id:3,name:"Black B",board:1,color:"black",team:0,orientation:"flipped"}], reserves:#{w0:[],b0:[],w1:[],b1:[]}, turn_order:[[0,1],[2,3]], current_turn:[0,2] }
}

fn reserve_key(color, board_idx) { color[0].to_string() + board_idx.to_string() }
fn partner_key(color, board_idx) { let pboard = if board_idx == 0 { 1 } else { 0 }; let pcolor = if color == "white" { "black" } else { "white" }; reserve_key(pcolor, pboard) }

fn valid_moves(state, player) {
    if "outcome" in state { return []; } let current = state.current_turn[player.board]; if player.id != current { return []; }
    let board = state.board[player.board]; let moves = []; let cond_state = #{ board: board };
    let pieces = engine::board::find_by_color(board, player.color);
    for entry in pieces { let from_local = entry.coords; let dests = get_pseudo_dests(board, from_local, cond_state); for to_local in dests { let bt = engine::board::get(board, to_local); if bt != () && bt.color == player.color { continue; } moves.push(Move(Coords(from_local.row,from_local.col,player.board),Coords(to_local.row,to_local.col,player.board))); } }
    let rkey = reserve_key(player.color, player.board);
    if rkey in state.reserves && state.reserves[rkey].len > 0 { for r in 0..8 { for c in 0..8 { let p = engine::board::get(board, Coords(r,c)); if p == () { for i in 0..state.reserves[rkey].len { moves.push(Move(ReserveCoords(i),Coords(r,c,player.board))); } } } } }
    moves
}

fn handle_action(state, player, action) {
    let col = player.color; let brd = player.board; let turn = state.current_turn[brd]; if player.id != turn { throw `player ${player.id} cannot move on board ${brd} — it's player ${turn}'s turn`; }
    if action.type == "move" {
        let board = state.board[brd];
        if action.from.type == "reserve" {
            let rkey = reserve_key(col, brd); if !(rkey in state.reserves) || state.reserves[rkey].len <= action.from.index { throw "invalid reserve index"; }
            let piece = state.reserves[rkey][action.from.index]; let to = Coords(action.to.row, action.to.col); let target = engine::board::get(board, to); if target != () { throw "destination occupied"; }
            state.board[brd] = engine::board::set(board, to, piece);
            let new_res = []; for i in 0..state.reserves[rkey].len { if i != action.from.index { new_res.push(state.reserves[rkey][i]); } }
            state.reserves[rkey] = new_res;
        } else {
            let from = Coords(action.from.row, action.from.col); let to = Coords(action.to.row, action.to.col); let src = engine::board::get(board, from); if src == () { throw "no piece at source"; } if src.color != col { throw "not your piece"; }
            let dst = engine::board::get(board, to); if dst != () && dst.color == col { throw "cannot capture own piece"; }
            state.board[brd] = engine::board::move_piece(board, from, to);
            if dst != () { let pkey = partner_key(col, brd); if !(pkey in state.reserves) { state.reserves[pkey] = []; } state.reserves[pkey].push(dst); }
            for b in 0..2 { let bb = state.board[b]; for pl in state.players { if pl.board == b { let kings = engine::board::find(bb, Piece(pl.color, "king")); if kings.len == 0 { let other_team = if pl.team == 0 { 1 } else { 0 }; state.outcome = Winner(other_team); return state; } } } }
        }
        let turn_order = state.turn_order[brd]; let cur_idx = turn_order.index_of(player.id); let next_idx = (cur_idx + 1) % turn_order.len; state.current_turn[brd] = turn_order[next_idx];
    }
    state
}

fn derive_game_progress(state, all_valid_moves) { if "outcome" in state { return state.outcome; } for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } } Draw() }

fn derive_ui(state, player) {
    let ui = #{};
    for p in state.players { let rkey = reserve_key(p.color, p.board); if rkey in state.reserves && state.reserves[rkey].len > 0 { ui[`reserve_${rkey}`] = #{ type:"reserve_pile", pieces:state.reserves[rkey], board_index:p.board }; } }
    ui
}
