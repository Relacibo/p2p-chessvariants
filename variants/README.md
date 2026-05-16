# Chess Variants Collection

Community-maintained collection of chess variant scripts for p2p-chessvariants.

Each variant is a Rhai script that defines game rules via the scripting API.

## Available Variants

### Standard Chess
- **File:** `standard_chess.rhai` (not yet included)
- **Players:** 2
- **Description:** Classic chess rules

### Bughouse (Tandem Chess)
- **File:** `bughouse.rhai`
- **Players:** 4 (2 teams of 2)
- **Description:** Partners play opposite boards. Captured pieces are transferred to your partner's side.
- **Key Rules:**
  - 4 players in 2 teams
  - When you capture, piece goes to your partner's hand
  - Partner can drop pieces anywhere (with placement rules)
  - Team wins when opponent is checkmated

### Four-Player Chess
- **File:** `four_player_chess.rhai`
- **Players:** 4
- **Description:** 4 players on one board (unusual geometry)
- **Key Rules:**
  - 14×14 board with alcoves for each player
  - Each player has their own quadrant
  - Check rules prevent directly capturing the king

### Seirawan Chess (S-Chess)
- **File:** `seirawan_chess.rhai`
- **Players:** 2
- **Description:** Chess with gating (new pieces deployed from off-board)
- **Key Rules:**
  - Two new pieces: Hawk (combines rook + knight moves) and Elephant (combines bishop + knight moves)
  - When you castle, the new piece enters the board
  - New pieces can also be moved to empty squares (gating)

## Using a Variant

### Share a Variant Link

Each variant can be shared as a GitHub Raw URL with a commit SHA for immutability:

```
https://raw.githubusercontent.com/Relacibo/p2p-chessvariants/{COMMIT_SHA}/variants/{VARIANT}.rhai
```

Example:
```
https://raw.githubusercontent.com/Relacibo/p2p-chessvariants/abc1234def5678/variants/bughouse.rhai
```

### In the Lobby

1. Navigate to `/lobby`
2. Click "Create Lobby"
3. Paste the variant script URL
4. Copy the invite link (`#PEER_ID,BASE64URL(scriptUrl)`)
5. Share with friends

## API Reference

See [Scripting API Documentation](../docs/implementation-status.md) for the complete API.

### Essential Functions

- `config()` → Returns variant configuration
- `init(player_count)` → Initialize game state
- `apply(state, player_index, action)` → Apply player action, return new state

### Built-in Helpers

- `board_coords(x, y)` — Create coordinates
- `Piece { type, owner }` — Create a piece
- `Move { from, to }` — Create a move
- `rays(from, dirs, board)` — Calculate attack rays

## Contributing

To add a new variant:

1. Create a new `.rhai` file in `variants/`
2. Implement `config()`, `init()`, and `apply()` functions
3. Test locally with the Engine Playground
4. Create a pull request with:
   - Variant script
   - Update this README with variant description
   - Example plays or test cases (if complex)

## Testing Variants

Variants are tested via:

1. **Engine Playground** — Interactive editor (`/game/playground`)
2. **Unit Tests** — Rust test scripts in `rust/tests/scripts/`
3. **Live Play** — Create a lobby and test with friends

## License

All variant scripts are licensed under GPL-3.0-or-later (same as the main project).
