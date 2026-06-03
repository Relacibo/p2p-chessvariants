use rhai::{CustomType, Dynamic};
use serde::{Deserialize, Serialize};

use super::{piece::Piece, state::Coords};

/// A game action. Four kinds:
///   - `move`:          from/to are Coords (board or reserve squares)
///   - `select_piece`:  piece is the selected piece
///   - `interact`:      element_id is the UI element being activated
///   - `cancel`:        abort a multi-step pending action
#[derive(Clone, Debug, Default, Deserialize, Serialize, CustomType, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    #[serde(rename = "type")]
    #[rhai_type(name = "type", get = Self::get_type, readonly)]
    pub kind: String,
    #[rhai_type(get = Self::get_from, readonly)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<Coords>,
    #[rhai_type(get = Self::get_to, readonly)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<Coords>,
    /// Piece involved (select_piece actions, drops)
    #[rhai_type(get = Self::get_piece, readonly)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub piece: Option<Piece>,
    /// UI element ID for interact actions
    #[rhai_type(get = Self::get_element_id, readonly)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element_id: Option<String>,
}

impl Action {
    /// Construct a `move` action. Used by the engine and Rhai scripts via `Move(from, to)`.
    pub fn rhai_move(from: Coords, to: Coords) -> Self {
        Self {
            kind: "move".into(),
            from: Some(from),
            to: Some(to),
            piece: None,
            element_id: None,
        }
    }

    /// Construct a `select_piece` action. Rhai: `SelectPiece(piece)`.
    pub fn rhai_select_piece(piece: Piece) -> Self {
        Self {
            kind: "select_piece".into(),
            from: None,
            to: None,
            piece: Some(piece),
            element_id: None,
        }
    }

    /// Construct an `interact` action. Rhai: `Interact(element_id)`.
    pub fn rhai_interact(element_id: String) -> Self {
        Self {
            kind: "interact".into(),
            from: None,
            to: None,
            piece: None,
            element_id: Some(element_id),
        }
    }

    /// Construct a `cancel` action. Rhai: `Cancel()` — no payload.
    pub fn rhai_cancel() -> Self {
        Self {
            kind: "cancel".into(),
            from: None,
            to: None,
            piece: None,
            element_id: None,
        }
    }

    pub fn get_type(&self) -> String {
        self.kind.clone()
    }

    pub fn get_from(&self) -> Dynamic {
        self.from
            .clone()
            .map(Dynamic::from)
            .unwrap_or(Dynamic::UNIT)
    }

    pub fn get_to(&self) -> Dynamic {
        self.to.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }

    pub fn get_piece(&self) -> Dynamic {
        self.piece
            .clone()
            .map(Dynamic::from)
            .unwrap_or(Dynamic::UNIT)
    }

    pub fn get_element_id(&self) -> Dynamic {
        self.element_id
            .clone()
            .map(Dynamic::from)
            .unwrap_or(Dynamic::UNIT)
    }
}

#[cfg(test)]
mod tests {
    use super::Action;
    use crate::game::piece::Piece;
    use crate::game::state::Coords;

    #[test]
    fn test_move_action() {
        let action = Action::rhai_move(
            Coords::new_board_0(1, 2),
            Coords::new_board_0(3, 4),
        );
        assert_eq!(action.get_type(), "move");
        let from = action.get_from().cast::<Coords>();
        assert_eq!(from.row, Some(1));
        assert_eq!(from.col, Some(2));
        assert_eq!(from.coord_type, "board");
    }

    #[test]
    fn test_reserve_coords_action() {
        let action = Action::rhai_move(
            Coords::new_reserve(0),
            Coords::new_board_0(3, 4),
        );
        let from = action.get_from().cast::<Coords>();
        assert_eq!(from.coord_type, "reserve");
        assert_eq!(from.index, Some(0));
    }

    #[test]
    fn test_select_piece_action() {
        let piece = Piece::rhai_new("white".into(), "queen".into());
        let action = Action::rhai_select_piece(piece.clone());
        assert_eq!(action.get_type(), "select_piece");
        let action_piece = action.get_piece().cast::<Piece>();
        assert_eq!(action_piece.color_name(), "white");
        assert_eq!(action_piece.piece_type_name(), "queen");
    }

    #[test]
    fn test_interact_action() {
        let action = Action::rhai_interact("draw_offer_btn".into());
        assert_eq!(action.get_type(), "interact");
        let id = action.get_element_id().cast::<String>();
        assert_eq!(id, "draw_offer_btn");
    }

    #[test]
    fn test_cancel_action() {
        let action = Action::rhai_cancel();
        assert_eq!(action.get_type(), "cancel");
        assert!(action.get_from().is_unit());
        assert!(action.get_to().is_unit());
        assert!(action.get_piece().is_unit());
        assert!(action.get_element_id().is_unit());
    }
}
