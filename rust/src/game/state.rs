use rhai::{CustomType, Dynamic};
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
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
///
/// Serialized as tagged JSON: `{"type":"board","row":1,"col":2,"boardIndex":0}`
/// or `{"type":"reserve","index":0,"boardIndex":0}`.
///
/// Rhai's blanket impl `impl<T: Any + Clone + SendSync> Variant for T` applies
/// automatically, so no manual `Variant` impl is needed.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Coords {
    #[serde(rename = "board")]
    Board {
        row: i32,
        col: i32,
        board_index: i32,
    },
    #[serde(rename = "reserve")]
    Reserve {
        index: i32,
        board_index: i32,
    },
}

impl Coords {
    // ── Rhai getters (all &mut self because Rhai's register_get requires it) ──

    pub fn get_type_mut(&mut self) -> String {
        match self {
            Coords::Board { .. } => "board".to_string(),
            Coords::Reserve { .. } => "reserve".to_string(),
        }
    }

    pub fn get_row_mut(&mut self) -> i32 {
        match self {
            Coords::Board { row, .. } => *row,
            Coords::Reserve { .. } => 0,
        }
    }

    pub fn get_col_mut(&mut self) -> i32 {
        match self {
            Coords::Board { col, .. } => *col,
            Coords::Reserve { .. } => 0,
        }
    }

    pub fn get_board_index_mut(&mut self) -> i32 {
        match self {
            Coords::Board { board_index, .. } => *board_index,
            Coords::Reserve { board_index, .. } => *board_index,
        }
    }

    pub fn get_index_mut(&mut self) -> i32 {
        match self {
            Coords::Board { .. } => 0,
            Coords::Reserve { index, .. } => *index,
        }
    }

    // ── Constructors ────────────────────────────────────────────────────────

    pub fn new_board(row: i32, col: i32, board_index: i32) -> Self {
        Coords::Board {
            row,
            col,
            board_index,
        }
    }

    pub fn new_board_0(row: i32, col: i32) -> Self {
        Self::new_board(row, col, 0)
    }

    pub fn new_reserve(index: i32) -> Self {
        Coords::Reserve {
            index,
            board_index: 0,
        }
    }

    /// Returns the underlying `BoardCoords` if this is a board coordinate, else `None`.
    pub fn as_board_coords(&self) -> Option<BoardCoords> {
        match self {
            Coords::Board {
                row,
                col,
                board_index,
            } => Some(BoardCoords::new(*row, *col, *board_index)),
            Coords::Reserve { .. } => None,
        }
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

/// Canonical player identifier.
///
/// Scripts use:
///   `Player(id)`            → minimal player
///   `Player(id, name)`      → with display name
///   `Player(id, name, home_board)` → with home board
///   `Player(id, name, home_board, data)` → with arbitrary data
///
/// The engine does not bind a player to a specific board or color —
/// those are variant-defined and belong in `state.players` (Rhai map).
/// Equality is registered so `.contains()` works on arrays of Player.
#[derive(Clone, Debug, Default, Serialize, Deserialize, CustomType)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    /// Canonical player identifier — unique, assigned by script in init().
    #[rhai_type(readonly)]
    pub id: i32,
    /// Optional display name (e.g. "Alice").
    #[rhai_type(readonly)]
    pub name: String,
    /// Home board — default board when pressing "home". Defaults to 0.
    #[rhai_type(readonly)]
    pub home_board: i32,
    /// Team index — populated from state.players after init(). Defaults to 0.
    #[rhai_type(readonly)]
    pub team: i32,
    /// Arbitrary script-defined data attached to the player (like `Piece.data`).
    /// Skipped in serde — serialized manually via `player_to_json()` in lib.rs.
    #[serde(skip)]
    pub data: Option<Dynamic>,
}

// Manual PartialEq/Eq/Hash — skip `data` since `Dynamic` does not implement these traits.
impl PartialEq for Player {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
            && self.name == other.name
            && self.home_board == other.home_board
            && self.team == other.team
    }
}

impl Eq for Player {}

impl Hash for Player {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.id.hash(state);
        self.name.hash(state);
        self.home_board.hash(state);
        self.team.hash(state);
    }
}

impl Player {
    /// Primary constructor: `Player(id)`.
    pub fn new_by_id(id: i32) -> Self {
        Self {
            id,
            name: String::new(),
            home_board: 0,
            team: 0,
            data: None,
        }
    }

    /// `Player(id, name)` — with display name.
    pub fn new_by_id_name(id: i32, name: String) -> Self {
        Self {
            id,
            name,
            home_board: 0,
            team: 0,
            data: None,
        }
    }

    /// `Player(id, name, home_board)` — full constructor.
    pub fn new_full(id: i32, name: String, home_board: i32) -> Self {
        Self {
            id,
            name,
            home_board,
            team: 0,
            data: None,
        }
    }

    /// `Player(id, name, home_board, data)` — with arbitrary script data.
    pub fn new_with_data(id: i32, name: String, home_board: i32, data: Dynamic) -> Self {
        Self {
            id,
            name,
            home_board,
            team: 0,
            data: Some(data),
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
