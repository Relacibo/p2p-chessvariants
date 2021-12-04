export interface VariantState<T extends VariantStatus = VariantStatus> {
    status: T,
    onMoveIndex: number | number[],
    canClaimDraw: number | number[],
    boardState: BoardState | BoardState[],
    reservePile: null | ReservePileState | ReservePileState[],
}

export interface VariantStatus { }

export class NotStarted implements VariantStatus { }

export class Ongoing implements VariantStatus { }

export class NeverStarted implements VariantStatus {
    constructor(readonly reason: string) { }
}

export class Draw implements VariantStatus { }

export class Decisive implements VariantStatus {
    constructor(readonly winnerIndex: number, readonly reason: string) { }
}

export type BoardState = (TileData | null)[][];
export type ReservePileState = Piece[];

export interface TileData {
    equals(other: TileData | null): boolean;
}

export class EmptyTile {
    equals(other: TileData | null) {
        return other instanceof EmptyTile;
    }
}
export class Piece {
    constructor(readonly color: PieceColor, readonly piece: PieceType) { }
    equals(other: TileData | null): boolean {
        return (other instanceof Piece) && this.color == other.color && this.piece == other.piece;
    }
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

export enum BoardOrientation {
    NoRotiation = 0,
    Rotation90 = 1,
    Rotation180 = 2,
    Rotation270 = 3,
}

export interface Coords {
    equals(other: Coords): boolean;
}

export class BoardCoords implements Coords {
    constructor(readonly c: number, readonly r: number, readonly gameIndex?: number) { }
    equals(other: Coords): boolean {
        if (!(other instanceof BoardCoords)) {
            return false;
        }
        return this.c == other.c && this.r == other.r && this.gameIndex == other.gameIndex;
    }
}

export class ReservePileCoords implements Coords {
    constructor(readonly index: number | null = null, readonly gameIndex?: number) { }
    equals(other: Coords): boolean {
        if (!(other instanceof ReservePileCoords)) {
            return false;
        }
        return this.index == other.index && this.gameIndex == other.gameIndex;
    }
}