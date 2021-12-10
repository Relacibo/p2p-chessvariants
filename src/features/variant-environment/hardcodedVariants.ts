import { BoardCoords, BoardOrientation, BoardState, Coords, EmptyTile, Ongoing, Piece, PieceColor, PieceType, TileData, VariantDescription, VariantState } from "./types";
import { getPositionsOfPiece, getPieceAt, isSingularBoardState, getTileAt } from "./util";

export interface ChessVariantState extends VariantState {
    enPassantSquare: BoardCoords | null,
    castleRights: {
        white: { short: boolean, long: boolean },
        black: { short: boolean, long: boolean },
    },
    noPawnMoveAndCaptureSince: number,
    positionHashes: string[],
}

class Chess implements VariantDescription {
    name = () => "chess";
    canMoveEnemyPieces = () => false;
    minimumPlayers = () => 2;
    maximumPlayers = () => 2;
    rows = () => 8;
    columns = () => 8;
    possibleDestinations(state: VariantState, coords: Coords, playerIndex?: number): Coords[] {
        throw new Error("Method not implemented.");
    }
    /*getAttackers({ boardState }: ChessVariantState, source: BoardCoords, ownColor: PieceColor): {
        diagonal: {
            coords: BoardCoords;
            tile: Piece;
        }[],
        horizontalOrVertical: {
            coords: BoardCoords;
            tile: Piece;
        }[],
        knightAttackers: {
            coords: BoardCoords;
            tile: Piece;
        }[],
        kingAttackers: {
            coords: BoardCoords;
            tile: Piece;
        }[],
        pawnAttackers: {
            coords: BoardCoords;
            tile: Piece;
        }[]
    } {
        const opponentColor = ownColor === PieceColor.White ? PieceColor.Black : PieceColor.White;
        const diagonal = this.castRays(boardState, source, [[1, 1], [1, -1], [-1, -1], [-1, 1]]).filter(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Bishop || tile.piece === PieceType.Queen)
        ) as {
            coords: BoardCoords;
            tile: Piece;
        }[];
        const horizontalOrVertical = this.castRays(boardState, source, [[1, 0], [0, 1], [-1, 0], [0, -1]]).filter(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Rook || tile.piece === PieceType.Queen)
        ) as {
            coords: BoardCoords;
            tile: Piece;
        }[];

        const knightAttackers = this.singleSquares(boardState, source, [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]]).filter(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Knight)
        ) as {
            coords: BoardCoords;
            tile: Piece;
        }[];
        const kingAttackers = this.singleSquares(boardState, source, [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]).filter(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.King)
        ) as {
            coords: BoardCoords;
            tile: Piece;
        }[];
        const pawnAttackers = this.singleSquares(boardState, source, ownColor === PieceColor.White ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]).filter(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Pawn)
        ) as {
            coords: BoardCoords;
            tile: Piece;
        }[];
        return {
            diagonal,
            horizontalOrVertical,
            knightAttackers,
            kingAttackers,
            pawnAttackers
        };
    }
    isSquareAttacked({ boardState }: ChessVariantState, source: BoardCoords, ownColor: PieceColor): boolean {
        const opponentColor = ownColor === PieceColor.White ? PieceColor.Black : PieceColor.White;
        const diagonalAttacker = this.castRays(boardState, source, [[1, 1], [1, -1], [-1, -1], [-1, 1]]).find(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Bishop || tile.piece === PieceType.Queen)
        );
        if (typeof diagonalAttacker !== "undefined") {
            return true;
        }
        const horizontalOrVerticalAttacker = this.castRays(boardState, source, [[1, 0], [0, 1], [-1, 0], [0, -1]]).find(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Rook || tile.piece === PieceType.Queen)
        );
        if (typeof horizontalOrVerticalAttacker !== "undefined") {
            return true;
        }
        const knightAttacker = this.singleSquares(boardState, source, [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]]).find(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Knight)
        );
        if (typeof knightAttacker !== "undefined") {
            return true;
        }
        const kingAttacker = this.singleSquares(boardState, source, [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]).find(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.King)
        );
        if (typeof kingAttacker !== "undefined") {
            return true;
        }
        const pawnAttacker = this.singleSquares(boardState, source, ownColor === PieceColor.White ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]).find(({ tile }) =>
            tile instanceof Piece && tile.color === opponentColor && (tile.piece === PieceType.Pawn)
        );
        return typeof pawnAttacker !== "undefined";
    }
    findMovesForPiece(state: ChessVariantState, source: BoardCoords, piece?: PieceType, ownColor?: PieceColor, directionFilter?: (direction: number[]) => boolean): BoardCoords[] {
        if (typeof piece === "undefined" || typeof ownColor === "undefined") {
            const p = getPieceAt(state, source);
            piece = typeof piece === "undefined" ? p?.piece : piece;
            ownColor = typeof ownColor === "undefined" ? p?.color : ownColor;
        }
        return this.getPieceMovesFunctions[piece!]({ state, source, ownColor: ownColor!, directionFilter });
    }
    possibleDestinations(state: ChessVariantState, source: BoardCoords): BoardCoords[] {
        const { boardState } = state;
        const { color: ownColor, piece } = getPieceAt(state, source)!;
        if (piece === PieceType.King) {
            return this.findMovesForPiece(state, source, piece, ownColor).filter((destination) => {
                return !this.isSquareAttacked(state, destination, ownColor);
            })
        } else {
            const kingPosition = getPositionsOfPiece(boardState, new Piece(ownColor, PieceType.King))[0];
            const attackers = this.getAttackers(state, kingPosition, ownColor);
            const {
                diagonal,
                horizontalOrVertical,
                knightAttackers,
                pawnAttackers
            } = attackers;
            if (knightAttackers.length > 0 || pawnAttackers.length > 0) {
                return [];
            }
            if (diagonal.length != 0 || horizontalOrVertical.length != 0) {
                // Its check. Find moves that block the check, when not pinned.
                if (diagonal.length + horizontalOrVertical.length > 1) {
                    return [];
                }
                // Todo: check if pinned!
                return this.findMovesForPiece(state, source, piece, ownColor).filter((destination) => {
                    return this.movesIntoRay(state, kingPosition, attackers, source, destination);
                });
            } else {
                const direction = this.getDirectionBetweenSquares(kingPosition, source);
                if (direction === null) {
                    return this.findMovesForPiece(state, source, piece, ownColor);
                }
                if (piece == PieceType.Knight) {
                    return [];
                }
                const neg = negateDirection(direction);
                const ray = this.castRays(boardState, source, neg)
                const target = ray[ray.length - 1];
                if (typeof target === "undefined" ||
                    !(target instanceof Piece) ||
                    target.color === ownColor)
                    this.findMovesForPiece(state, source, piece, ownColor, (dir) => dir === direction || dir === neg)

            }
            return moves.filter((destination) => {
                return !this.isSquareAttacked(newState, kingPosition, ownColor);
            }).map(({ destination }) => destination);
        }
    }*/
    move(state: ChessVariantState, source: BoardCoords, destination: BoardCoords): ChessVariantState {
        const boardState = state.boardState as BoardState;
        const { c: cSource, r: rSource } = source;
        const { c: cDestination, r: rDestination } = destination;
        const piece = boardState[rSource][cSource] as Piece;
        boardState[rSource][cSource] = new EmptyTile();
        boardState[rDestination][cDestination] = piece;
        return state;
    }
    initialState(base: VariantState, playerIndex: number): ChessVariantState {
        const boardState: BoardState = [];
        return {
            ...base,
            boardState,
            enPassantSquare: null,
            castleRights: { white: { short: true, long: true }, black: { short: true, long: true } },
            noPawnMoveAndCaptureSince: 0,
            positionHashes: []
        };
    }
    playerIndex2Color(index: number): PieceColor {
        switch (index) {
            case 1: return PieceColor.Black;
            default: return PieceColor.White;
        }
    }
    color2PlayerIndex(color: PieceColor): number {
        switch (color) {
            case PieceColor.Black: return 1;
            default: return 0;
        }
    }
    playerIndex2Orientation(playerIndex: number): BoardOrientation | BoardOrientation[] {
        switch (playerIndex) {
            case 1: return BoardOrientation.Rotation180;
            default: return BoardOrientation.NoRotiation;
        }
    }
    promote(state: VariantState, destination: Coords, piece: Piece): VariantState {
        throw new Error("Function not implemented.");
    }
}
export const chess = new Chess();
