import { BoardCoords, Direction, EmptyTile, Piece, PieceDescription, PieceType } from "./types";
import { getDiagonalDirections, getPerpendicularDirections } from "./util";

export type KingExtraInfo = {
    shortCastleRight: boolean,
    longCastleRight: boolean
}

export type PawnExtraInfo = {
    enPassantSquare: BoardCoords | null
}

export const bishopMoves: PieceDescription<Object> = {
    type: PieceType.Bishop,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares,
        _isSquareAttacked): BoardCoords[] => {
        return getDiagonalDirections()
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== ownColor ? [...empty, hit.coords] : empty
            );
    }
}

export const queenMoves: PieceDescription<Object> = {
    type: PieceType.Queen,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares,
        _isSquareAttacked): BoardCoords[] => {
        return getDiagonalDirections()
            .concat(getPerpendicularDirections())
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== ownColor ? [...empty, hit.coords] : empty
            );
    }
}

export const rookMoves: PieceDescription<Object> = {
    type: PieceType.Rook,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares,
        _isSquareAttacked): BoardCoords[] => {
        return getPerpendicularDirections()
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== ownColor ? [...empty, hit.coords] : empty
            );
    }
}

export const knightMoves: PieceDescription<Object> = {
    type: PieceType.Knight,
    move: (
        _extraInfo,
        _source,
        ownColor,
        _ray,
        singleSquare,
        _isSquareAttacked): BoardCoords[] => {
        return [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]].map(singleSquare)
            .filter(({ tile }) =>
                tile instanceof EmptyTile || (tile as Piece).color !== ownColor
            )
            .map(({ coords }) => coords);
    }
}

export const kingMoves: PieceDescription<KingExtraInfo> = {
    type: PieceType.King,
    move: (
        { shortCastleRight, longCastleRight },
        _source,
        _moveAllowed,
        canCapture,
        ray,
        singleSquare,
        isSquareAttacked): BoardCoords[] => {
        const normalMoves = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
            .map(singleSquare)
            .filter(square => !isSquareAttacked(square))
            .filter(square => square != null)
            .map(({ coords }) => coords);

        const castleMoves = [
            { cr: shortCastleRight, dir: Direction.Right, rookC: 7, relativeMove: [0, 2] },
            { cr: longCastleRight, dir: Direction.Left, rookC: 0, relativeMove: [0, 2] }
        ].filter(({ cr }) => cr)
            .map(({ dir, rookC, relativeMove }) => { return { r: ray(dir), rookC, relativeMove } })
            .filter(({ r: { hit } }, rookC) => {
                return hit && hit.coords.c == rookC;
            })
            .filter(({ r: { empty } }) => { empty.slice(0, 1).every((t) => !isSquareAttacked(t)) })
            .
            return[...normalMoves, ...castleMoves];
    }
}
/*
canCastleInDirection(state: ChessVariantState, ownColor: PieceColor, cDirection: number): boolean {
    const { boardState } = state;
    const kingSquare = new BoardCoords(4, ownColor == PieceColor.White ? 0 : this.rows() - 1);
    const ray = this.castRays(boardState, kingSquare, [[0, -1]]);
    const { coords: lastTileCoords } = ray[ray.length - 1];
    const expectedRookColumn = cDirection == 1 ? this.columns() - 1 : 0;
    if (lastTileCoords.c != expectedRookColumn) {
        return false;
    }
    const squaresAreEmpty = ray.slice(0, -1).every(({ tile }) => tile instanceof EmptyTile);
    if (!squaresAreEmpty) {
        return false;
    }
    const squaresAreNotAttacked = ray.slice(0, 1).every(({ coords }) =>
        !this.isSquareAttacked(state, coords, ownColor)
    );
    return squaresAreNotAttacked;
}
castleMoves(state: ChessVariantState, source: BoardCoords, ownColor: PieceColor) {
    const { boardState, castleRights } = state;
    const castle = castleRights[ownColor];
    let castleSquares: BoardCoords[] = [];
    if (castle.short && this.canCastleInDirection(state, ownColor, 1)) {
        castleSquares = [...castleSquares, ...this.singleSquares(boardState, source, [[0, 2]]).map(({ coords }) => coords)];
    }
    if (castle.long && this.canCastleInDirection(state, ownColor, -1)) {
        castleSquares = [...castleSquares, ...this.singleSquares(boardState, source, [[0, -2]]).map(({ coords }) => coords)];
    }
    return castleSquares;
}

pawnMoves({ state: { boardState, enPassantSquare }, source, ownColor }: MoveFinderOptions) {
    const isWhite = ownColor === PieceColor.White;
    let moves = this.singleSquares(boardState, source, isWhite ? [[1, 0]] : [[-1, 0]])
        .filter(({ tile }) =>
            tile instanceof EmptyTile
        )
        .map(({ coords }) => coords);
    if (moves.length > 0 && (isWhite && source.r == 1 || !isWhite && source.r == 6)) {
        const startingJump = this.singleSquares(boardState, source, isWhite ? [[2, 0]] : [[-2, 0]]).filter(({ tile }) =>
            tile instanceof EmptyTile
        ).map(({ coords }) => coords);
        moves = [...moves, ...startingJump]
    }
    const captures = this.singleSquares(boardState, source, ownColor === PieceColor.White ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]])
        .filter(({ coords, tile }) =>
            tile != null &&
            (
                (tile instanceof Piece && this.isPieceCapturable(ownColor!, tile)) ||
                enPassantSquare != null && coords.equals(enPassantSquare)
            )
        )
        .map(({ coords }) => coords);
    return [...moves, ...captures];
}*/