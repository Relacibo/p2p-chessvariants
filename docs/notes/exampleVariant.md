## Example Script file

```javascript
const { { chess }, util } = context
const fakeDescription = {
  name: "fake",
  uuid: "1a651e33-4228-4ee7-927f-889ddbfa3a89"
  version: "1.0.0",
  minimumPlayers: 2,
  maximumPlayers: 4,
  pieces: () => chess.pieces,
  deriveCustomContext(
      state: VariantState,
      gameIndex?: number
  ): U,
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
};

resolve(fakeDescription);
```

_VSCode Preview: `Ctrl+Shift+V`/`Ctrl+K V`_
