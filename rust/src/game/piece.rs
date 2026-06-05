use rhai::{CustomType, Dynamic, TypeBuilder};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Clone, Debug, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
#[rhai_type(extra = Self::build_rhai_type)]
pub struct Piece {
    #[rhai_type(
        name = "type",
        set = Self::set_piece_type_from_string,
        get = Self::get_piece_type_as_string
    )]
    piece_type: String,
    #[rhai_type(set = Self::set_color_from_string, get = Self::get_color_as_string)]
    color: String,
    data: Option<Dynamic>,
}

impl Piece {
    pub fn rhai_new(color: String, piece_type: String) -> Self {
        Self {
            piece_type,
            color,
            data: None,
        }
    }

    pub fn rhai_new_with_data(color: String, piece_type: String, data: Dynamic) -> Self {
        Self {
            piece_type,
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_king(color: String) -> Self {
        Self {
            piece_type: "king".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_king_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "king".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_queen(color: String) -> Self {
        Self {
            piece_type: "queen".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_queen_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "queen".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_knight(color: String) -> Self {
        Self {
            piece_type: "knight".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_knight_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "knight".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_bishop(color: String) -> Self {
        Self {
            piece_type: "bishop".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_bishop_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "bishop".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_rook(color: String) -> Self {
        Self {
            piece_type: "rook".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_rook_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "rook".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn rhai_make_pawn(color: String) -> Self {
        Self {
            piece_type: "pawn".to_string(),
            color,
            data: None,
        }
    }

    pub fn rhai_make_pawn_with_data(color: String, data: Dynamic) -> Self {
        Self {
            piece_type: "pawn".to_string(),
            color,
            data: Some(data),
        }
    }

    pub fn build_rhai_type(builder: &mut TypeBuilder<Self>) {
        builder
            .with_fn("Piece", Self::rhai_new)
            .with_fn("Piece", Self::rhai_new_with_data)
            .with_fn("King", Self::rhai_make_king)
            .with_fn("King", Self::rhai_make_king_with_data)
            .with_fn("Queen", Self::rhai_make_queen)
            .with_fn("Queen", Self::rhai_make_queen_with_data)
            .with_fn("Knight", Self::rhai_make_knight)
            .with_fn("Knight", Self::rhai_make_knight_with_data)
            .with_fn("Bishop", Self::rhai_make_bishop)
            .with_fn("Bishop", Self::rhai_make_bishop_with_data)
            .with_fn("Rook", Self::rhai_make_rook)
            .with_fn("Rook", Self::rhai_make_rook_with_data)
            .with_fn("Pawn", Self::rhai_make_pawn)
            .with_fn("Pawn", Self::rhai_make_pawn_with_data)
            .with_indexer_get_set(
                |p: &mut Piece, key: &str| -> Dynamic {
                    match &p.data {
                        Some(data) => data
                            .read_lock::<rhai::Map>()
                            .and_then(|m| m.get(key).cloned())
                            .unwrap_or(Dynamic::UNIT),
                        None => Dynamic::UNIT,
                    }
                },
                |p: &mut Piece, key: &str, value: Dynamic| {
                    let map = p
                        .data
                        .get_or_insert_with(|| Dynamic::from(rhai::Map::new()));
                    if let Some(mut m) = map.write_lock::<rhai::Map>() {
                        m.insert(key.into(), value);
                    }
                },
            );
    }

    pub fn set_piece_type_from_string(&mut self, value: String) {
        self.piece_type = value;
    }

    pub fn get_piece_type_as_string(&self) -> String {
        self.piece_type.clone()
    }

    pub fn set_color_from_string(&mut self, value: String) {
        self.color = value;
    }

    pub fn get_color_as_string(&self) -> String {
        self.color.clone()
    }

    pub fn piece_type_name(&self) -> &str {
        &self.piece_type
    }

    pub fn color_name(&self) -> &str {
        &self.color
    }
}

impl PartialEq for Piece {
    fn eq(&self, other: &Self) -> bool {
        self.piece_type == other.piece_type
            && self.color == other.color
            && self.data.as_ref().map(|value| format!("{value:?}"))
                == other.data.as_ref().map(|value| format!("{value:?}"))
    }
}

#[cfg(test)]
mod tests {
    use super::Piece;

    #[test]
    fn test_custom_piece_type_round_trip() {
        let mut piece = Piece::rhai_new("white".into(), "camel".into());
        assert_eq!(piece.get_piece_type_as_string(), "camel");
        piece.set_piece_type_from_string("hawk".into());
        assert_eq!(piece.get_piece_type_as_string(), "hawk");
    }
}
