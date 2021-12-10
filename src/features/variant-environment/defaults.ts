import { BoardCoords, Direction, EmptyTile, Piece, PieceDescription, PieceInfo, PieceType } from "./types";
import { getDiagonalDirections, getPerpendicularDirections } from "./util";

export interface KingInfo extends PieceInfo {
    shortCastleRight: boolean,
    longCastleRight: boolean
}

export interface PawnInfo extends PieceInfo {
    enPassantSquare: BoardCoords | null
}

export const bishopMoves: PieceDescription<PieceInfo> = {
    type: PieceType.Bishop,
    move: (
        { color },
        ray,
        _singleSquares,
        _isSquareAttacked): BoardCoords[] => {
        return getDiagonalDirections()
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
            );
    }
}

export const queenMoves: PieceDescription<PieceInfo> = {
    type: PieceType.Queen,
    move: (
        { color },
        ray,
        _singleSquares,
        _isSquareAttacked): BoardCoords[] => {
        return getDiagonalDirections()
            .concat(getPerpendicularDirections())
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
            );
    }
}

export const rookMoves: PieceDescription<PieceInfo> = {
    type: PieceType.Rook,
    move: (
        { color },
        ray,
        _singleSquare,
        _kingInCheckAfter: (coords: BoardCoords) => boolean,
        _isSquareAttacked): BoardCoords[] => {
        return getPerpendicularDirections()
            .map(ray)
            .flatMap(({ empty, hit }) =>
                hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
            );
    }
}

export const knightMoves: PieceDescription<PieceInfo> = {
    type: PieceType.Knight,
    move: (
        { color },
        _ray,
        singleSquare,
        _kingInCheckAfter: (coords: BoardCoords) => boolean,
        _isSquareAttacked): BoardCoords[] => {
        return [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]]
            .map(singleSquare)
            .filter(({ tile }) => tile instanceof EmptyTile || (tile as Piece).color === color)
            .map(({ coords }) => coords)
    }
}

export const kingMoves: PieceDescription<KingInfo> = {
    type: PieceType.King,
    move: (
        { source, color, shortCastleRight, longCastleRight },
        ray,
        singleSquare,
        _kingInCheckAfter: (coords: BoardCoords) => boolean,
        isSquareAttacked): BoardCoords[] => {
        const normalMoves = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
            .map(singleSquare)
            .filter(square => square != null)
            .filter(({ tile }) => tile instanceof EmptyTile || (tile as Piece).color === color)
            .map(({ coords }) => coords)
            .filter((coords) => !isSquareAttacked(coords));
        const check = isSquareAttacked(source);
        const castleMoves = check ? [] : [
            { cr: shortCastleRight, dir: Direction.Right, rookC: 7},
            { cr: longCastleRight, dir: Direction.Left, rookC: 0 }
        ]
            .filter(({ cr }) => cr)
            .map(({ dir, rookC }) => { return { r: ray(dir), rookC } })
            .filter(({ r: { hit } }, rookC) => {
                return hit && hit.coords.c == rookC;
            })
            .filter(({ r: { empty } }) => { empty.slice(0, 1).every((t) => !isSquareAttacked(t)) })
            .map(({ r: { empty } }) => empty[1])

        return [...normalMoves, ...castleMoves];
    }
}

/*

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