export interface VariantState {
  status: VariantStatus;
  onMoveIndex: number | number[];
  canClaimDraw: number | number[];
  boardState: BoardState | BoardState[];
  reservePile?: ReservePileState | ReservePileState[];
}

export interface VariantStatus {}

export class NotStarted implements VariantStatus {}

export class Ongoing implements VariantStatus {}

export class NeverStarted implements VariantStatus {
  constructor(readonly reason: string) {}
}

export class Draw implements VariantStatus {}

export class Decisive implements VariantStatus {
  constructor(readonly winnerIndex: number, readonly reason: string) {}
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
  constructor(readonly color: PieceColor, readonly piece: PieceType) {}
  equals(other: TileData | null): boolean {
    return (
      other instanceof Piece &&
      this.color == other.color &&
      this.piece == other.piece
    );
  }
}
export enum PieceType {
  Pawn = "pawn",
  Knight = "knight",
  Bishop = "bishop",
  Rook = "rook",
  Queen = "queen",
  King = "king",
}

export enum PieceColor {
  White = "white",
  Black = "black",
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
  constructor(
    readonly c: number,
    readonly r: number,
    readonly gameIndex?: number
  ) {}
  equals(other: Coords): boolean {
    if (!(other instanceof BoardCoords)) {
      return false;
    }
    return (
      this.c == other.c &&
      this.r == other.r &&
      this.gameIndex == other.gameIndex
    );
  }
  toArray() {
    return [this.c, this.r];
  }
  static fromArray([c, r]: number[], gameIndex?: number) {
    return new BoardCoords(c, r, gameIndex);
  }
  addArray([c, r]: number[]): BoardCoords {
    return new BoardCoords(this.c + c, this.r + r, this.gameIndex);
  }
  add({ c, r }: BoardCoords): BoardCoords {
    return new BoardCoords(this.c + c, this.r + r, this.gameIndex);
  }
}

export class ReservePileCoords implements Coords {
  constructor(
    readonly index: number | null = null,
    readonly gameIndex?: number
  ) {}
  equals(other: Coords): boolean {
    if (!(other instanceof ReservePileCoords)) {
      return false;
    }
    return this.index == other.index && this.gameIndex == other.gameIndex;
  }
}

export enum Direction {
  Top = 0,
  TopRight = 1,
  Right = 2,
  BottomRight = 3,
  Bottom = 4,
  BottomLeft = 5,
  Left = 6,
  TopLeft = 7,
}

export interface VariantDescription<T extends VariantState = VariantState> {
  name: string;
  uuid: string;
  version: string;
  apiVersion: string;
  minimumPlayers: number;
  maximumPlayers: number;
  rows: number;
  columns: number;

  pieces: () => { [piece: string]: PieceDescription<any> };
  deriveCustomContext(state: VariantState): any | any[];
  move(state: T, source: Coords, destination: Coords, playerIndex?: number): T;
  initialState(base: T, playerCount: number, localPlayerIndex: number): T;
  promote(state: T, destination: Coords, piece: Piece): T;
  playerIndex2Color(index: number): PieceColor | null;
  color2PlayerIndex(color: PieceColor): number | null;
  playerIndex2Orientation(
    playerIndex: number
  ): BoardOrientation | BoardOrientation[];
  state2StorageString?(state: T): string | null;
  storageString2StateArray?(storageString: string): T[];
  createPositionString?(state: T): string | null;
}

export interface PieceMoveContext {
  source: BoardCoords;
  color: PieceColor;
  ray: (direction: Direction) => {
    empty: BoardCoords[];
    hit?: { coords: BoardCoords; piece: Piece };
  };
  singleSquare: (jumps: number[]) => { coords: BoardCoords; tile: TileData };
  kingInCheckAfter: (coords: BoardCoords) => boolean;
  isSquareAttacked: (coords: BoardCoords) => boolean;
}

export interface PieceDescription<T = {}> {
  type: PieceType;
  move: (context: PieceMoveContext, customContext: T) => BoardCoords[];
}
