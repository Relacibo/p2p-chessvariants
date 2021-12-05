import { Coords, Piece, VariantState, BoardState, TileData, ReservePileState, BoardCoords, ReservePileCoords } from "./types";

export function getPieceAt({ boardState, reservePile }: { boardState?: BoardState | BoardState[], reservePile?: null | ReservePileState | ReservePileState[] }, coords: Coords): Piece | null {
    if (coords instanceof BoardCoords) {
        if (typeof boardState == "undefined") {
            return null;
        }
        const { gameIndex, c, r } = coords;
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
        const tileData = board[r][c];
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

export function isSingularBoardState(boardState: BoardState | BoardState[]): boardState is BoardState {
    return !boardState[0] || !Array.isArray(boardState[0][0]);
}

export function isSingularReservePile(reservePile: ReservePileState | ReservePileState[]): reservePile is ReservePileState {
    return !reservePile[0] || !Array.isArray(reservePile[0]);
}