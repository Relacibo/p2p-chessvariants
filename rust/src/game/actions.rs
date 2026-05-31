use rhai::{CustomType, Dynamic};
use serde::{Deserialize, Serialize};

use super::{piece::Piece, state::Coords};

/// A game action.  After Phase 2 the only kind produced by scripts is `move`
/// (from/to are `Coords` and can be board or reserve squares).
/// `drop` and `choose` constructors are removed; those are replaced by events.
#[derive(Clone, Debug, Default, Deserialize, Serialize, CustomType, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    #[serde(rename = "type")]
    #[rhai_type(name = "type", get = Self::get_type, readonly)]
    pub kind: String,
    #[rhai_type(get = Self::get_from, readonly)]
    pub from: Option<Coords>,
    #[rhai_type(get = Self::get_to, readonly)]
    pub to: Option<Coords>,
    /// Piece involved (e.g. for drops — kept for deserialization compat)
    #[rhai_type(get = Self::get_piece, readonly)]
    pub piece: Option<Piece>,
}

impl Action {
    /// Construct a `move` action. Used by the engine and Rhai scripts via `Move(from, to)`.
    pub fn rhai_move(from: Coords, to: Coords) -> Self {
        Self {
            kind: "move".into(),
            from: Some(from),
            to: Some(to),
            piece: None,
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
}

#[cfg(test)]
mod tests {
    use super::Action;
    use crate::game::state::Coords;

    #[test]
    fn test_move_action() {
        let action = Action::rhai_move(
            Coords::new_board_0(1, 2),
            Coords::new_board_0(3, 4),
        );
        assert_eq!(action.get_type(), "move");
        let from = action.get_from().cast::<Coords>();
        assert_eq!(from.row, 1);
        assert_eq!(from.col, 2);
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
        assert_eq!(from.index, 0);
    }
}
