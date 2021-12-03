import { BoardCoords, Coords, CoordType, Ongoing, Piece, PieceColor, SquareCoords, VariantState } from "./Types";

export interface VariantDescription {
    name: string;
    possibleDestinations(state: VariantState<Ongoing>, coords: Coords, playerIndex: number): Coords[];
    move(state: VariantState<Ongoing>, source: Coords, destination: Coords, playerIndex: number): VariantState<Ongoing>;
    initialState(bare: VariantState<Ongoing>): VariantState<Ongoing>;
    playerIndex2Color(index: number): PieceColor | null;
    color2PlayerIndex(color: PieceColor): number | null;
    state2StorageString(state: VariantState<Ongoing>): string;
    storageString2State(storageString: string): VariantState<Ongoing>;
}