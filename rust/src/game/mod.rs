#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
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
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum Color {
    White,
    Black,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum Tile {
    Empty,
    Occupied(Piece, Color),
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct State {
    player_id_turn: u32,
    board: Vec<Tile>,
    reserve_piles: Vec<Tile>,
}

#[wasm_bindgen]
impl State {
    // pub fn player_on_turn(&self) -> u32 {
    //     self.player_on_turn
    // }
    // // ...
    // pub fn board_width(&self) -> u32 {
    //     self.board_width
    // }

    // pub fn board_height(&self) -> u32 {
    //     self.board_height
    // }

    pub fn board(&self) -> *const Tile {
        self.board.as_ptr()
    }

    pub fn reserve_piles(&self) -> *const Tile {
        self.reserve_piles.as_ptr()
    }
}

impl State {
    pub fn new(start_player_id: u32, board: Vec<Tile>, reserve_piles: Vec<Tile>) -> Self {
        Self {
            player_id_turn: start_player_id,
            board,
            reserve_piles,
        }
    }
}
