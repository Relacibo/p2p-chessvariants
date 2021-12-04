import { Coords, Piece, VariantState, BoardState, TileData, ReservePileState, BoardCoords, ReservePileCoords } from "./types";

export function getPieceAt(state: { boardState?: BoardState | BoardState[], reservePile?: ReservePileState | ReservePileState[] }, coords: Coords): Piece | null {
    if (coords instanceof BoardCoords) {
        const { gameIndex, c, r } = coords;
        let board: BoardState;
        if (isSingularBoardState(state.boardState)) {
            if (gameIndex != 0) {
                return null;
            }
            board = state.boardState;
        } else {
            if (typeof gameIndex == "undefined") {
                return null;
            }
            board = state.boardState[gameIndex];
        }
        const tileData = board[r][c];
        return tileData instanceof Piece ? tileData : null;
    } else if (coords instanceof ReservePileCoords) {
        if (state.reservePile === null) {
            return null;
        }
        const { gameIndex, index } = coords;
        if (index == null) {
            return null;
        }
        let reservePile: ReservePileState;
        if (isSingularReservePile(state.reservePile)) {
            if (gameIndex != 0) {
                return null;
            }
            reservePile = state.reservePile;
        } else {
            if (typeof gameIndex == "undefined") {
                return null;
            }
            reservePile = state.reservePile[gameIndex];
        }
        const piece = reservePile[index];
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