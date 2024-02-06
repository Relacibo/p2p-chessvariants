use std::fmt::Display;

use rhai::{Array, CustomType, Dynamic};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::error::CvError;

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(rename_all("camelCase"))]
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
