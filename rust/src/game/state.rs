use rhai::{Array, CustomType, Dynamic, TypeBuilder};
use serde::{Deserialize, Serialize};
use tsify::Tsify;
use std::fmt::Display;
use wasm_bindgen::prelude::*;

use crate::{error::CvError, ChessvariantEngineConfig};

use super::{
    entities::{BoardState, ReservePileState}, piece::Piece, variant_config::{self, VariantConfig}
};

#[derive(Debug, Clone, Deserialize, Serialize, CustomType, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Context {
    pub variant_config: VariantConfig,
    pub state: State,
    pub custom_context: Dynamic,
    // maybe later add rng somehow idk
}

#[derive(Debug, Clone, Hash, Deserialize, Serialize, CustomType, Tsify)]
#[rhai_type(extra = "Self::build_rhai_type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct State {
    pub local_player_index: u32,
    pub player_id_turn: u32, // TODO: Maybe multiple players could be on turn at once
    pub board_state: BoardState,
    pub reserve_pile_state: Option<ReservePileState>,
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
    pub fn board(&self) -> *const BoardState {
        &self.board_state
    }

    /**
     * Pointer to Reserve Piles object in rust for rendering the board in javascript
     */
    pub fn reserve_piles(&self) -> *const Option<ReservePileState> {
        &self.reserve_pile_state
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct InitialStateConfig {
    local_player_index: u32,
    player_id_turn_initial: u32,
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

    pub fn new(local_player_index: u32, board_state: BoardState) -> Self {
        Self {
            local_player_index,
            player_id_turn: local_player_index,
            board_state,
            reserve_pile_state: None,
        }
    }

    pub fn build_rhai_type(builder: &mut rhai::TypeBuilder<Self>) {
        builder.with_fn("State", Self::new);
    }
    
    pub fn init(variant_config: VariantConfig, initial_state_config: InitialStateConfig) -> Self {
        let InitialStateConfig {
            local_player_index,
            player_id_turn_initial,
        } = initial_state_config;
        Self {
            local_player_index,
            player_id_turn: player_id_turn_initial,
            board_state: todo!(),
            reserve_pile_state: todo!(),
        }
    }
}

#[derive(Clone, Debug, Hash, Deserialize, Serialize, Default, Tsify)]
#[serde(rename_all = "camelCase")]
#[rhai_type(extra = "Self::build_rhai_type")]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct BoardState {
    pub number_of_boards: u32,
    pub boards: Vec<Vec<Option<Piece>>>,
}

impl CustomType for BoardState {
    fn build(builder: rhai::TypeBuilder<Self>) {
    }
}

impl BoardState {
    fn get_board(board_state: &mut BoardState, index: usize) -> *const Option<Vec<Option<Piece>>>> {
        board_state.get(index).as_ptr()
    }

    pub fn build_rhai_type(builder: &mut rhai::TypeBuilder<Self>) {
        builder.with_fn("get_board", Self::new);
    }
}

pub enum Coords {}

#[derive(Clone, Debug, Hash, Deserialize, Serialize, Default, CustomType, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ReservePileState {
    pub reserve_piles: Vec<Vec<Piece>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
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
