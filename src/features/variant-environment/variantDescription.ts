import { BoardOrientation, BoardState, Coords, PieceColor, VariantState } from "./types";

export interface VariantDescription {
    name: string;
    canMoveEnemyPieces: boolean;
    minimumPlayers: number;
    maximumPlayers:number;
    possibleDestinations(state: VariantState, coords: Coords, playerIndex?: number): Coords[];
    move(state: VariantState, source: Coords, destination: Coords, playerIndex?: number): VariantState;
    initialState(base: VariantState, playerCount: number, localPlayerIndex: number): VariantState;
    playerIndex2Color(index: number): PieceColor | null;
    color2PlayerIndex(color: PieceColor): number | null;
    playerIndex2Orientation(playerIndex: number): BoardOrientation | BoardOrientation[];
    createPositionString?(state: VariantState): string;
}