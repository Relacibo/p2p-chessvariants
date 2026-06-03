// Bughouse Chess — API v3
// 2 boards, 4 players, teams. Captured pieces go to partner's reserve.

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
        boards: [b0, b1],
        players: [
            #{ board: 0, color: "white", team: 0, orientation: "normal" },
            #{ board: 0, color: "black", team: 1, orientation: "flipped" },
            #{ board: 1, color: "white", team: 1, orientation: "normal" },
            #{ board: 1, color: "black", team: 0, orientation: "flipped" },
        ],
        // Pieces each player can drop from their reserve
        reserves: #{ w0: [], b0: [], w1: [], b1: [] },
        turns: [["white", "black"], ["white", "black"]], // turn order per board
        current_turn: ["white", "white"], // current player on each board
        // Track which board the last move happened on
        active_board: 0,
    }
}

fn reserve_key(color, board) {
    color[0].to_string() + board.to_string()
}

fn partner_key(color, board) {
    // Partner: opposite color on the OTHER board
    let pboard = if board == 0 { 1 } else { 0 };
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

fn board_idx_for_player(state, player) {
    player.board
}

fn get_board(state, board_idx) {
    if board_idx == 0 { state.boards[0] }
    else { state.boards[1] }
}

fn set_board(state, board_idx, new_board) {
    if board_idx == 0 {
        state.boards[0] = new_board;
    } else {
        state.boards[1] = new_board;
    }
}

fn valid_moves(state, player) {
    if "outcome" in state { return []; }
    let turn = state.current_turn[player.board];
    if player.color != turn { return []; }

    let board = get_board(state, player.board);
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

    // Reserve drops: place captured pieces on empty squares
    let rkey = reserve_key(player.color, player.board);
    if rkey in state.reserves && state.reserves[rkey].len() > 0 {
        for r in 0..8 {
            for c in 0..8 {
                let p = engine::board::get(board, Coords(r, c, player.board));
                if p == () {
                    // can drop any reserve piece here
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
        let board = get_board(state, brd);

        if action.from.type == "reserve" {
            // Drop from reserve
            let rkey = reserve_key(col, brd);
            if !(rkey in state.reserves) || state.reserves[rkey].len() <= action.from.index {
                throw "invalid reserve index";
            }
            let piece = state.reserves[rkey][action.from.index];
            let target = engine::board::get(board, action.to);
            if target != () { throw "destination occupied"; }

            // Place piece on board
            let new_board = engine::board::set(board, action.to, piece);
            set_board(state, brd, new_board);

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

            let new_board = engine::board::move_piece(board, action.from, action.to);

            // Captured piece goes to partner's reserve
            if dst != () {
                let pkey = partner_key(col, brd);
                if !(pkey in state.reserves) { state.reserves[pkey] = []; }
                state.reserves[pkey].push(dst);
            }

            set_board(state, brd, new_board);

            // Check king capture on either board
            for b in 0..2 {
                let bb = get_board(state, b);
                for pl in state.players {
                    if pl.board == b {
                        let kings = engine::board::find(bb, Piece(pl.color, "king"));
                        if kings.len() == 0 {
                            // Find the other team's players
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
        let order = state.turns[brd];
        let cur_idx = order.index_of(col);
        let next_idx = (cur_idx + 1) % order.len();
        state.current_turn[brd] = order[next_idx];
        state.active_board = brd;
    }

    state
}

fn is_game_over(state, all_valid_moves) {
    if "outcome" in state { return true; }
    // Game over when no one on either board can move
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
