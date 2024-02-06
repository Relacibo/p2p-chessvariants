pub struct PieceTypeDescription {
    find_moves: Fn(&'a State, &'a PieceMoveContext) -> Vec<BoardCoords>,
}

pub struct PieceMoveContext<'a> {
    piece: Piece,
    source: BoardCoords,
}
