import { assert } from "console";
import { BoardCoords, BoardOrientation, BoardState, Coords, EmptyTile, Ongoing, Piece, PieceColor, PieceType, VariantState } from "./types";
import { getPieceAt } from "./util";
import { VariantDescription } from "./variantDescription";

interface ChessVariantState extends VariantState {
    enPassantSquare: BoardCoords | null,
    castleRights: {
        whiteShort: boolean,
        whiteLong: boolean,
        blackShort: boolean,
        blackLong: boolean,
    },
    noPawnMoveAndCaptureSince: number,
    positionHashes: string[]
}

export const chess: VariantDescription = {
    name: "chess",
    canMoveEnemyPieces: false,
    minimumPlayers: 2,
    maximumPlayers: 2,
    possibleDestinations: function (state: ChessVariantState, coords: BoardCoords): BoardCoords[] {
        const boardState = state.boardState as BoardState;
        const { c, r } = coords as BoardCoords;
        const { color, piece } = boardState[r][c] as Piece;
        const isInBounds = (coords: { r: number; c: number; }): boolean => {
            return r >= 0 && c >= 0 && r < 8 && c < 8;
        };
        const opponentColor = color == PieceColor.White ? PieceColor.Black : PieceColor.White;
        const capturablePiece = (piece: Piece | null): boolean => piece?.color === opponentColor;
        let king = new Piece(color, PieceType.King);
        let kingPosition = boardState.flatMap((row, r) => row.map((data, c) => { return { c, r, data }; })).find(({ data }) => king.equals(data));
        if (typeof kingPosition === "undefined") {
            return [];
        }
        const findAttackedTiles = (state: BoardState, source: BoardCoords, p?: Piece): BoardCoords[] => {
            const { piece, color } = (typeof p === "undefined") ? getPieceAt({ boardState: state }, coords)! : p;
            switch (piece) {
                case PieceType.Rook: {
                }
                case PieceType.Pawn: {
                    const pawnDirection = color == PieceColor.White ? 1 : -1;
                    const captureSquares = [
                        new BoardCoords(r + pawnDirection, c - 1),
                        new BoardCoords(r + pawnDirection, c + 1)
                    ].filter(isInBounds).filter(coords => capturablePiece(getPieceAt({ boardState: state }, coords)));
                    const moveSquares = [];
                    return captureSquares;
                }
            }
            return [];
        };
        const isLegalPosition = (board: BoardState, kingPosition: BoardCoords) => {
        };
        return findAttackedTiles(boardState, coords);
    },
    move: function (state: ChessVariantState, source: BoardCoords, destination: BoardCoords): ChessVariantState {
        const boardState = state.boardState as BoardState;
        const { c: cSource, r: rSource } = source;
        const { c: cDestination, r: rDestination } = destination;
        const piece = boardState[rSource][cSource] as Piece;
        boardState[rSource][cSource] = new EmptyTile();
        boardState[rDestination][cDestination] = piece;
        return state;
    },
    initialState: function (base: VariantState<Ongoing>, playerIndex: number): ChessVariantState {
        const boardState: BoardState = [];
        return {
            ...base,
            boardState,
            enPassantSquare: null,
            castleRights: {
                whiteShort: true,
                whiteLong: true,
                blackShort: true,
                blackLong: true,
            },
            noPawnMoveAndCaptureSince: 0,
            positionHashes: []
        };
    },
    playerIndex2Color: function (index: number): PieceColor {
        switch (index) {
            case 1: return PieceColor.Black;
            default: return PieceColor.White;
        }
    },
    color2PlayerIndex: function (color: PieceColor): number {
        switch (color) {
            case PieceColor.White: return 0;
            case PieceColor.Black: return 1;
        }
    },
    playerIndex2Orientation: function (playerIndex: number): BoardOrientation | BoardOrientation[] {
        switch (playerIndex) {
            case 1: return BoardOrientation.Rotation180;
            default: return BoardOrientation.NoRotiation;
        }
    },
    promote: function (state: VariantState, destination: Coords, piece: Piece): VariantState {
        throw new Error("Function not implemented.");
    }
}