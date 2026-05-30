use super::{
    piece::Piece,
    state::{BoardCoords, BoardState},
};

pub fn standard_start_position() -> BoardState {
    let mut board = BoardState::board_empty(8, 8);

    let back_rank = [
        Piece::rhai_make_rook,
        Piece::rhai_make_knight,
        Piece::rhai_make_bishop,
        Piece::rhai_make_queen,
        Piece::rhai_make_king,
        Piece::rhai_make_bishop,
        Piece::rhai_make_knight,
        Piece::rhai_make_rook,
    ];

    for (col, make_piece) in back_rank.into_iter().enumerate() {
        board.set_piece(
            &BoardCoords::new_board_0(0, col as i32),
            Some(make_piece("black".into())),
        );
        board.set_piece(
            &BoardCoords::new_board_0(7, col as i32),
            Some(make_piece("white".into())),
        );
    }

    for col in 0..8 {
        board.set_piece(
            &BoardCoords::new_board_0(1, col),
            Some(Piece::rhai_make_pawn("black".into())),
        );
        board.set_piece(
            &BoardCoords::new_board_0(6, col),
            Some(Piece::rhai_make_pawn("white".into())),
        );
    }

    board
}

#[cfg(test)]
mod tests {
    use super::standard_start_position;
    use crate::game::state::BoardCoords;

    #[test]
    fn test_standard_start_position() {
        let board = standard_start_position();
        assert_eq!(board.rows, 8);
        assert_eq!(board.cols, 8);
        assert_eq!(
            board
                .get_piece(&BoardCoords::new_board_0(0, 4))
                .unwrap()
                .piece_type_name(),
            "king"
        );
        assert_eq!(
            board
                .get_piece(&BoardCoords::new_board_0(7, 4))
                .unwrap()
                .color_name(),
            "white"
        );
        assert!(board.get_piece(&BoardCoords::new_board_0(4, 4)).is_none());
    }
}
