import { Coords, Piece, VariantState, BoardState, TileData, ReservePileState, BoardCoords, ReservePileCoords, PieceColor, PieceType } from "./types";

export function getPieceAt({ boardState, reservePile }: { boardState?: BoardState | BoardState[], reservePile?: null | ReservePileState | ReservePileState[] }, coords: Coords): Piece | null {
    if (coords instanceof BoardCoords) {
        if (typeof boardState == "undefined") {
            return null;
        }
        const tileData = getTileAt(boardState, coords);
        return tileData instanceof Piece ? tileData : null;
    } else if (coords instanceof ReservePileCoords) {
        if (typeof reservePile == "undefined" || reservePile === null) {
            return null;
        }
        const { gameIndex, index } = coords;
        if (index == null) {
            return null;
        }
        let pile: ReservePileState;
        if (isSingularReservePile(reservePile)) {
            if (gameIndex != 0) {
                return null;
            }
            pile = reservePile;
        } else {
            if (typeof gameIndex == "undefined") {
                return null;
            }
            pile = reservePile[gameIndex];
        }
        const piece = pile[index];
        return piece ? piece : null;
    }
    return null;
}

export function getTileAt(boardState: BoardState | BoardState[], { gameIndex, c, r }: BoardCoords): TileData | null {
    let board: BoardState;
    if (isSingularBoardState(boardState)) {
        if (gameIndex != 0) {
            return null;
        }
        board = boardState;
    } else {
        if (typeof gameIndex == "undefined") {
            return null;
        }
        board = boardState[gameIndex];
    }
    return board[r][c];
}

export function getPositionsOfPiece(boardState: BoardState, piece: Piece): { c: number, r: number }[] {
    return boardState.flatMap((row, r) =>
        row.map((data, c) => {
            return { c, r, data };
        })
    ).filter(({ data }) =>
        piece.equals(data)
    ).map(({ c, r }) => {
        return { c, r };
    });
}

export function isSingularBoardState(boardState: BoardState | BoardState[]): boardState is BoardState {
    return !boardState[0] || !Array.isArray(boardState[0][0]);
}

export function isSingularReservePile(reservePile: ReservePileState | ReservePileState[]): reservePile is ReservePileState {
    return !reservePile[0] || !Array.isArray(reservePile[0]);
}