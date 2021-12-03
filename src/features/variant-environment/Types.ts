export interface VariantState<T extends VariantStatus = VariantStatus> {
    status: T,
    boardState: BoardState | BoardState[],
    reservePile: ReservePileState | ReservePileState[],
}

export interface VariantStatus {
    type: VariantStatusType;
}

export interface NotStarted extends VariantStatus {
    type: VariantStatusType.NotStarted,
}

export interface Ongoing extends VariantStatus {
    type: VariantStatusType.Ongoing,
    onMoveIndex: number | number[],
}

export interface NeverStarted extends VariantStatus {
    type: VariantStatusType.NeverStarted,
    reason: string,
}

export interface Draw extends VariantStatus {
    type: VariantStatusType.Draw
}

export interface Decisive extends VariantStatus {
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
    color: PieceColor,
    piece: PieceType,
}

export enum PieceType {
    Pawn = 0,
    Knight = 1,
    Bishop = 2,
    Rook = 3,
    Queen = 4,
    King = 5
}

export enum PieceColor {
    White = 0,
    Black = 1,
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
