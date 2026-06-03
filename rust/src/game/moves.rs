use rhai::{Array, Dynamic};

use super::state::{BoardCoords, BoardState, Coords};

fn push_coord(result: &mut Vec<BoardCoords>, coords: BoardCoords) {
    result.push(coords);
}

fn board_piece_color<'a>(board: &'a BoardState, coords: &BoardCoords) -> Option<&'a str> {
    board.get_piece(coords).map(|piece| piece.color_name())
}

/// Convert `Vec<BoardCoords>` to an `Array` of `Coords` (board type).
fn to_array(coords: Vec<BoardCoords>) -> Array {
    coords
        .into_iter()
        .map(|bc| Dynamic::from(Coords::from(bc)))
        .collect()
}

fn push_if_targetable(
    board: &BoardState,
    coords: BoardCoords,
    color: &str,
    result: &mut Vec<BoardCoords>,
) {
    if !board.in_bounds(&coords) {
        return;
    }

    match board_piece_color(board, &coords) {
        None => push_coord(result, coords),
        Some(piece_color) if piece_color != color => push_coord(result, coords),
        _ => {}
    }
}

pub fn slides(
    board: &BoardState,
    from: &BoardCoords,
    directions: &[(i32, i32)],
    color: &str,
) -> Vec<BoardCoords> {
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

/// Generic pawn destinations: forward non-capture push (+ double push from
/// `start_line`), and diagonal captures perpendicular to the movement direction.
///
/// `dir` must be an orthogonal unit vector: `(-1,0)`, `(1,0)`, `(0,-1)`, or `(0,1)`.
/// `start_line` is the absolute row index (when `dr != 0`) or column index (when `dc != 0`)
/// where the double push is allowed. `-1` disables the double push.
pub fn pawn_dests_generic(
    board: &BoardState,
    from: &BoardCoords,
    dir: (i32, i32),
    start_line: i32,
    color: &str,
) -> Vec<BoardCoords> {
    if !board.in_bounds(from) {
        return Vec::new();
    }
    let (dr, dc) = dir;
    let mut result = Vec::new();

    // Single forward push (never captures).
    let one_forward = BoardCoords::new(from.row + dr, from.col + dc, from.board_index);
    if board.in_bounds(&one_forward) && board.get_piece(&one_forward).is_none() {
        result.push(one_forward.clone());

        // Double push only from the designated start line.
        let at_start = start_line >= 0
            && if dr != 0 {
                from.row == start_line
            } else {
                from.col == start_line
            };
        if at_start {
            let two_forward =
                BoardCoords::new(from.row + 2 * dr, from.col + 2 * dc, from.board_index);
            if board.in_bounds(&two_forward) && board.get_piece(&two_forward).is_none() {
                result.push(two_forward);
            }
        }
    }

    // Diagonal captures: perpendicular to the forward direction.
    let perp_offsets: [(i32, i32); 2] = if dr != 0 {
        [(dr, 1), (dr, -1)]
    } else {
        [(1, dc), (-1, dc)]
    };
    for (pr, pc) in perp_offsets {
        let target = BoardCoords::new(from.row + pr, from.col + pc, from.board_index);
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

    result
}

/// Pseudo-legal pawn destinations. Takes references to avoid board clones.
/// Determines direction from `color`: `"white"` moves up (row -1), `"black"` moves down
/// (row +1). Returns empty for other colors — use `pawn_dests_generic` instead.
pub(crate) fn pawn_dests(board: &BoardState, from: &BoardCoords, color: &str) -> Vec<BoardCoords> {
    let dir = match color {
        "white" => (-1, 0),
        "black" => (1, 0),
        _ => return Vec::new(),
    };
    let start_line = if color == "white" {
        board.rows as i32 - 2
    } else {
        1
    };
    pawn_dests_generic(board, from, dir, start_line, color)
}

/// Pseudo-legal rook destinations. Takes references to avoid board clones.
pub(crate) fn rook_dests(board: &BoardState, from: &BoardCoords, color: &str) -> Vec<BoardCoords> {
    slides(board, from, &[(1, 0), (-1, 0), (0, 1), (0, -1)], color)
}

/// Pseudo-legal knight destinations. Takes references to avoid board clones.
pub(crate) fn knight_dests(
    board: &BoardState,
    from: &BoardCoords,
    color: &str,
) -> Vec<BoardCoords> {
    if !board.in_bounds(from) {
        return Vec::new();
    }
    let offsets = [
        (-2i32, -1i32),
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
        push_if_targetable(
            board,
            BoardCoords::new(from.row + dr, from.col + dc, from.board_index),
            color,
            &mut result,
        );
    }
    result
}

/// Pseudo-legal bishop destinations. Takes references to avoid board clones.
pub(crate) fn bishop_dests(
    board: &BoardState,
    from: &BoardCoords,
    color: &str,
) -> Vec<BoardCoords> {
    slides(board, from, &[(1, 1), (1, -1), (-1, 1), (-1, -1)], color)
}

/// Pseudo-legal queen destinations. Takes references to avoid board clones.
pub(crate) fn queen_dests(board: &BoardState, from: &BoardCoords, color: &str) -> Vec<BoardCoords> {
    slides(
        board,
        from,
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
        color,
    )
}

/// Pseudo-legal king destinations. Takes references to avoid board clones.
pub(crate) fn king_dests(board: &BoardState, from: &BoardCoords, color: &str) -> Vec<BoardCoords> {
    if !board.in_bounds(from) {
        return Vec::new();
    }
    let mut result = Vec::new();
    for dr in -1i32..=1 {
        for dc in -1i32..=1 {
            if dr == 0 && dc == 0 {
                continue;
            }
            push_if_targetable(
                board,
                BoardCoords::new(from.row + dr, from.col + dc, from.board_index),
                color,
                &mut result,
            );
        }
    }
    result
}

/// Pseudo-legal jump destinations (fixed offsets, ignores blocking pieces).
/// `board_delta` shifts the destination board index relative to `from.board_index`.
pub fn jumps(
    board: &BoardState,
    from: &BoardCoords,
    offsets: &[(i32, i32)],
    color: &str,
    board_delta: i32,
) -> Vec<BoardCoords> {
    if !board.in_bounds(from) {
        return Vec::new();
    }
    let mut result = Vec::new();
    for (dr, dc) in offsets {
        push_if_targetable(
            board,
            BoardCoords::new(
                from.row + dr,
                from.col + dc,
                from.board_index + board_delta,
            ),
            color,
            &mut result,
        );
    }
    result
}

// ── Rhai-facing wrappers (take ownership as required by Rhai's type system) ───

pub fn rhai_pawn_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(pawn_dests(&board, &from, &color))
}

/// Generic pawn push callable from Rhai scripts.
/// `dir_r` and `dir_c` define the forward direction (must be an orthogonal unit vector).
/// `start_line` is the row (vertical move) or column (horizontal move) where the double
/// push is allowed; pass `-1` to disable.
pub fn rhai_pawn_push(
    board: BoardState,
    from: Coords,
    color: String,
    dir_r: i64,
    dir_c: i64,
    start_line: i64,
) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(pawn_dests_generic(
        &board,
        &from,
        (dir_r as i32, dir_c as i32),
        start_line as i32,
        &color,
    ))
}

