// Minimal board for game-over / king-capture tests.
// Board layout (rows 0-7, cols 0-7):
//   (0,4) black king
//   (1,4) white queen  <- one step from black king
//   (7,4) white king
// White wins by moving queen from (1,4) to (0,4).

fn config() {
    #{
        api_version: 1,
        name: "King Capture Test",
        version: "1.0.0",
        colors: ["white", "black"],
        allowed_player_count: 2,
        board: #{ type: "rectangle", rows: 8, cols: 8 },
        promotion_pieces: ["queen","rook","bishop","knight"],
    }
}

fn init(player_count) {
    let board = board_empty(8, 8);
    board = board_set(board, Coords(0, 4), King("black"));
    board = board_set(board, Coords(1, 4), Queen("white"));
    board = board_set(board, Coords(7, 4), King("white"));
    #{
        board: board,
        players: [
            #{ name: "white", board: 0, color: "white", team: 0 },
            #{ name: "black", board: 0, color: "black", team: 1 },
        ],
        active_players: ["white"],
        game_over: (),
    }
}

fn valid_actions(state, player) {
    []
}

fn apply(state, player, action) {
    // player is a map #{ board, color }
    let player_color = player.color;

    if action.type != "move" { throw "only move actions are supported"; }
    
    // Check turn: active player must match
    let is_active = state.active_players.contains(player_color);
    if !is_active {
        throw "not your turn";
    }

    let src_piece = board_get(state.board, action.from);
    if src_piece == () { throw "no piece at source square"; }
    if src_piece.color != player_color { throw "that piece does not belong to you"; }

    let dst_piece = board_get(state.board, action.to);
    if dst_piece != () && dst_piece.color == player_color { throw "cannot capture your own piece"; }

    let new_board = board_move_piece(state.board, action.from, action.to);

    let game_over = ();
    if dst_piece != () && dst_piece.type == "king" {
        // Find player index
        let player_idx = state.players
            .filter(|p| p.color == player_color)
            .map(|p| p.board)[0];
        game_over = Winner(player_idx);
    }

    let next = if player_color == "white" { "black" } else { "white" };
    state.board = new_board;
    state.active_players = [next];
    state.game_over = game_over;
    state
}
