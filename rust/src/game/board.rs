use rhai::{Array, Dynamic, Map};

use super::{
    piece::Piece,
    state::{BoardCoords, BoardState, Coords},
};

fn piece_to_dynamic(piece: Option<&Piece>) -> Dynamic {
    piece.cloned().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
}

fn pair_from_array(array: &Array) -> Option<(i32, i32)> {
    if array.len() < 2 {
        return None;
    }
    let first = array[0].clone().try_cast::<i32>()?;
    let second = array[1].clone().try_cast::<i32>()?;
    Some((first, second))
}

fn trace_square(board: &BoardState, coords: BoardCoords) -> Dynamic {
    let mut map = Map::new();
    map.insert("coords".into(), Dynamic::from(Coords::from(coords.clone())));
    map.insert("piece".into(), piece_to_dynamic(board.get_piece(&coords)));
    Dynamic::from(map)
}

pub fn rhai_board_get(board: BoardState, coords: Coords) -> Dynamic {
    let Some(bc) = coords.as_board_coords() else {
        return Dynamic::UNIT;
    };
    piece_to_dynamic(board.get_piece(&bc))
}

pub fn rhai_board_set(mut board: BoardState, coords: Coords, piece: Dynamic) -> BoardState {
    let Some(bc) = coords.as_board_coords() else {
        return board;
    };
    if !board.in_bounds(&bc) {
        return board;
    }

    let piece = if piece.is_unit() {
        None
    } else {
        piece.try_cast::<Piece>()
    };

    board.set_piece(&bc, piece);
    board
}

pub fn rhai_board_move_piece(mut board: BoardState, from: Coords, to: Coords) -> BoardState {
    let (Some(from_bc), Some(to_bc)) = (from.as_board_coords(), to.as_board_coords()) else {
        return board;
    };
    if !board.in_bounds(&from_bc) || !board.in_bounds(&to_bc) {
        return board;
    }

    let Some(piece) = board.get_piece(&from_bc).cloned() else {
        return board;
    };

    board.set_piece(&from_bc, None);
    board.set_piece(&to_bc, Some(piece));
    board
}

/// Find all squares containing a piece of the given type and color.
/// Returns an array of `Coords` (board type).
pub fn rhai_board_find(board: BoardState, piece_type: String, color: String) -> Array {
    let mut result = Array::new();

    for (board_index, cells) in board.boards.iter().enumerate() {
        for (index, cell) in cells.iter().enumerate() {
            let Some(piece) = cell else {
                continue;
            };
            if piece.piece_type_name() != piece_type || piece.color_name() != color {
                continue;
            }

            let row = (index / board.cols as usize) as i32;
            let col = (index % board.cols as usize) as i32;
            result.push(Dynamic::from(Coords::new_board(
                row,
                col,
                board_index as i32,
            )));
        }
    }

    result
}

/// Overload: find all squares containing the given `Piece` value.
/// Convenience for scripts that call `board_find(board, Piece(color, type))`.
pub fn rhai_board_find_piece(board: BoardState, piece: Piece) -> Array {
    rhai_board_find(
        board,
        piece.piece_type_name().to_string(),
        piece.color_name().to_string(),
    )
}

/// Find all pieces of a given color on the board.
/// Returns an array of `#{ coords: Coords, piece: Piece }` maps.
/// Usable in scripts as `engine::board::find_by_color(board, color)`.
pub fn rhai_board_find_by_color(board: BoardState, color: String) -> Array {
    let mut result = Array::new();

    for (board_index, cells) in board.boards.iter().enumerate() {
        for (index, cell) in cells.iter().enumerate() {
            let Some(piece) = cell else {
                continue;
            };
            if piece.color_name() != color {
                continue;
            }

            let row = (index / board.cols as usize) as i32;
            let col = (index % board.cols as usize) as i32;
            let coords = Coords::new_board(row, col, board_index as i32);
            let mut map = rhai::Map::new();
            map.insert("coords".into(), Dynamic::from(coords));
            map.insert("piece".into(), Dynamic::from(piece.clone()));
            result.push(Dynamic::from(map));
        }
    }

    result
}

pub fn rhai_board_rows(board: BoardState) -> i32 {
    board.rows
}

