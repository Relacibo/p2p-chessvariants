use rhai::CustomType;
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use super::piece::Piece;

/// A coordinate that can refer to a board square OR a reserve slot.
///
/// Scripts use:
///   `Coords(r, c)`       → board square, board_index 0
///   `Coords(r, c, b)`    → board square on board `b`
///   `ReserveCoords(i)`   → slot `i` in the player's reserve
#[derive(Clone, Debug, PartialEq, Eq, Hash, Default, Serialize, Deserialize, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct Coords {
    /// "board" or "reserve"
    #[serde(rename = "type")]
    #[rhai_type(name = "type", get = Self::get_coord_type, readonly)]
    pub coord_type: String,
    /// Board row — `None` when type is "reserve".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[rhai_type(get = Self::get_row, readonly)]
    pub row: Option<i32>,
    /// Board column — `None` when type is "reserve".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[rhai_type(get = Self::get_col, readonly)]
    pub col: Option<i32>,
    #[rhai_type(readonly)]
    pub board_index: i32,
    /// Reserve index — only valid when coord_type == "reserve"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[rhai_type(get = Self::get_index, readonly)]
    pub index: Option<i32>,
}

impl Coords {
    fn get_index(&self) -> i32 {
        self.index.unwrap_or(0)
    }

    /// Rhai getter: returns 0 when type is "reserve" (no meaningful row).
    fn get_row(&self) -> i32 {
        self.row.unwrap_or(0)
    }

    /// Rhai getter: returns 0 when type is "reserve" (no meaningful col).
    fn get_col(&self) -> i32 {
        self.col.unwrap_or(0)
    }

    pub fn new_board(row: i32, col: i32, board_index: i32) -> Self {
        Self {
            coord_type: "board".into(),
            row: Some(row),
            col: Some(col),
            board_index,
            index: None,
        }
    }

    pub fn new_board_0(row: i32, col: i32) -> Self {
        Self::new_board(row, col, 0)
    }

    pub fn new_reserve(index: i32) -> Self {
        Self {
            coord_type: "reserve".into(),
            row: None,
            col: None,
            board_index: 0,
            index: Some(index),
        }
    }

    /// Returns the underlying `BoardCoords` if this is a board coordinate, else `None`.
    pub fn as_board_coords(&self) -> Option<BoardCoords> {
        if self.coord_type == "board" {
            Some(BoardCoords::new(
                self.row.unwrap_or(0),
                self.col.unwrap_or(0),
                self.board_index,
            ))
        } else {
            None
        }
    }

    /// Getter exposed to Rhai as `.type` (cannot use field name directly — it's a Rust keyword).
    pub fn get_coord_type(&self) -> String {
        self.coord_type.clone()
    }
}

impl From<BoardCoords> for Coords {
    fn from(bc: BoardCoords) -> Self {
        Coords::new_board(bc.row, bc.col, bc.board_index)
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

    pub fn get_piece(&self, coords: &BoardCoords) -> Option<&Piece> {
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
#[serde(rename_all = "camelCase")]
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

/// Canonical player identifier: `{board, color, team}`.
///
/// Scripts use:
///   `Player("white")`        → board 0, color "white", team 0
///   `Player(1, "white")`     → board 1, color "white", team 0
///
/// The `team` field is populated automatically from `state.players` after
/// `init()` returns. Equality is registered so `.contains()` works on
/// arrays of PlayerId.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Default, Serialize, Deserialize, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct PlayerId {
    /// Canonical player identifier — unique, assigned by script in init().
    #[rhai_type(readonly)]
    pub id: i32,
    /// Optional display name (e.g. "Alice").
    #[rhai_type(readonly)]
    pub name: String,
    /// Home board — default board when pressing "home". Defaults to 0.
    #[rhai_type(readonly)]
    pub home_board: i32,
    /// Board index this player is on (legacy, kept for compat).
    #[rhai_type(readonly)]
    pub board: i32,
    /// Color this player controls.
    #[rhai_type(readonly)]
    pub color: String,
    /// Team index — populated from state.players after init(). Defaults to 0.
    #[rhai_type(readonly)]
    pub team: i32,
}

impl PlayerId {
    /// Primary constructor: `Player(id)`.  Board/color resolved from state.players later.
    pub fn new_by_id(id: i32) -> Self {
        Self {
            id,
            name: String::new(),
            home_board: 0,
            board: 0,
            color: String::new(),
            team: 0,
        }
    }

    /// `Player(id, name)` — with display name.
    pub fn new_by_id_name(id: i32, name: String) -> Self {
        Self {
            id,
            name,
            home_board: 0,
            board: 0,
            color: String::new(),
            team: 0,
        }
    }

    /// `Player(id, name, home_board)` — full constructor.
    pub fn new_full(id: i32, name: String, home_board: i32) -> Self {
        Self {
            id,
            name,
            home_board,
            board: 0,
            color: String::new(),
            team: 0,
        }
    }

    /// Short constructor: board defaults to 0, team to 0 (backward compat).
    pub fn new_short(color: String) -> Self {
        Self {
            id: 0,
            name: String::new(),
            home_board: 0,
            board: 0,
            color,
            team: 0,
        }
    }

    /// Full constructor: board and color explicitly (backward compat).
    pub fn new_board_color(board: i32, color: String) -> Self {
        Self {
            id: 0,
            name: String::new(),
            home_board: 0,
            board,
            color,
            team: 0,
        }
    }

    /// Create a PlayerId with a known team value.
    pub fn with_team(board: i32, color: String, team: i32) -> Self {
        Self {
            id: 0,
            name: String::new(),
            home_board: 0,
            board,
            color,
            team,
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
