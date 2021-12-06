import { BoardCoords, BoardOrientation, BoardState, Coords, EmptyTile, Ongoing, Piece, PieceColor, PieceType, TileData, VariantState } from "./types";
import { getPositionsOfPiece, getPieceAt, isSingularBoardState, getTileAt } from "./util";
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
    positionHashes: string[],
}

class Chess implements VariantDescription {
    name = () => "chess";
    canMoveEnemyPieces = () => false;
    minimumPlayers = () => 2;
    maximumPlayers = () => 2;
    rows = () => 8;
    columns = () => 8;
    isInBounds({ r, c }: { r: number; c: number; }): boolean {
        return r >= 0 && c >= 0 && r < this.rows() && c < this.columns();
    };
    castRays(state: BoardState | BoardState[], source: BoardCoords, directions: number[][]) {
        let ret = [];
        for (const delta of directions) {
            let tile: TileData | null = new EmptyTile();
            let coords = source;
            while (true) {
                coords = coords.addArray(delta);
                if (!this.isInBounds(coords)) {
                    break;
                }
                tile = getTileAt(state, coords);
                ret.push({ coords, tile });
                if (tile == null || !(tile instanceof EmptyTile)) {
                    break;
                }
            }
        }
        return ret;
    }
    getColorOfPiece(boardState: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        if (typeof ownColor === "undefined") {
            ownColor = getPieceAt({ boardState }, source)?.color;
        }
        return ownColor!;
    }
    singleSquares(state: BoardState | BoardState[], source: BoardCoords, squares: number[][]) {
        return squares
            .map(delta => source.addArray(delta))
            .filter(this.isInBounds)
            .map(coords => { return { coords, tile: getTileAt(state, coords) }; })
    }
    canPieceMoveOnSquare(tile: TileData | null, ownColor: PieceColor) {
        return tile != null && (tile instanceof EmptyTile || this.isPieceCapturable(ownColor!, tile as Piece));
    }
    rookAttacks(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.castRays(state, source, [[1, 0], [0, 1], [-1, 0], [0, -1]])
            .filter(({ tile }) => this.canPieceMoveOnSquare(tile, ownColor!))
            .map(({ coords }) => coords);;
    }
    bishopAttacks(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.castRays(state, source, [[1, 1], [1, -1], [-1, -1], [-1, 1]])
            .filter(({ tile }) => this.canPieceMoveOnSquare(tile, ownColor!))
            .map(({ coords }) => coords);;;
    }
    queenAttacks(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.castRays(state, source, [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, -1], [-1, 1]], ownColor);
    }
    knightAttacks(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.singleSquares(state, source, [[2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]])
            .filter(({ tile }) => this.canPieceMoveOnSquare(tile, ownColor!))
            .map(({ coords }) => coords);
    }
    kingAttacks(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.singleSquares(state, source, [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]])
            .filter(({ tile }) => this.canPieceMoveOnSquare(tile, ownColor!))
            .map(({ coords }) => coords);
    }
    castleMoves(state: BoardState | BoardState[], source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        const isWhite = ownColor === PieceColor.White;
        if (isWhite) { }
    }
    pawnCaptures(state: BoardState | BoardState[], ep: BoardCoords | null, source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        return this.singleSquares(state, source, ownColor === PieceColor.White ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]])
            .filter(({ coords, tile }) =>
                tile != null &&
                (
                    (tile instanceof Piece && this.isPieceCapturable(ownColor!, tile)) ||
                    ep != null && coords.equals(ep)
                )
            )
            .map(({ coords }) => coords);;
    }
    pawnMoves(state: BoardState | BoardState[], ep: BoardCoords | null, source: BoardCoords, ownColor?: PieceColor) {
        ownColor = this.getColorOfPiece(state, source, ownColor);
        const isWhite = ownColor === PieceColor.White;
        let moves = this.singleSquares(state, source, isWhite ? [[1, 0]] : [[-1, 0]])
            .filter(({ tile }) =>
                tile instanceof EmptyTile
            )
            .map(({ coords }) => coords);
        if (moves.length > 0 && (isWhite && source.r == 1 || !isWhite && source.r == 6)) {
            const startingJump = this.singleSquares(state, source, isWhite ? [[2, 0]] : [[-2, 0]]).filter(({ tile }) =>
                tile instanceof EmptyTile
            ).map(({ coords }) => coords);
            moves = [...moves, ...startingJump]
        }
        return moves;
    }
    isSquareAttacked(state: BoardState | BoardState[], source: BoardCoords, opponentColor: PieceColor): boolean {
        return false;
    }
    isPieceCapturable(ownColor: PieceColor, piece: Piece | null) {
        return piece?.color === (ownColor === PieceColor.White ? PieceColor.Black : PieceColor.White);
    }
    possibleDestinations(state: ChessVariantState, coords: BoardCoords): BoardCoords[] {
        const boardState = state.boardState as BoardState;
        const { c, r } = coords as BoardCoords;
        const { color, piece } = boardState[r][c] as Piece;
        let kingPosition = getPositionsOfPiece(boardState, new Piece(color, PieceType.King))[0];
        if (typeof kingPosition === "undefined") {
            return [];
        }

        const isLegalPosition = (board: BoardState, kingPosition: BoardCoords) => {
        };
        return Chess.findAttackedTiles(boardState, coords);
    }
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
            castleRights: {
                whiteShort: true,
                whiteLong: true,
                blackShort: true,
                blackLong: true,
            },
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