pub fn rhai_board_cols(board: BoardState) -> i32 {
    board.cols
}

pub fn rhai_board_count(board: BoardState) -> i32 {
    board.boards.len() as i32
}

pub fn rhai_ray(board: BoardState, from: Coords, dir: Array) -> Array {
    let Some(from_bc) = from.as_board_coords() else {
        return Array::new();
    };
    let Some((dr, dc)) = pair_from_array(&dir) else {
        return Array::new();
    };

    let mut result = Array::new();
    let mut row = from_bc.row + dr;
    let mut col = from_bc.col + dc;

    loop {
        let coords = BoardCoords::new(row, col, from_bc.board_index);
        if !board.in_bounds(&coords) {
            break;
        }

        let occupied = board.get_piece(&coords).is_some();
        result.push(trace_square(&board, coords));
        if occupied {
            break;
        }

        row += dr;
        col += dc;
    }

    result
}

pub fn rhai_xray(board: BoardState, from: Coords, dir: Array) -> Array {
    let Some(from_bc) = from.as_board_coords() else {
        return Array::new();
    };
    let Some((dr, dc)) = pair_from_array(&dir) else {
        return Array::new();
    };

    let mut result = Array::new();
    let mut row = from_bc.row + dr;
    let mut col = from_bc.col + dc;

    loop {
        let coords = BoardCoords::new(row, col, from_bc.board_index);
        if !board.in_bounds(&coords) {
            break;
        }

        result.push(trace_square(&board, coords));
        row += dr;
        col += dc;
    }

    result
}

