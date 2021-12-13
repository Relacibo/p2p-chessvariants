import {
  BoardCoords,
  Direction,
  EmptyTile,
  Piece,
  PieceColor,
  PieceDescription,
  PieceInfo,
  PieceType,
} from "./types";
import { getDiagonalDirections, getPerpendicularDirections } from "./util";

export interface KingInfo extends PieceInfo {
  shortCastleRight: boolean;
  longCastleRight: boolean;
}

export interface PawnInfo extends PieceInfo {
  enPassantSquare: BoardCoords | null;
}

export const bishopMoves: PieceDescription<PieceInfo> = {
  type: PieceType.Bishop,
  move: (
    { color },
    ray,
    _singleSquares,
    kingInCheckAfter,
    _isSquareAttacked
  ): BoardCoords[] => {
    return getDiagonalDirections()
      .map(ray)
      .flatMap(({ empty, hit }) =>
        hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
      )
      .filter((coords) => !kingInCheckAfter(coords));
  },
};

export const queenMoves: PieceDescription<PieceInfo> = {
  type: PieceType.Queen,
  move: (
    { color },
    ray,
    _singleSquares,
    kingInCheckAfter,
    _isSquareAttacked
  ): BoardCoords[] => {
    return getDiagonalDirections()
      .concat(getPerpendicularDirections())
      .map(ray)
      .flatMap(({ empty, hit }) =>
        hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
      )
      .filter((coords) => !kingInCheckAfter(coords));
  },
};

export const rookMoves: PieceDescription<PieceInfo> = {
  type: PieceType.Rook,
  move: (
    { color },
    ray,
    _singleSquare,
    kingInCheckAfter,
    _isSquareAttacked
  ): BoardCoords[] => {
    return getPerpendicularDirections()
      .map(ray)
      .flatMap(({ empty, hit }) =>
        hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
      )
      .filter((coords) => !kingInCheckAfter(coords));
  },
};

export const knightMoves: PieceDescription<PieceInfo> = {
  type: PieceType.Knight,
  move: (
    { color },
    _ray,
    singleSquare,
    kingInCheckAfter,
    _isSquareAttacked
  ): BoardCoords[] => {
    return [
      [2, 1],
      [1, 2],
      [-1, 2],
      [-2, 1],
      [-2, -1],
      [-1, -2],
      [1, -2],
      [2, -1],
    ]
      .map(singleSquare)
      .filter(
        ({ tile }) =>
          tile instanceof EmptyTile || (tile as Piece).color !== color
      )
      .map(({ coords }) => coords)
      .filter((coords) => !kingInCheckAfter(coords));
  },
};

export const kingMoves: PieceDescription<KingInfo> = {
  type: PieceType.King,
  move: (
    { source, color, shortCastleRight, longCastleRight },
    ray,
    singleSquare,
    _kingInCheckAfter,
    isSquareAttacked
  ): BoardCoords[] => {
    const normalMoves = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ]
      .map(singleSquare)
      .filter((square) => square != null)
      .filter(
        ({ tile }) =>
          tile instanceof EmptyTile || (tile as Piece).color !== color
      )
      .map(({ coords }) => coords)
      .filter((coords) => !isSquareAttacked(coords));
    const check = isSquareAttacked(source);
    const castleMoves = check
      ? []
      : [
          { cr: shortCastleRight, dir: Direction.Right, rookC: 7 },
          { cr: longCastleRight, dir: Direction.Left, rookC: 0 },
        ]
          .filter(({ cr }) => cr)
          .map(({ dir, rookC }) => {
            return { r: ray(dir), rookC };
          })
          .filter(({ r: { hit } }, rookC) => {
            return hit && hit.coords.c == rookC;
          })
          .filter(({ r: { empty } }) => {
            empty.slice(0, 1).every((t) => !isSquareAttacked(t));
          })
          .map(({ r: { empty } }) => empty[1]);

    return [...normalMoves, ...castleMoves];
  },
};

export const pawnMoves: PieceDescription<PawnInfo> = {
  type: PieceType.Pawn,
  move: (
    { source, color, enPassantSquare },
    _ray,
    singleSquare,
    kingInCheckAfter: (coords: BoardCoords) => boolean,
    _isSquareAttacked
  ): BoardCoords[] => {
    let pawnRDirection;
    let startingR;
    if (color === PieceColor.White) {
      pawnRDirection = 1;
      startingR = 1;
    } else {
      pawnRDirection = -1;
      startingR = 6;
    }
    let moves = [];
    const { coords, tile } = singleSquare([pawnRDirection, 0]);
    const tileEmpty = tile instanceof EmptyTile;
    if (tileEmpty && !kingInCheckAfter(coords)) {
      moves.push(coords);
    }
    if (tileEmpty && source.r == startingR) {
      const { coords, tile } = singleSquare([pawnRDirection * 2, 0]);
      if (tile instanceof EmptyTile && !kingInCheckAfter(coords)) {
        moves.push(coords);
      }
    }

    const captures = [
      [pawnRDirection, -1],
      [pawnRDirection, 1],
    ]
      .map(singleSquare)
      .filter(
        ({ coords, tile }) =>
          tile != null &&
          ((tile instanceof Piece && (tile as Piece).color !== color) ||
            (enPassantSquare != null && coords.equals(enPassantSquare)))
      )
      .map(({ coords }) => coords);

    return [...moves, ...captures];
  },
};
