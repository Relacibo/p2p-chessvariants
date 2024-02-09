fn config() {
  #{
    name: "Chess 2.0",
    version: "0.0.1",
    api_version: "0.0.1",
    minimum_players: 2,
    reserve_pile: false,
    board: #{
      count: 1,
      layout: #{
        type: "rectangle",
        rows: 8,
        columns: 8,
      }
    },
  }
}

fn initialize_state(base_state)

// Have a function that gets called before each move, 
// that returns a context. ?
fn make_context(state) {

}

// Maybe make move as part of piece_type class
fn move(state, source, destination, playerIndex) {
  // Piece Promotion should ask the player for piece to promote.
}

