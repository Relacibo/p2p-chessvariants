use rhai::{CustomType, Dynamic, EvalAltResult, Position, TypeBuilder};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use super::{piece::Piece, variant_config::{BoardLayoutConfig, VariantConfig}};

#[derive(Debug, Clone, Deserialize, Serialize, CustomType)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct Context {
    pub variant_config: VariantConfig,
    pub state: State,
    pub custom_context: Dynamic,
}

#[derive(Debug, Clone, Deserialize, Serialize, CustomType)]
#[rhai_type(extra = Self::build_rhai_type)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct State {
    pub local_player_index: u32,
    pub player_id_turn: u32,
    pub board_state: BoardState,
    pub reserve_pile_state: Option<ReservePileState>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl State {
    pub fn board(&self) -> *const BoardState {
        &self.board_state
    }

    pub fn reserve_piles(&self) -> *const Option<ReservePileState> {
        &self.reserve_pile_state
    }
}

fn default_player_count() -> u32 {
    2
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct InitialStateConfig {
    pub local_player_index: u32,
    pub player_id_turn_initial: u32,
    #[serde(default = "default_player_count")]
    pub player_count: u32,
}

impl State {
    pub fn new(local_player_index: u32, board_state: BoardState) -> Self {
        Self {
            local_player_index,
            player_id_turn: local_player_index,
            board_state,
            reserve_pile_state: None,
        }
    }

    pub fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        builder.with_fn("State", Self::new);
    }

    pub fn init(variant_config: VariantConfig, initial_state_config: InitialStateConfig) -> Self {
        let InitialStateConfig {
            local_player_index,
            player_id_turn_initial,
            player_count,
        } = initial_state_config;
        let (rows, cols) = match variant_config.board.layout {
            BoardLayoutConfig::Rectangle { rows, columns } => (rows, columns),
        };

        Self {
            local_player_index,
            player_id_turn: player_id_turn_initial,
            board_state: BoardState::new(rows, cols, variant_config.board.count),
            reserve_pile_state: variant_config
                .reserve_pile
                .then(|| ReservePileState {
                    reserve_piles: vec![Vec::new(); player_count as usize],
                }),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType, PartialEq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct BoardState {
    pub rows: u32,
    pub cols: u32,
    pub number_of_boards: u32,
    pub boards: Vec<Vec<Option<Piece>>>,
}

impl BoardState {
    pub fn new(rows: u32, cols: u32, number_of_boards: u32) -> Self {
        let cell_count = rows as usize * cols as usize;
        let boards = vec![vec![None; cell_count]; number_of_boards as usize];
        Self {
            rows,
            cols,
            number_of_boards,
            boards,
        }
    }

    pub fn board_empty(rows: i32, cols: i32) -> Self {
        let rows = rows.max(0) as u32;
        let cols = cols.max(0) as u32;
        Self::new(rows, cols, 1)
    }

    pub(crate) fn flat_index(&self, coords: &BoardCoords) -> Option<usize> {
        if coords.row < 0
            || coords.col < 0
            || coords.board_index < 0
            || coords.row >= self.rows as i32
            || coords.col >= self.cols as i32
            || coords.board_index as usize >= self.boards.len()
        {
            return None;
        }

        Some(coords.row as usize * self.cols as usize + coords.col as usize)
    }

    pub(crate) fn in_bounds(&self, coords: &BoardCoords) -> bool {
        self.flat_index(coords).is_some()
    }

    pub(crate) fn get_piece(&self, coords: &BoardCoords) -> Option<&Piece> {
        let index = self.flat_index(coords)?;
        self.boards
            .get(coords.board_index as usize)?
            .get(index)?
            .as_ref()
    }

    pub(crate) fn set_piece(&mut self, coords: &BoardCoords, piece: Option<Piece>) -> bool {
        let index = match self.flat_index(coords) {
            Some(index) => index,
            None => return false,
        };
        let board_index = coords.board_index as usize;
        let Some(board) = self.boards.get_mut(board_index) else {
            return false;
        };
        board[index] = piece;
        self.number_of_boards = self.boards.len() as u32;
        true
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct ReservePileState {
    pub reserve_piles: Vec<Vec<Piece>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct BoardCoords {
    #[rhai_type(readonly)]
    pub col: i32,
    #[rhai_type(readonly)]
    pub row: i32,
    #[rhai_type(readonly)]
    pub board_index: i32,
}

impl BoardCoords {
    pub fn new(row: i32, col: i32, board_index: i32) -> Self {
        Self {
            col,
            row,
            board_index,
        }
    }

    pub fn new_board_0(row: i32, col: i32) -> Self {
        Self {
            col,
            row,
            board_index: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{BoardCoords, BoardState};

    #[test]
    fn test_board_empty() {
        let board = BoardState::board_empty(3, 4);
        assert_eq!(board.rows, 3);
        assert_eq!(board.cols, 4);
        assert_eq!(board.boards.len(), 1);
        assert_eq!(board.boards[0].len(), 12);
    }

    #[test]
    fn test_board_coords_constructor() {
        let coords = BoardCoords::new_board_0(2, 5);
        assert_eq!(coords.row, 2);
        assert_eq!(coords.col, 5);
        assert_eq!(coords.board_index, 0);
    }
}
