import { ChessVariantState } from "./hardcodedVariants";
import { BoardCoords, EmptyTile, Piece, PieceColor, PieceDescription, PieceType } from "./types";
import { getDiagonalDirections, getPerpendicularDirections } from "./util";

export type KingExtraInfo = {
    castleRights: {
        white: { short: boolean, long: boolean },
        black: { short: boolean, long: boolean },
    }
}

export type PawnExtraInfo = {
    enPassantSquare: BoardCoords | null
}

export const bishopMoves: PieceDescription<{}> = {
    type: PieceType.Bishop,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares): Set<BoardCoords> => {
        const ret = getDiagonalDirections().flatMap((d) => ray(d))
            .filter(({ tile }) => {
                return tile instanceof EmptyTile || (tile as Piece).color !== ownColor;
            })
            .map(({ coords }) => coords);
        return new Set(ret)
    }
}

export const queenMoves: PieceDescription<{}> = {
    type: PieceType.Bishop,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares): Set<BoardCoords> => {
        const ret = getDiagonalDirections().concat(getPerpendicularDirections()).flatMap((d) => ray(d))
            .filter(({ tile }) => {
                return tile instanceof EmptyTile || (tile as Piece).color !== ownColor;
            })
            .map(({ coords }) => coords);
        return new Set(ret)
    }
}

export const rookMoves: PieceDescription<{}> = {
    type: PieceType.Bishop,
    move: (
        _extraInfo,
        _source,
        ownColor,
        ray,
        _singleSquares): Set<BoardCoords> => {
        const ret = getPerpendicularDirections().flatMap((d) => ray(d))
            .filter(({ tile }) => {
                return tile instanceof EmptyTile || (tile as Piece).color !== ownColor;
            })
            .map(({ coords }) => coords);
        return new Set(ret)
    }
}