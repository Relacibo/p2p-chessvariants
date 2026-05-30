use std::fmt::Display;

use rhai::{CustomType, Dynamic, EvalAltResult, Position, TypeBuilder};
use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use crate::error::CvError;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[repr(u8)]
#[allow(dead_code)]
#[derive(Clone, Copy, Hash, Default, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum PieceType {
    #[default]
    Unknown,
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King,
}

pub fn standard_piece_type(s: &str) -> Option<PieceType> {
    match s {
        "pawn" => Some(PieceType::Pawn),
        "knight" => Some(PieceType::Knight),
        "bishop" => Some(PieceType::Bishop),
        "rook" => Some(PieceType::Rook),
        "queen" => Some(PieceType::Queen),
        "king" => Some(PieceType::King),
        _ => None,
    }
}

impl TryFrom<String> for PieceType {
    type Error = CvError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        standard_piece_type(&value).ok_or(CvError::EnumConversion {
            enum_type: "PieceType".to_owned(),
            converting_from: "String".to_owned(),
        })
    }
}

impl Display for PieceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            PieceType::Unknown => "unknown",
            PieceType::Pawn => "pawn",
            PieceType::Knight => "knight",
            PieceType::Bishop => "bishop",
            PieceType::Rook => "rook",
            PieceType::Queen => "queen",
            PieceType::King => "king",
        };
        write!(f, "{s}")
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[repr(u8)]
#[derive(Clone, Copy, Hash, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
pub enum PieceColor {
    #[default]
    Unknown,
    White,
    Black,
}

impl PieceColor {
    pub fn as_str(&self) -> &'static str {
        match self {
            PieceColor::Unknown => "unknown",
            PieceColor::White => "white",
            PieceColor::Black => "black",
        }
    }
}

impl TryFrom<String> for PieceColor {
    type Error = CvError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let ret = match value.as_str() {
            "white" => Self::White,
            "black" => Self::Black,
            _ => {
                return Err(CvError::EnumConversion {
                    enum_type: "PieceColor".to_owned(),
                    converting_from: "String".to_owned(),
                });
            }
        };
        Ok(ret)
    }
}

impl Display for PieceColor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

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
    // Stored as a raw string so arbitrary colors ("red", "blue", ...) survive
    // serialization intact. The PieceColor enum is kept for standard logic helpers.
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
            .with_fn("Pawn", Self::rhai_make_pawn_with_data);
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
    use super::{Piece, PieceType, standard_piece_type};

    #[test]
    fn test_standard_piece_type() {
        assert_eq!(standard_piece_type("rook"), Some(PieceType::Rook));
        assert_eq!(standard_piece_type("camel"), None);
    }

    #[test]
    fn test_custom_piece_type_round_trip() {
        let mut piece = Piece::rhai_new("white".into(), "camel".into());
        assert_eq!(piece.get_piece_type_as_string(), "camel");
        piece.set_piece_type_from_string("hawk".into());
        assert_eq!(piece.get_piece_type_as_string(), "hawk");
    }
}
