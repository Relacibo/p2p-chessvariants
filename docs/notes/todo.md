## TODO

### React

- [ ] Sidebar
  - [ ] Image (create new one for vertical format)
  - [ ] Size
  - [ ] Sidebar Hide when starting game, full in main menu
- [ ] Game start options
- [ ] Variants collection
  - [ ] Everyone can add custom url as variant description (sanitize)
  - [ ] Have option to show code 
  - [ ] Everyone can update variant description (sanitize)
  - [ ] Have a list with recommended urls
      - [ ] list should have hash of script for validation.
- [ ] Lobby/Host game controls
  - [ ] Host can move positions of players (for now) (sanitize)
  - [ ] People can join hosts by hostid or gameid
  - [ ] Host can invite players to lobby
- [ ] chessboard
  - [ ] Board
  - [ ] Pieces
  - [ ] Move
  - [ ] Premove
  - [ ] Promote
  - [ ] Reserve Pile
  - [ ] At some point clock
  - [ ] Some sort of display for the mod (maybe with md)

### Worker / defaults / VariantDescription

- [x] uuids as key
- [x] indexeddb instead of localstorage
- [x] typing of context
- [ ] Add some additional hooks like useRandom
- [ ] Every instance validates move. Every instance uses same random values.
- [ ] cache possibleDestinations
- [ ] replace Description if it has same uuid
- [ ] Validate description
- [ ] (implement rust server with small api)

_VSCode Preview: `Ctrl+Shift+V`/`Ctrl+K V`_
