use super::{
    moves,
    piece_definition::{MoveComponent, PieceDefinition, PieceDefinitionMap},
    state::{BoardCoords, BoardState},
};

/// Generate all pseudo-move destinations for a piece at `from` (BoardCoords).
/// For `Parts` pieces, unions the destinations of all named component pieces.
/// For `Components` pieces, generates destinations from each MoveComponent.
pub fn get_pseudo_move_dests(
    board: &BoardState,
    from: &BoardCoords,
    piece_type: &str,
    color: &str,
    piece_defs: &PieceDefinitionMap,
) -> Vec<BoardCoords> {
    match piece_type {
        "pawn"   => moves::pawn_dests(board, from, color),
        "rook"   => moves::rook_dests(board, from, color),
        "knight" => moves::knight_dests(board, from, color),
        "bishop" => moves::bishop_dests(board, from, color),
        "queen"  => moves::queen_dests(board, from, color),
        "king"   => moves::king_dests(board, from, color),
        custom => {
            match piece_defs.get(custom) {
                Some(PieceDefinition::Parts(parts)) => {
                    let mut result = Vec::new();
                    for part in parts {
                        result.extend(get_pseudo_move_dests(
                            board,
                            from,
                            part,
                            color,
                            piece_defs,
                        ));
                    }
                    result.sort_unstable_by_key(|c| (c.row, c.col, c.board_index));
                    result.dedup_by_key(|c| (c.row, c.col, c.board_index));
                    result
                }
                Some(PieceDefinition::Components(components)) => {
                    let mut result = Vec::new();
                    for component in components {
                        match component {
                            MoveComponent::Slide { dirs } => {
                                result.extend(moves::slides(board, from, dirs, color));
                            }
                            MoveComponent::Jump { offsets, board_delta } => {
                                result.extend(moves::jumps(
                                    board,
                                    from,
                                    offsets,
                                    color,
                                    *board_delta,
                                ));
                            }
                        }
                    }
                    result.sort_unstable_by_key(|c| (c.row, c.col, c.board_index));
                    result.dedup_by_key(|c| (c.row, c.col, c.board_index));
                    result
                }
                None => vec![],
            }
        }
    }
}

/// Return true if `coords` is attacked by any piece of `by_color`.
pub fn is_square_attacked(
    board: &BoardState,
    coords: &BoardCoords,
    by_color: &str,
    piece_defs: &PieceDefinitionMap,
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
                    piece_defs,
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
pub fn is_in_check(
    board: &BoardState,
    king_color: &str,
    enemy_colors: &[String],
    piece_defs: &PieceDefinitionMap,
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
                        is_square_attacked(board, &coords, ec, piece_defs)
                    });
                }
            }
        }
    }
    false
}
