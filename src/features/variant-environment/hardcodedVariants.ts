import { BoardCoords, BoardState, Coords, Ongoing, Piece, PieceColor, SquareCoords, VariantState, VariantStatusType } from "./Types";
import { VariantDescription } from "./variantDescription";

interface ChessVariantState extends VariantState<Ongoing> {
    enPassantSquare: SquareCoords | null,
    castleRights: {
        whiteShort: boolean,
        whiteLong: boolean,
        blackShort: boolean,
        blackLong: boolean,
    },
    noPawnMoveAndCaptureSince: number,
    fens: string[]
}

export const chess: VariantDescription = {
    name: "chess",
    possibleDestinations: function ({ status, boardState }: ChessVariantState, coords: Coords, playerIndex: number): Coords[] {
        if (status.onMoveIndex != playerIndex) {
            return [];
        }
        const { c, r } = coords as SquareCoords;
        const { color, piece } = boardState[r][c] as Piece;
        const playerColor = chess.playerIndex2Color(playerIndex);
        if (color != playerColor) {
            return [];
        }
        switch (piece) {
            case 
        }
    },
    move: function (state: ChessVariantState, source: Coords, destination: Coords, playerIndex: number): ChessVariantState {
        if (state.status.onMoveIndex != playerIndex) {
            return state;
        }
    },
    initialState: function (bare: VariantState<Ongoing>): ChessVariantState {
        const boardState: BoardState = [];
        return {
            ...bare,
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
        }
    },
    state2StorageString: function (state: ChessVariantState): string {
        throw new Error("Function not implemented.");
    },
    storageString2State: function (storageString: string): ChessVariantState {
        throw new Error("Function not implemented.");
    },
    playerIndex2Color: function (index: number): PieceColor | null {
        switch (index) {
            case 0: return PieceColor.White;
            case 1: return PieceColor.Black;
            default: return null;
        }
    },
    color2PlayerIndex: function (color: PieceColor): number | null {
        switch (color) {
            case PieceColor.White: return 0;
            case PieceColor.Black: return 1;
            default: return null;
        }
    }
}