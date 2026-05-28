use rhai::{Array, Dynamic};

use super::state::{BoardCoords, BoardState};

fn push_coord(result: &mut Vec<BoardCoords>, coords: BoardCoords) {
    result.push(coords);
}

fn board_piece_color<'a>(board: &'a BoardState, coords: &BoardCoords) -> Option<&'a str> {
    board.get_piece(coords).map(|piece| piece.color_name())
}

fn to_array(coords: Vec<BoardCoords>) -> Array {
    coords.into_iter().map(Dynamic::from).collect()
}

fn push_if_targetable(board: &BoardState, coords: BoardCoords, color: &str, result: &mut Vec<BoardCoords>) {
    if !board.in_bounds(&coords) {
        return;
    }

    match board_piece_color(board, &coords) {
        None => push_coord(result, coords),
        Some(piece_color) if piece_color != color => push_coord(result, coords),
        _ => {}
    }
}

pub fn slides(board: &BoardState, from: &BoardCoords, directions: &[(i32, i32)], color: &str) -> Vec<BoardCoords> {
    if !board.in_bounds(from) {
        return Vec::new();
    }

    let mut result = Vec::new();
    for (dr, dc) in directions {
        let mut row = from.row + dr;
        let mut col = from.col + dc;
        loop {
            let coords = BoardCoords::new(row, col, from.board_index);
            if !board.in_bounds(&coords) {
                break;
            }

            match board_piece_color(board, &coords) {
                None => result.push(coords),
                Some(piece_color) if piece_color != color => {
                    result.push(coords);
                    break;
                }
                Some(_) => break,
            }

            row += dr;
            col += dc;
        }
    }
    result
}

pub fn rhai_pawn_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    if !board.in_bounds(&from) {
        return Array::new();
    }

    let direction = match color.as_str() {
        "white" => -1,
        "black" => 1,
        _ => return Array::new(),
    };
    let start_row = if color == "white" {
        board.rows as i32 - 2
    } else {
        1
    };

    let mut result = Vec::new();
    let one_forward = BoardCoords::new(from.row + direction, from.col, from.board_index);
    if board.in_bounds(&one_forward) && board.get_piece(&one_forward).is_none() {
        result.push(one_forward.clone());

        let two_forward = BoardCoords::new(from.row + 2 * direction, from.col, from.board_index);
        if from.row == start_row
            && board.in_bounds(&two_forward)
            && board.get_piece(&two_forward).is_none()
        {
            result.push(two_forward);
        }
    }

    for dc in [-1, 1] {
        let target = BoardCoords::new(from.row + direction, from.col + dc, from.board_index);
        if !board.in_bounds(&target) {
            continue;
        }
        let Some(piece) = board.get_piece(&target) else {
            continue;
        };
        if piece.color_name() != color {
            result.push(target);
        }
    }

    to_array(result)
}

pub fn rhai_rook_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    to_array(slides(&board, &from, &[(1, 0), (-1, 0), (0, 1), (0, -1)], &color))
}

pub fn rhai_knight_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    if !board.in_bounds(&from) {
        return Array::new();
    }

    let offsets = [
        (-2, -1),
        (-2, 1),
        (-1, -2),
        (-1, 2),
        (1, -2),
        (1, 2),
        (2, -1),
        (2, 1),
    ];
    let mut result = Vec::new();
    for (dr, dc) in offsets {
        push_if_targetable(&board, BoardCoords::new(from.row + dr, from.col + dc, from.board_index), &color, &mut result);
    }
    to_array(result)
}

pub fn rhai_bishop_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    to_array(slides(&board, &from, &[(1, 1), (1, -1), (-1, 1), (-1, -1)], &color))
}

pub fn rhai_queen_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    to_array(slides(
        &board,
        &from,
        &[
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ],
        &color,
    ))
}

pub fn rhai_king_moves(board: BoardState, from: BoardCoords, color: String) -> Array {
    if !board.in_bounds(&from) {
        return Array::new();
    }

    let mut result = Vec::new();
    for dr in -1..=1 {
        for dc in -1..=1 {
            if dr == 0 && dc == 0 {
                continue;
            }
            push_if_targetable(&board, BoardCoords::new(from.row + dr, from.col + dc, from.board_index), &color, &mut result);
        }
    }
    to_array(result)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use rhai::{Array, Dynamic};

    use super::{rhai_bishop_moves, rhai_king_moves, rhai_knight_moves, rhai_pawn_moves, rhai_queen_moves, rhai_rook_moves};
    use crate::game::{board::rhai_board_set, piece::Piece, state::{BoardCoords, BoardState}};

    fn coords_set(array: Array) -> BTreeSet<(i32, i32)> {
        array
            .into_iter()
            .map(|dynamic| dynamic.cast::<BoardCoords>())
            .map(|coords| (coords.row, coords.col))
            .collect()
    }

    #[test]
    fn test_rook_moves_open_board() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_rook_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert_eq!(moves.len(), 14);
        assert!(moves.contains(&(3, 0)));
        assert!(moves.contains(&(7, 3)));
    }

    #[test]
    fn test_rook_blocked_by_own_piece() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(board, BoardCoords::new_board_0(3, 5), Dynamic::from(Piece::rhai_make_pawn("white".into())));
        let moves = coords_set(rhai_rook_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert!(!moves.contains(&(3, 5)));
        assert!(!moves.contains(&(3, 6)));
    }

    #[test]
    fn test_rook_captures_enemy() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(board, BoardCoords::new_board_0(3, 5), Dynamic::from(Piece::rhai_make_pawn("black".into())));
        let moves = coords_set(rhai_rook_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert!(moves.contains(&(3, 5)));
        assert!(!moves.contains(&(3, 6)));
    }

    #[test]
    fn test_knight_moves_center() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_knight_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert_eq!(moves.len(), 8);
    }

    #[test]
    fn test_pawn_white_single_push() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(board, BoardCoords::new_board_0(5, 4), "white".into()));
        assert!(moves.contains(&(4, 4)));
    }

    #[test]
    fn test_pawn_white_double_push_from_start() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(board, BoardCoords::new_board_0(6, 4), "white".into()));
        assert!(moves.contains(&(5, 4)));
        assert!(moves.contains(&(4, 4)));
    }

    #[test]
    fn test_pawn_white_capture() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(board, BoardCoords::new_board_0(5, 5), Dynamic::from(Piece::rhai_make_knight("black".into())));
        let moves = coords_set(rhai_pawn_moves(board, BoardCoords::new_board_0(6, 4), "white".into()));
        assert!(moves.contains(&(5, 5)));
    }

    #[test]
    fn test_pawn_black_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(board, BoardCoords::new_board_0(1, 4), "black".into()));
        assert!(moves.contains(&(2, 4)));
        assert!(moves.contains(&(3, 4)));
    }

    #[test]
    fn test_bishop_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_bishop_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert_eq!(moves.len(), 13);
        assert!(moves.contains(&(0, 0)));
        assert!(moves.contains(&(6, 6)));
    }

    #[test]
    fn test_queen_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_queen_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert_eq!(moves.len(), 27);
    }

    #[test]
    fn test_king_moves_center() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_king_moves(board, BoardCoords::new_board_0(3, 3), "white".into()));
        assert_eq!(moves.len(), 8);
    }

    #[test]
    fn test_king_moves_corner() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_king_moves(board, BoardCoords::new_board_0(0, 0), "white".into()));
        assert_eq!(moves, BTreeSet::from([(0, 1), (1, 0), (1, 1)]));
    }
}
