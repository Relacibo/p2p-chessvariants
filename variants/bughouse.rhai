// Bughouse Chess — API v3
// 2 boards, 4 players, teams. Captured pieces go to partner's reserve.
// Engine reads state.board (array of BoardState).

fn config() {
    #{
        api_version: 3,
        name: "Bughouse",
        version: "1.0.0",
        colors: ["white", "black"],
        allowed_player_count: 4,
        board: #{ type: "rectangle", rows: 8, cols: 8, count: 2 },
    }
}

fn init(player_count) {
    let b0 = standard_start_position();
    let b1 = standard_start_position();
    #{
        // Engine merges array of BoardState into one multi-board BoardState
        board: [b0, b1],
        players: [
            #{ board: 0, color: "white", team: 0, orientation: "normal" },
            #{ board: 0, color: "black", team: 1, orientation: "flipped" },
            #{ board: 1, color: "black", team: 0, orientation: "flipped" },
            #{ board: 1, color: "white", team: 1, orientation: "normal" },
        ],
        // Pieces each player can drop from their reserve: key = "w0", "b0", "w1", "b1"
        reserves: #{ w0: [], b0: [], w1: [], b1: [] },
        turn_order: ["white", "black"],
        current_turn: ["white", "white"],
    }
}

fn reserve_key(color, board_idx) {
    color[0].to_string() + board_idx.to_string()
}

fn partner_key(color, board_idx) {
    let pboard = if board_idx == 0 { 1 } else { 0 };
    let pcolor = if color == "white" { "black" } else { "white" };
    reserve_key(pcolor, pboard)
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
    let turn = state.current_turn[player.board];
    if player.color != turn { return []; }

    let board = state.board[player.board];
    let moves = [];

    // Normal piece moves
    for r in 0..8 {
        for c in 0..8 {
            let piece = engine::board::get(board, Coords(r, c, player.board));
            if piece != () && piece.color == player.color {
                let from = Coords(r, c, player.board);
                let dests = moves_for_piece(board, from, piece.type, player.color);
                for to in dests {
                    let bt = engine::board::get(board, to);
                    if bt != () && bt.color == player.color { continue; }
                    moves.push(Move(from, to));
                }
            }
        }
    }

    // Reserve drops
    let rkey = reserve_key(player.color, player.board);
    if rkey in state.reserves && state.reserves[rkey].len() > 0 {
        for r in 0..8 {
            for c in 0..8 {
                let p = engine::board::get(board, Coords(r, c, player.board));
                if p == () {
                    for i in 0..state.reserves[rkey].len() {
                        moves.push(Move(ReserveCoords(i), Coords(r, c, player.board)));
                    }
                }
            }
        }
    }
    moves
}

fn handle_action(state, player, action) {
    let col = player.color;
    let brd = player.board;
    let turn = state.current_turn[brd];
    if col != turn { throw `${col} cannot move on board ${brd} — it's ${turn}'s turn`; }

    if action.type == "move" {
        let board = state.board[brd];

        if action.from.type == "reserve" {
            // Drop from reserve
            let rkey = reserve_key(col, brd);
            if !(rkey in state.reserves) || state.reserves[rkey].len() <= action.from.index {
                throw "invalid reserve index";
            }
            let piece = state.reserves[rkey][action.from.index];
            let target = engine::board::get(board, action.to);
            if target != () { throw "destination occupied"; }

            state.board[brd] = engine::board::set(board, action.to, piece);

            // Remove from reserve
            let new_res = [];
            for i in 0..state.reserves[rkey].len() {
                if i != action.from.index { new_res.push(state.reserves[rkey][i]); }
            }
            state.reserves[rkey] = new_res;
        } else {
            // Normal move
            let src = engine::board::get(board, action.from);
            if src == () { throw "no piece at source"; }
            if src.color != col { throw "not your piece"; }

            let dst = engine::board::get(board, action.to);
            if dst != () && dst.color == col { throw "cannot capture own piece"; }

            state.board[brd] = engine::board::move_piece(board, action.from, action.to);

            // Captured piece goes to partner's reserve
            if dst != () {
                let pkey = partner_key(col, brd);
                if !(pkey in state.reserves) { state.reserves[pkey] = []; }
                state.reserves[pkey].push(dst);
            }

            // Check king capture on either board
            for b in 0..2 {
                let bb = state.board[b];
                for pl in state.players {
                    if pl.board == b {
                        let kings = engine::board::find(bb, Piece(pl.color, "king"));
                        if kings.len() == 0 {
                            let other_team = if pl.team == 0 { 1 } else { 0 };
                            let winners = state.players.filter(|p| p.team == other_team);
                            state.outcome = Winners(winners.map(|p| p.board));
                            return state;
                        }
                    }
                }
            }
        }

        // Advance turn on this board
        let cur_idx = state.turn_order.index_of(col);
        let next_idx = (cur_idx + 1) % state.turn_order.len();
        state.current_turn[brd] = state.turn_order[next_idx];
    }

    state
}

fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    let has_moves = false;
    for entry in all_valid_moves {
        if entry.moves.len() > 0 { has_moves = true; }
    }
    !has_moves
}

fn get_ui(state, player) {
    let ui = #{};
    let rkey = reserve_key(player.color, player.board);
    if rkey in state.reserves && state.reserves[rkey].len() > 0 {
        ui[`reserve_${rkey}`] = #{
            type: "reserve_pile",
            pieces: state.reserves[rkey],
            board_index: player.board,
        };
    }
    ui
}