pub fn rhai_jump(board: BoardState, from: Coords, offsets: Array) -> Array {
    let Some(from_bc) = from.as_board_coords() else {
        return Array::new();
    };
    let mut result = Array::new();

    for offset in offsets {
        let Some(offsets) = offset.try_cast::<Array>() else {
            continue;
        };
        let Some((dr, dc)) = pair_from_array(&offsets) else {
            continue;
        };

        let coords = BoardCoords::new(from_bc.row + dr, from_bc.col + dc, from_bc.board_index);
        if board.in_bounds(&coords) {
            result.push(trace_square(&board, coords));
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use rhai::{Array, Dynamic, Map};

    use super::{
        rhai_board_get, rhai_board_move_piece, rhai_board_set, rhai_jump, rhai_ray, rhai_xray,
    };
    use crate::game::{
        piece::Piece,
        state::{BoardCoords, BoardState, Coords},
    };

    fn map_coords(dynamic: &Dynamic) -> Coords {
        dynamic
            .clone()
            .cast::<Map>()
            .get("coords")
            .unwrap()
            .clone()
            .cast::<Coords>()
    }

    fn map_piece(dynamic: &Dynamic) -> Dynamic {
        dynamic.clone().cast::<Map>().get("piece").unwrap().clone()
    }

    #[test]
    fn test_board_get_empty() {
        let board = BoardState::board_empty(8, 8);
        assert!(rhai_board_get(board, Coords::new_board_0(0, 0)).is_unit());
    }

    #[test]
    fn test_board_set_and_get() {
        let board = BoardState::board_empty(8, 8);
        let piece = Piece::rhai_make_rook("white".into());
        let board = rhai_board_set(
            board,
            Coords::new_board_0(1, 2),
            Dynamic::from(piece.clone()),
        );
        assert_eq!(
            rhai_board_get(board, Coords::new_board_0(1, 2)).cast::<Piece>(),
            piece
        );
    }

    #[test]
    fn test_board_move_piece() {
        let board = BoardState::board_empty(8, 8);
        let piece = Piece::rhai_make_knight("white".into());
        let board = rhai_board_set(
            board,
            Coords::new_board_0(4, 4),
            Dynamic::from(piece.clone()),
        );
        let board =
            rhai_board_move_piece(board, Coords::new_board_0(4, 4), Coords::new_board_0(2, 5));
        assert!(rhai_board_get(board.clone(), Coords::new_board_0(4, 4)).is_unit());
        assert_eq!(
            rhai_board_get(board, Coords::new_board_0(2, 5)).cast::<Piece>(),
            piece
        );
    }

    // board_move_piece with reserve coords is a no-op
    #[test]
    fn test_board_move_piece_reserve_noop() {
        let board = BoardState::board_empty(8, 8);
        let piece = Piece::rhai_make_pawn("white".into());
        let board = rhai_board_set(board, Coords::new_board_0(4, 4), Dynamic::from(piece));
        let before = board.clone();
        let after = rhai_board_move_piece(board, Coords::new_reserve(0), Coords::new_board_0(2, 2));
        assert_eq!(before, after);
    }

    #[test]
    fn test_ray_empty_board() {
        let board = BoardState::board_empty(8, 8);
        let ray = rhai_ray(
            board,
            Coords::new_board_0(3, 3),
            vec![Dynamic::from(0_i32), Dynamic::from(1_i32)],
        );
        let coords: Vec<_> = ray.iter().map(map_coords).collect();
        assert_eq!(
            coords,
            vec![
                Coords::new_board_0(3, 4),
                Coords::new_board_0(3, 5),
                Coords::new_board_0(3, 6),
                Coords::new_board_0(3, 7),
            ]
        );
    }

    #[test]
    fn test_ray_stops_at_piece() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(3, 5),
            Dynamic::from(Piece::rhai_make_pawn("black".into())),
        );
        let ray = rhai_ray(
            board,
            Coords::new_board_0(3, 3),
            vec![Dynamic::from(0_i32), Dynamic::from(1_i32)],
        );
        assert_eq!(ray.len(), 2);
        assert!(map_piece(&ray[1]).is::<Piece>());
        assert_eq!(map_coords(&ray[1]), Coords::new_board_0(3, 5));
    }

    #[test]
    fn test_xray_passes_through() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(3, 5),
            Dynamic::from(Piece::rhai_make_pawn("black".into())),
        );
        let ray = rhai_xray(
            board,
            Coords::new_board_0(3, 3),
            vec![Dynamic::from(0_i32), Dynamic::from(1_i32)],
        );
        assert_eq!(ray.len(), 4);
        assert_eq!(map_coords(&ray[3]), Coords::new_board_0(3, 7));
    }

    fn knight_offsets() -> Array {
        vec![
            vec![Dynamic::from(-2_i32), Dynamic::from(-1_i32)],
            vec![Dynamic::from(-2_i32), Dynamic::from(1_i32)],
            vec![Dynamic::from(-1_i32), Dynamic::from(-2_i32)],
            vec![Dynamic::from(-1_i32), Dynamic::from(2_i32)],
            vec![Dynamic::from(1_i32), Dynamic::from(-2_i32)],
            vec![Dynamic::from(1_i32), Dynamic::from(2_i32)],
            vec![Dynamic::from(2_i32), Dynamic::from(-1_i32)],
            vec![Dynamic::from(2_i32), Dynamic::from(1_i32)],
        ]
        .into_iter()
        .map(Dynamic::from)
        .collect()
    }

    #[test]
    fn test_jump_knight_center() {
        let board = BoardState::board_empty(8, 8);
        let jumps = rhai_jump(board, Coords::new_board_0(3, 3), knight_offsets());
        assert_eq!(jumps.len(), 8);
    }

    #[test]
    fn test_jump_knight_corner() {
        let board = BoardState::board_empty(8, 8);
        let jumps = rhai_jump(board, Coords::new_board_0(0, 0), knight_offsets());
        let coords: Vec<_> = jumps.iter().map(map_coords).collect();
        assert_eq!(
            coords,
            vec![Coords::new_board_0(1, 2), Coords::new_board_0(2, 1)]
        );
    }

    // Ensure backward-compat: BoardCoords still works via Coords::from
    #[test]
    fn test_board_get_via_boardcoords_conversion() {
        let board = BoardState::board_empty(8, 8);
        let piece = Piece::rhai_make_pawn("white".into());
        let bc = BoardCoords::new_board_0(2, 3);
        let board = rhai_board_set(board, Coords::from(bc), Dynamic::from(piece.clone()));
        let result = rhai_board_get(board, Coords::from(BoardCoords::new_board_0(2, 3)));
        assert_eq!(result.cast::<Piece>(), piece);
    }
}
