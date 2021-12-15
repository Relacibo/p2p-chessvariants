import {
  BoardCoords,
  BoardOrientation,
  BoardState,
  Coords,
  Direction,
  EmptyTile,
  Piece,
  PieceColor,
  PieceDescription,
  PieceMoveContext,
  PieceType,
  VariantDescription,
  VariantState,
} from "./types";
import util from "./util";

export interface ChessVariantState extends VariantState {
  enPassantSquare: BoardCoords | null;
  castleRights: {
    white: { short: boolean; long: boolean };
    black: { short: boolean; long: boolean };
  };
  noPawnMoveAndCaptureSince: number;
  positionHashes: string[];
}

export interface ChessPieceContext {
  castleRights: {
    white: { short: boolean; long: boolean };
    black: { short: boolean; long: boolean };
  };
  enPassantSquare: BoardCoords | null;
}

const chessPieces: { [key: string]: PieceDescription<ChessPieceContext> } = {
  bishop: {
    type: PieceType.Bishop,
    move: ({ color, ray, kingInCheckAfter }): BoardCoords[] => {
      return util
        .getDiagonalDirections()
        .map(ray)
        .flatMap(({ empty, hit }) =>
          hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
        )
        .filter((coords) => !kingInCheckAfter(coords));
    },
  },

  queen: {
    type: PieceType.Queen,
    move: ({ color, ray, kingInCheckAfter }): BoardCoords[] => {
      return util
        .getDiagonalDirections()
        .concat(util.getPerpendicularDirections())
        .map(ray)
        .flatMap(({ empty, hit }) =>
          hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
        )
        .filter((coords) => !kingInCheckAfter(coords));
    },
  },

  rook: {
    type: PieceType.Rook,
    move: ({ color, ray, kingInCheckAfter }): BoardCoords[] => {
      return util
        .getPerpendicularDirections()
        .map(ray)
        .flatMap(({ empty, hit }) =>
          hit && hit.piece.color !== color ? [...empty, hit.coords] : empty
        )
        .filter((coords) => !kingInCheckAfter(coords));
    },
  },

  knight: {
    type: PieceType.Knight,
    move: ({ color, singleSquare, kingInCheckAfter }): BoardCoords[] => {
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
  },

  king: {
    type: PieceType.King,
    move: (
      { source, color, ray, singleSquare, isSquareAttacked },
      { castleRights }
    ): BoardCoords[] => {
      const { short, long } = castleRights[color];
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
            { cr: short, dir: Direction.Right, rookC: 7 },
            { cr: long, dir: Direction.Left, rookC: 0 },
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
  },
  pawn: {
    type: PieceType.Pawn,
    move: (
      { source, color, singleSquare, kingInCheckAfter },
      { enPassantSquare }
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
        .map(({ coords }) => coords)
        .filter((coords) => !kingInCheckAfter(coords));

      return [...moves, ...captures];
    },
  },
};

const chess: VariantDescription<ChessVariantState> = {
  name: "chess",
  uuid: "1ca9e2d9-f242-4ca6-8d80-df5451fef65a",
  version: "0.0.1",
  apiVersion: "0.0.1",
  minimumPlayers: 2,
  maximumPlayers: 2,
  rows: 8,
  columns: 8,
  pieces: () => chessPieces,
  deriveCustomContext: (
    state: ChessVariantState
  ): ChessPieceContext | ChessPieceContext[] => {
    return {
      enPassantSquare: state.enPassantSquare,
      castleRights: state.castleRights,
    };
  },
  move(
    state: ChessVariantState,
    source: BoardCoords,
    destination: BoardCoords
  ): ChessVariantState {
    const boardState = state.boardState as BoardState;
    const { c: cSource, r: rSource } = source;
    const { c: cDestination, r: rDestination } = destination;
    const piece = boardState[rSource][cSource] as Piece;
    boardState[rSource][cSource] = new EmptyTile();
    boardState[rDestination][cDestination] = piece;
    return state;
  },
  initialState: (
    base: VariantState,
    playerIndex: number
  ): ChessVariantState => {
    const boardState: BoardState = [];
    return {
      ...base,
      boardState,
      enPassantSquare: null,
      castleRights: {
        white: { short: true, long: true },
        black: { short: true, long: true },
      },
      noPawnMoveAndCaptureSince: 0,
      positionHashes: [],
    };
  },
  playerIndex2Color: (index: number): PieceColor => {
    switch (index) {
      case 1:
        return PieceColor.Black;
      default:
        return PieceColor.White;
    }
  },
  color2PlayerIndex: (color: PieceColor): number => {
    switch (color) {
      case PieceColor.Black:
        return 1;
      default:
        return 0;
    }
  },
  playerIndex2Orientation: (
    playerIndex: number
  ): BoardOrientation | BoardOrientation[] => {
    switch (playerIndex) {
      case 1:
        return BoardOrientation.Rotation180;
      default:
        return BoardOrientation.NoRotiation;
    }
  },
  promote: (
    state: ChessVariantState,
    destination: Coords,
    piece: Piece
  ): ChessVariantState => {
    throw new Error("Function not implemented.");
  },
};

export default { description: chess, pieces: chessPieces };
