export interface VariantState {
    status: VariantStatus,
    boardStates: BoardState | BoardState[],
    reservePile: ReservePileState | ReservePileState[],
}

export type VariantStatus = {
    type: VariantStatusType.NotStarted,
} | {
    type: VariantStatusType.Ongoing,
    onMoveIndex: number | number[],
} | {
    type: VariantStatusType.NeverStarted,
    reason: string,
} | {
    type: VariantStatusType.Draw
} | {
    type: VariantStatusType.Decisive,
    winnerIndex: number,
    reason: string,
}

export enum VariantStatusType {
    NotStarted,
    Ongoing,
    NeverStarted,
    Draw,
    Decisive,
}

export type BoardState = TileData[][];
export type ReservePileState = Piece[];

export type TileData = null | EmptyTile | Piece

export type EmptyTile = {
    type: TileDataType.Empty
}

export type Piece = {
    type: TileDataType.Piece,
    color: number,
    piece: number,
}

export enum TileDataType {
    None,
    Empty,
    Piece
}

export type SquareCoords = {
    c: number,
    r: number,
}

export type Coords = SquareCoords | BoardCoords | ReservePileCoords;

export enum CoordType {
    Board,
    ReservePile,
}

export type BoardCoords = {
    type: CoordType.Board,
    gameIndex?: number,
    coords: SquareCoords,
}

export type ReservePileCoords = {
    type: CoordType.ReservePile,
    gameIndex?: number,
    index?: number,
}