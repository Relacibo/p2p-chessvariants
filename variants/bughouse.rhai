// Bughouse Chess - API v2
fn config() { #{ api_version:1, name:"Bughouse", version:"2.0.0", colors:["white","black"], allowed_player_count:4, board: #{ type:"rectangle", rows:8, cols:8, count:2 } } }

let PIECE_DEFS = PieceDefs([
    #{ type: "king",   def: [#{ type:"jump",offsets:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }] },
    #{ type: "queen",  def: [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "rook",   def: [#{ type:"slide",dirs:[[0,1],[0,-1],[1,0],[-1,0]] }] },
    #{ type: "bishop", def: [#{ type:"slide",dirs:[[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "knight", def: [#{ type:"jump",offsets:[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }] },
    #{ type: "pawn", color: "white", def: [ #{ type:"jump",offsets:[[-1,0]],move_type:"move" }, #{ type:"jump",offsets:[[-2,0]],move_type:"move",condition:|s,f,t|f.row==6&&engine::board::get(s.board,Coords(f.row-1,f.col))==() }, #{ type:"jump",offsets:[[-1,-1],[-1,1]],move_type:"capture" } ] },
    #{ type: "pawn", color: "black", def: [ #{ type:"jump",offsets:[[1,0]],move_type:"move" }, #{ type:"jump",offsets:[[2,0]],move_type:"move",condition:|s,f,t|f.row==1&&engine::board::get(s.board,Coords(f.row+1,f.col))==() }, #{ type:"jump",offsets:[[1,-1],[1,1]],move_type:"capture" } ] },
]);

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from); if piece == () { return []; }
    let comps = PIECE_DEFS.get(piece); if comps == () { return []; }
    let dests = [];
    for comp in comps { let mt = comp.move_type; let raw = switch comp.type { "jump"=>engine::moves::jump(board,from,comp.offsets,piece.color,mt), "slide"=>engine::moves::slide(board,from,comp.dirs,piece.color,mt), _=>[] }; if comp.condition!=() { raw=raw.filter(|t|comp.condition(state,from,t)); } for d in raw { dests.push(d); } }
    dests
}

fn setup_players(variant_config, player_count) {
    #{
        players: [
            #{ id: 0, name: "White A", team: 0, data: #{ color: "white", board: 0 } },
            #{ id: 1, name: "Black A", team: 1, data: #{ color: "black", board: 0 } },
            #{ id: 2, name: "White B", team: 1, data: #{ color: "white", board: 1 } },
            #{ id: 3, name: "Black B", team: 0, data: #{ color: "black", board: 1 } },
        ]
    }
}

fn init(variant_config, setup) {
    let b0 = standard_start_position();
    let b1 = standard_start_position();
    #{
        board: [b0, b1],
        data: #{ reserves: #{ w0: [], b0: [], w1: [], b1: [] }, turn_order: [[0, 1], [2, 3]], current_turn: [0, 2] }
    }
}

fn reserve_key(color, board_idx) { color[0].to_string() + board_idx.to_string() }
fn partner_key(color, board_idx) { let pboard = if board_idx == 0 { 1 } else { 0 }; let pcolor = if color == "white" { "black" } else { "white" }; reserve_key(pcolor, pboard) }

fn valid_moves(state, player) {
    let current = state["current_turn"][player.data.board]; if player.id != current { return []; }
    let board = state.board[player.data.board]; let moves = []; let cond_state = #{ board: board };
    let pieces = engine::board::find_by_color(board, player.data.color);
    for entry in pieces {
        let from = entry.coords; let dests = get_pseudo_dests(board, from, cond_state);
        for to in dests { moves.push(Move(from, to)); }
    }
    // Drop moves from reserve
    let rk = reserve_key(player.data.color, player.data.board);
    if state["reserves"][rk].len > 0 {
        for r in 0..board.rows { for c in 0..board.cols { let to = Coords(r, c); if engine::board::get(board, to) == () { moves.push(Move(ReserveCoords(0), to)); } } }
    }
    moves
}

fn handle_action(state, player, action) {
    if action.type == "move" {
        let board_idx = player.data.board;
        let current = state["current_turn"][board_idx]; if player.id != current { throw "not your turn"; }
        let board = state.board[board_idx];
        if action.from.type == "reserve" {
            let rk = reserve_key(player.data.color, board_idx); if state["reserves"][rk].len == 0 { throw "no reserve pieces"; }
            let dst = engine::board::get(board, action.to); if dst != () { throw "destination occupied"; }
            let piece_list = state["reserves"][rk]; let piece = piece_list[0];
            state["reserves"][rk] = piece_list.splice(1, piece_list.len - 1);
            let new_board = engine::board::set(board, action.to, piece);
            state.board[board_idx] = new_board;
        } else {
            let src = engine::board::get(board, action.from); if src == () { throw "no piece"; }
            let dst = engine::board::get(board, action.to);
            let new_board = engine::board::move_piece(board, action.from, action.to);
            if dst != () && dst.color != player.data.color {
                // Captured piece goes to partner's reserve
                let pk = partner_key(player.data.color, board_idx);
                state["reserves"][pk].push(Piece(dst.color, dst.type));
            }
            state.board[board_idx] = new_board;
        }
        let partner = if board_idx == 0 { 3 } else { 1 };
        state["current_turn"][board_idx] = partner;
    }
    state
}

fn derive_game_progress(state, all_valid_moves) { for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } } Draw() }
