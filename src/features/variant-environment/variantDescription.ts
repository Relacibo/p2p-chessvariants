import { BoardCoords, Coords, CoordType, SquareCoords, VariantState } from "./Types";

export interface VariantDescription {
    possibleDestinations(state: VariantState, coords: Coords, playerIndex?: number): Coords[];
    move(state: VariantState, source: Coords, destination: Coords, playerIndex?: number): VariantState;
    initialState(): VariantState;
    state2StorageString(state: VariantState): string;
    storageString2State(compactString: string): VariantState;
}