use rhai::{CustomType, Dynamic, EvalAltResult, Position, TypeBuilder};

use super::{piece::Piece, state::BoardCoords};

#[derive(Clone, Debug, PartialEq)]
pub enum ActionKind {
    Move { from: BoardCoords, to: BoardCoords },
    Drop { piece: Piece, to: BoardCoords },
    Choose { tag: String, value: String },
}

#[derive(Clone, Debug, Default, CustomType, PartialEq)]
#[rhai_type(extra = Self::build_rhai_type)]
pub struct Action {
    #[rhai_type(name = "type", get = Self::get_type)]
    pub kind: String,
    #[rhai_type(get = Self::get_from)]
    pub from: Option<BoardCoords>,
    #[rhai_type(get = Self::get_to)]
    pub to: Option<BoardCoords>,
    #[rhai_type(get = Self::get_piece)]
    pub piece: Option<Piece>,
    #[rhai_type(get = Self::get_tag)]
    pub tag: Option<String>,
    #[rhai_type(get = Self::get_value)]
    pub value: Option<String>,
}

impl Action {
    pub fn rhai_move(from: BoardCoords, to: BoardCoords) -> Self {
        Self {
            kind: "move".into(),
            from: Some(from),
            to: Some(to),
            piece: None,
            tag: None,
            value: None,
        }
    }

    pub fn rhai_drop(piece: Piece, to: BoardCoords) -> Self {
        Self {
            kind: "drop".into(),
            from: None,
            to: Some(to),
            piece: Some(piece),
            tag: None,
            value: None,
        }
    }

    pub fn rhai_choose(tag: String, value: String) -> Self {
        Self {
            kind: "choose".into(),
            from: None,
            to: None,
            piece: None,
            tag: Some(tag),
            value: Some(value),
        }
    }

    pub fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        builder
            .with_fn("Move", Self::rhai_move)
            .with_fn("Drop", Self::rhai_drop)
            .with_fn("Choose", Self::rhai_choose);
    }

    pub fn get_type(&self) -> String {
        self.kind.clone()
    }

    pub fn get_from(&self) -> Dynamic {
        self.from.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }

    pub fn get_to(&self) -> Dynamic {
        self.to.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }

    pub fn get_piece(&self) -> Dynamic {
        self.piece.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }

    pub fn get_tag(&self) -> Dynamic {
        self.tag.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }

    pub fn get_value(&self) -> Dynamic {
        self.value.clone().map(Dynamic::from).unwrap_or(Dynamic::UNIT)
    }
}

#[cfg(test)]
mod tests {
    use super::Action;
    use crate::game::{piece::Piece, state::BoardCoords};

    #[test]
    fn test_move_action() {
        let action = Action::rhai_move(BoardCoords::new_board_0(1, 2), BoardCoords::new_board_0(3, 4));
        assert_eq!(action.get_type(), "move");
        assert_eq!(action.get_from().cast::<BoardCoords>(), BoardCoords::new_board_0(1, 2));
    }

    #[test]
    fn test_drop_action() {
        let action = Action::rhai_drop(Piece::rhai_make_knight("white".into()), BoardCoords::new_board_0(2, 2));
        assert_eq!(action.get_type(), "drop");
        assert!(action.get_from().is_unit());
    }
}
