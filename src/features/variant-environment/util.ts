import { Coords, Piece, VariantState, BoardState, TileData, ReservePileState, BoardCoords, ReservePileCoords, PieceColor, PieceType, Direction, EmptyTile } from "./types";

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
        return pile[index];
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
    return typeof board[r] !== "undefined" ? board[r][c] : null;
}

export function getPositionsOfPiece(boardState: BoardState | BoardState[], piece: Piece, gameIndex?: number): BoardCoords[] {
    let board: BoardState;
    if (isSingularBoardState(boardState)) {
        if (gameIndex != 0) {
            return [];
        }
        board = boardState;
    } else {
        if (typeof gameIndex == "undefined") {
            return [];
        }
        board = boardState[gameIndex];
    }
    return board.flatMap((row, r) =>
        row.map((data, c) => {
            return { coords: new BoardCoords(c, r, gameIndex), data };
        })
    ).filter(({ data }) =>
        piece.equals(data)
    ).map(({ coords }) => {
        return coords;
    });
}

export function isSingularBoardState(boardState: BoardState | BoardState[]): boardState is BoardState {
    return !boardState[0] || !Array.isArray(boardState[0][0]);
}

export function isSingularReservePile(reservePile: ReservePileState | ReservePileState[]): reservePile is ReservePileState {
    return !reservePile[0] || !Array.isArray(reservePile[0]);
}

export function directionToVec(direction: Direction): number[] {
    switch (direction) {
        case Direction.Top: return [1, 0];
        case Direction.TopRight: return [1, 1];
        case Direction.Right: return [0, 1];
        case Direction.BottomRight: return [-1, 1];
        case Direction.Bottom: return [-1, 0];
        case Direction.BottomLeft: return [-1, -1];
        case Direction.Left: return [0, -1];
        case Direction.TopLeft: return [1, -1];
    }
}

export function castRay(state: BoardState | BoardState[], coords: BoardCoords, direction: Direction): { coords: BoardCoords; tile: TileData; }[] {
    let ret = [];
    const vec = directionToVec(direction);
    let tile: TileData | null = new EmptyTile();
    while (true) {
        coords = coords.addArray(vec);
        tile = getTileAt(state, coords);
        if (tile == null) {
            break;
        }
        ret.push({ coords, tile });
        if (!(tile instanceof EmptyTile)) {
            break;
        }
    }

    return ret;
}
export function singleSquares(state: BoardState | BoardState[], source: BoardCoords, squares: number[][]): { coords: BoardCoords; tile: TileData; }[] {
    return squares
        .map(delta => source.addArray(delta))
        .flatMap(coords => {
            const tile = getTileAt(state, coords);
            return tile !== null ? [{ coords, tile }] : [];
        })
}

export function getDiagonalDirections() {
    return [Direction.TopRight, Direction.BottomRight, Direction.BottomLeft, Direction.TopLeft]
}

export function getPerpendicularDirections() {
    return [Direction.Top, Direction.Right, Direction.Bottom, Direction.Left]
}