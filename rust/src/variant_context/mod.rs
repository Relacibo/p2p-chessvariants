#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Piece {
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King,
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Color {
    White,
    Black,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tile {
    Empty,
    Occupied(Piece, Color),
}

#[wasm_bindgen]
pub struct State {
    player_on_turn: u32,
    board: Vec<Tile>,
    reserve_piles: Vec<Tile>,
}

#[wasm_bindgen]
impl State {
    pub fn player_on_turn(&self) -> u32 {
        self.player_on_turn
    }
    // ...
    pub fn board_width(&self) -> u32 {
        self.board_width
    }

    pub fn board_height(&self) -> u32 {
        self.board_height
    }

    pub fn board(&self) -> *const Tile {
        self.board.as_ptr()
    }

    pub fn reserve_piles(&self) -> *const Tile {
        self.reserve_piles.as_ptr()
    }
}
