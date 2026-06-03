use std::collections::HashMap;

use super::{
    moves,
    state::{BoardCoords, BoardState},
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
    match piece_type {
        "pawn"   => moves::pawn_dests(board, from, color),
        "rook"   => moves::rook_dests(board, from, color),
        "knight" => moves::knight_dests(board, from, color),
        "bishop" => moves::bishop_dests(board, from, color),
        "queen"  => moves::queen_dests(board, from, color),
        "king"   => moves::king_dests(board, from, color),
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

/// Return true if the king of `king_color` is in check on this board.
///
/// `enemy_colors` lists all colors that attack the king (players on opposing teams).
/// If `enemy_colors` is empty, the king is never considered in check.
pub fn is_king_in_check(
    board: &BoardState,
    king_color: &str,
    enemy_colors: &[String],
    custom_pieces: &HashMap<String, Vec<String>>,
) -> bool {
    if enemy_colors.is_empty() {
        return false;
    }
    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let coords = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&coords) else {
                    continue;
                };
                if piece.color_name() == king_color && piece.piece_type_name() == "king" {
                    return enemy_colors.iter().any(|ec| {
                        is_square_attacked(board, &coords, ec, custom_pieces)
                    });
                }
            }
        }
    }
    false
}
