use std::collections::HashMap;

use rhai::Array;

use super::{
    moves,
    state::{BoardCoords, BoardState, Coords},
};

/// Generate all pseudo-move destinations for a piece at `from` (BoardCoords).
/// For combined pieces, unions the destinations of component pieces.
pub fn get_pseudo_move_dests(
    board: &BoardState,
    from: &BoardCoords,
    piece_type: &str,
    color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> Vec<BoardCoords> {
    // Move functions now take Coords; convert back to BoardCoords for internal use.
    fn from_array(arr: Array) -> Vec<BoardCoords> {
        arr.into_iter()
            .filter_map(|d| d.try_cast::<Coords>().and_then(|c| c.as_board_coords()))
            .collect()
    }

    let from_coords = Coords::from(from.clone());

    match piece_type {
        "pawn" => from_array(moves::rhai_pawn_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "rook" => from_array(moves::rhai_rook_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "knight" => from_array(moves::rhai_knight_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "bishop" => from_array(moves::rhai_bishop_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "queen" => from_array(moves::rhai_queen_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "king" => from_array(moves::rhai_king_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        custom => {
            if let Some(parts) = custom_pieces.get(custom) {
                let mut result = Vec::new();
                for part in parts {
                    result.extend(get_pseudo_move_dests(
                        board,
                        from,
                        part,
                        color,
                        custom_pieces,
                    ));
                }
                result.sort_unstable_by_key(|c| (c.row, c.col, c.board_index));
                result.dedup_by_key(|c| (c.row, c.col, c.board_index));
                result
            } else {
                vec![]
            }
        }
    }
}

/// Apply a move on a temporary board copy (for legality checking).
pub fn apply_move_to_board(board: &mut BoardState, from: &BoardCoords, to: &BoardCoords) {
    if let Some(piece) = board.get_piece(from).cloned() {
        board.set_piece(to, Some(piece));
        board.set_piece(from, None);
    }
}

/// Return true if `coords` is attacked by any piece of `by_color`.
pub fn is_square_attacked(
    board: &BoardState,
    coords: &BoardCoords,
    by_color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> bool {
    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let from = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&from) else {
                    continue;
                };
                if piece.color_name() != by_color {
                    continue;
                }
                let dests = get_pseudo_move_dests(
                    board,
                    &from,
                    piece.piece_type_name(),
                    by_color,
                    custom_pieces,
                );
                if dests.iter().any(|d| {
                    d.row == coords.row
                        && d.col == coords.col
                        && d.board_index == coords.board_index
                }) {
                    return true;
                }
            }
        }
    }
    false
}

fn opponent_color(color: &str) -> &'static str {
    match color {
        "white" => "black",
        _ => "white",
    }
}

/// Return true if the king of `color` is in check on this board.
pub fn is_king_in_check(
    board: &BoardState,
    color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> bool {
    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let coords = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&coords) else {
                    continue;
                };
                if piece.color_name() == color && piece.piece_type_name() == "king" {
                    return is_square_attacked(
                        board,
                        &coords,
                        opponent_color(color),
                        custom_pieces,
                    );
                }
            }
        }
    }
    false
}
