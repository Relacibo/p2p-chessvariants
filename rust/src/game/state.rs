use rhai::{Array, CustomType, Dynamic};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use super::entities::{BoardState, ReservePileState};

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, CustomType)]
#[rhai_type(extra = "Self::build_rhai_type")]
pub struct State {
    player_id_turn: u32,
    player_count: u32,
    board_state: BoardState,
    reserve_pile_state: Option<ReservePileState>,
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

    /**
     * Pointer to Board object in rust for rendering the board in javascript
     */
    pub fn board(&self) -> *const Option<Piece> {
        self.board_state.as_ptr()
    }

    /**
     * Pointer to Reserve Piles object in rust for rendering the board in javascript
     */
    pub fn reserve_piles(&self) -> *const Option<Piece> {
        self.reserve_piles.as_ptr()
    }
}

// Maybe also implement localplayer state
impl State {
    // pub fn new_with_reserve_pile(
    //     start_player_id: u32,
    //     board_state: BoardState,
    //     reserve_pile_state: Option<ReservePileState>,
    // ) -> Self {
    //     Self {
    //         player_id_turn: start_player_id,
    //         board_state,
    //         reserve_pile_state,
    //     }
    // }

    // pub fn new(start_player_id: u32, board_state: BoardState) -> Self {
    //     Self {
    //         player_id_turn: start_player_id,
    //         board_state,
    //         reserve_pile_state: None,
    //     }
    // }

    pub fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        builder.with_fn("State", Self::new);
    }
}