pub fn rhai_rook_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(rook_dests(&board, &from, &color))
}

pub fn rhai_knight_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(knight_dests(&board, &from, &color))
}

pub fn rhai_bishop_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(bishop_dests(&board, &from, &color))
}

pub fn rhai_queen_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(queen_dests(&board, &from, &color))
}

pub fn rhai_king_moves(board: BoardState, from: Coords, color: String) -> Array {
    let Some(from) = from.as_board_coords() else {
        return Array::new();
    };
    to_array(king_dests(&board, &from, &color))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use rhai::{Array, Dynamic};

    use super::{
        pawn_dests_generic, rhai_bishop_moves, rhai_king_moves, rhai_knight_moves,
        rhai_pawn_moves, rhai_pawn_push, rhai_queen_moves, rhai_rook_moves,
    };
    use crate::game::{
        board::rhai_board_set,
        piece::Piece,
        state::{BoardState, Coords},
    };

    fn coords_set(array: Array) -> BTreeSet<(i32, i32)> {
        array
            .into_iter()
            .map(|dynamic| dynamic.cast::<Coords>())
            .map(|coords| match coords {
                Coords::Board { row, col, .. } => (row, col),
                Coords::Reserve { .. } => (0, 0),
            })
            .collect()
    }

    #[test]
    fn test_rook_moves_open_board() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_rook_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert_eq!(moves.len(), 14);
        assert!(moves.contains(&(3, 0)));
        assert!(moves.contains(&(7, 3)));
    }

    #[test]
    fn test_rook_blocked_by_own_piece() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(3, 5),
            Dynamic::from(Piece::rhai_make_pawn("white".into())),
        );
        let moves = coords_set(rhai_rook_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert!(!moves.contains(&(3, 5)));
        assert!(!moves.contains(&(3, 6)));
    }

    #[test]
    fn test_rook_captures_enemy() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(3, 5),
            Dynamic::from(Piece::rhai_make_pawn("black".into())),
        );
        let moves = coords_set(rhai_rook_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert!(moves.contains(&(3, 5)));
        assert!(!moves.contains(&(3, 6)));
    }

    #[test]
    fn test_knight_moves_center() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_knight_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert_eq!(moves.len(), 8);
    }

    #[test]
    fn test_pawn_white_single_push() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(
            board,
            Coords::new_board_0(5, 4),
            "white".into(),
        ));
        assert!(moves.contains(&(4, 4)));
    }

    #[test]
    fn test_pawn_white_double_push_from_start() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(
            board,
            Coords::new_board_0(6, 4),
            "white".into(),
        ));
        assert!(moves.contains(&(5, 4)));
        assert!(moves.contains(&(4, 4)));
    }

    #[test]
    fn test_pawn_white_capture() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(5, 5),
            Dynamic::from(Piece::rhai_make_knight("black".into())),
        );
        let moves = coords_set(rhai_pawn_moves(
            board,
            Coords::new_board_0(6, 4),
            "white".into(),
        ));
        assert!(moves.contains(&(5, 5)));
    }

    #[test]
    fn test_pawn_black_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_pawn_moves(
            board,
            Coords::new_board_0(1, 4),
            "black".into(),
        ));
        assert!(moves.contains(&(2, 4)));
        assert!(moves.contains(&(3, 4)));
    }

    #[test]
    fn test_bishop_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_bishop_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert_eq!(moves.len(), 13);
        assert!(moves.contains(&(0, 0)));
        assert!(moves.contains(&(6, 6)));
    }

    #[test]
    fn test_queen_moves() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_queen_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert_eq!(moves.len(), 27);
    }

    #[test]
    fn test_king_moves_center() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_king_moves(
            board,
            Coords::new_board_0(3, 3),
            "white".into(),
        ));
        assert_eq!(moves.len(), 8);
    }

    #[test]
    fn test_king_moves_corner() {
        let board = BoardState::board_empty(8, 8);
        let moves = coords_set(rhai_king_moves(
            board,
            Coords::new_board_0(0, 0),
            "white".into(),
        ));
        assert_eq!(moves, BTreeSet::from([(0, 1), (1, 0), (1, 1)]));
    }

    #[test]
    fn test_reserve_coords_returns_empty() {
        let board = BoardState::board_empty(8, 8);
        let moves = rhai_rook_moves(board, Coords::new_reserve(0), "white".into());
        assert!(moves.is_empty());
    }

    // ── pawn_dests_generic / rhai_pawn_push ───────────────────────────────────

    #[test]
    fn test_pawn_push_vertical_single() {
        let board = BoardState::board_empty(8, 8);
        // Pawn at (4,4) moving up, no start-line double push.
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(4, 4),
            "north".into(),
            -1,
            0,
            -1,
        ));
        assert_eq!(moves, BTreeSet::from([(3, 4)]));
    }

    #[test]
    fn test_pawn_push_vertical_double_from_start() {
        let board = BoardState::board_empty(14, 14);
        // Yellow pawn at start line 1, moving down (dir [1,0]).
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(1, 5),
            "yellow".into(),
            1,
            0,
            1,
        ));
        assert!(moves.contains(&(2, 5)));
        assert!(moves.contains(&(3, 5)));
    }

    #[test]
    fn test_pawn_push_vertical_no_double_blocked() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(5, 4),
            Dynamic::from(Piece::rhai_make_pawn("black".into())),
        );
        // White pawn at start row 6, one step blocked → no double push either.
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(6, 4),
            "white".into(),
            -1,
            0,
            6,
        ));
        assert!(moves.is_empty());
    }

    #[test]
    fn test_pawn_push_vertical_capture() {
        let board = BoardState::board_empty(8, 8);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(3, 5),
            Dynamic::from(Piece::rhai_make_knight("enemy".into())),
        );
        // Pawn at (4,4) moving up can capture diagonally at (3,5).
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(4, 4),
            "white".into(),
            -1,
            0,
            -1,
        ));
        assert!(moves.contains(&(3, 5)));
        assert!(!moves.contains(&(3, 3)));
    }

    #[test]
    fn test_pawn_push_horizontal_single() {
        let board = BoardState::board_empty(14, 14);
        // Blue pawn at (5,1) moving right [0,1], no double push.
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(5, 1),
            "blue".into(),
            0,
            1,
            -1,
        ));
        assert_eq!(moves, BTreeSet::from([(5, 2)]));
    }

    #[test]
    fn test_pawn_push_horizontal_double_from_start() {
        let board = BoardState::board_empty(14, 14);
        // Blue pawn at start col 1, moving right [0,1].
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(5, 1),
            "blue".into(),
            0,
            1,
            1,
        ));
        assert!(moves.contains(&(5, 2)));
        assert!(moves.contains(&(5, 3)));
    }

    #[test]
    fn test_pawn_push_horizontal_capture() {
        let board = BoardState::board_empty(14, 14);
        let board = rhai_board_set(
            board,
            Coords::new_board_0(4, 2),
            Dynamic::from(Piece::rhai_make_knight("enemy".into())),
        );
        // Blue pawn at (5,1) moving right, should capture up-right (4,2).
        let moves = coords_set(rhai_pawn_push(
            board,
            Coords::new_board_0(5, 1),
            "blue".into(),
            0,
            1,
            -1,
        ));
        assert!(moves.contains(&(4, 2)));
    }

    #[test]
    fn test_pawn_dests_generic_no_start_line() {
        let board = BoardState::board_empty(8, 8);
        // start_line = -1 → always single push only.
        let from = crate::game::state::BoardCoords::new(6, 4, 0);
        let moves: BTreeSet<(i32, i32)> = super::pawn_dests_generic(&board, &from, (-1, 0), -1, "x")
            .into_iter()
            .map(|c| (c.row, c.col))
            .collect();
        assert_eq!(moves, BTreeSet::from([(5, 4)]));
    }
}
