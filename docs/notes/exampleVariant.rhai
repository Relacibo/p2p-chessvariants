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

// Returns state with
fn initialize_state(context) {
  let starting_position = [
    [
      Rook("black"), 
      Knight("black"), 
      Bishop("black"), 
      Queen("black"), 
      King("black"), 
      Bishop("black"), 
      Knight("black"), 
      Rook("black")
    ],
    [
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
      Pawn("black"),
    ],(),(),(),(),(),(),
    [
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
      Pawn("white"),
    ],[
      Rook("white"), 
      Knight("white"), 
      Bishop("white"), 
      Queen("white"), 
      King("white"), 
      Bishop("white"), 
      Knight("white"), 
      Rook("white")]
    ],
}

// Have a function that gets called before each move, 
// that returns a custom context. ?
fn make_pre_move_custom_context(context) {

}

// Maybe make move as part of piece_type class
fn move(context, source, destination, playerIndex) {
  // Piece Promotion should ask the player for piece to promote.
}

