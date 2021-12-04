import { assert } from "console";
import { BoardCoords, BoardOrientation, BoardState, Coords, Ongoing, Piece, PieceColor, PieceType, VariantState } from "./types";
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
        const isInBounds = (coords: { r: number, c: number }): boolean => {
            return r >= 0 && c >= 0 && r < 8 && c < 8;
        }
        const opponentColor = color == PieceColor.White ? PieceColor.Black : PieceColor.White;
        const capturablePiece = (piece: Piece | null): boolean => piece?.color === opponentColor;
        let king = new Piece(color, PieceType.King);
        let kingPosition = null;
        for (let r = 0; r < boardState.length; r++) {
            for (let c = 0; c < boardState[r].length; c++) {
                const tileData = boardState[r][c];
                if (king.equals(tileData)) {
                    kingPosition = new BoardCoords(c, r);
                    break;
                }
            }
            if (kingPosition != null) {
                break;
            }
        }
        const isLegalPosition = (board: BoardState, kingPosition: BoardCoords) => {
        };
        switch (piece) {
            case PieceType.Pawn: {
                const pawnDirection = color == PieceColor.White ? 1 : -1;
                const captureSquares = [
                    new BoardCoords(r + pawnDirection, c - 1),
                    new BoardCoords(r + pawnDirection, c - 1)
                ].filter(isInBounds).filter(coords => capturablePiece(getPieceAt(state, coords)));
                const moveSquares = 
                return captureSquares;
            }
        }
        return [];
    },
    move: function (state: ChessVariantState, source: BoardCoords, destination: BoardCoords): ChessVariantState {
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
            fens: []
        };
    },
    playerIndex2Color: function (index: 0 | 1): PieceColor {
        switch (index) {
            case 0: return PieceColor.White;
            case 1: return PieceColor.Black;
        }
    },
    color2PlayerIndex: function (color: PieceColor): number {
        switch (color) {
            case PieceColor.White: return 0;
            case PieceColor.Black: return 1;
        }
    },
    playerIndex2Orientation: function (playerIndex: 0 | 1): BoardOrientation | BoardOrientation[] {
        switch (playerIndex) {
            case 0: return BoardOrientation.NoRotiation;
            case 1: return BoardOrientation.Rotation180;
        }
    }
}