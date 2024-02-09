use rhai::{Array, CustomType, Dynamic};
use serde::{Deserialize, Serialize};
use std::fmt::Display;
use wasm_bindgen::prelude::*;

use crate::error::CvError;

use super::{entities::{BoardState, ReservePileState}, variant_config::VariantConfig};

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, CustomType)]
pub struct Context {
    config: VariantConfig,
    state: State,
    custom_context: Dynamic,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, CustomType)]
#[rhai_type(extra = "Self::build_rhai_type")]
pub struct State {
    local_player_index: u32,
    player_id_turn: u32, // Maybe multiple players could be on turn at once
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

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(rename_all ="camelCase")]
#[rhai_type(extra = "Self::build_rhai_type")]
pub struct BoardState {
    pub number_of_boards: u32,
    pub boards: Vec<Vec<Option<Piece>>>,
}

impl CustomType for BoardState {
    fn build(builder: rhai::TypeBuilder<Self>) {}
}

impl BoardState {
    pub fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        builder.with_fn("get_board", Self::new);
    }
}

pub enum Coords {}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
pub struct ReservePileState {
    pub reserve_piles: Vec<Vec<Piece>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
pub struct BoardCoords {
    #[rhai_type(readonly)]
    pub column: u32,
    #[rhai_type(readonly)]
    pub row: u32,
    #[rhai_type(readonly)]
    pub board_index: u32,
}

impl BoardCoords {
    pub fn new(column: u32, row: u32, board_index: u32) -> Self {
        Self {
            column,
            row,
            board_index,
        }
    }
    pub fn new_board_0(column: u32, row: u32) -> Self {
        Self {
            column,
            row,
            board_index: 0,
        }
    }
}
