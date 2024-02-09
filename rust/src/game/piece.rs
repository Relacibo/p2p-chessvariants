use std::fmt::Display;

use rhai::{Array, CustomType, Dynamic};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::error::CvError;

#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, Deserialize, Serialize)]
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

impl TryFrom<String> for PieceType {
    type Error = CvError;
    fn try_from(value: String) -> Self {
        match &value {
            "pawn" => Self::Pawn,
            "knight" => Self::Knight,
            "bishop" => Self::Bishop,
            "rook" => Self::Rook,
            "queen" => Self::Queen,
            "king" => Self::King,
        }
        CvError::EnumConversion {
            enum_type: "PieceType".to_owned(),
            converting_from: "String".to_owned(),
        }
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
        write!(f, s)
    }
}

#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
pub enum PieceColor {
    #[default]
    Unknown,
    White,
    Black,
}

impl TryFrom<String> for PieceColor {
    type Error = CvError;
    fn try_from(value: String) -> Self {
        match &value {
            "white" => Self::White,
            "black" => Self::Black,
        }
        CvError::EnumConversion {
            enum_type: "PieceColor".to_owned(),
            converting_from: "String".to_owned(),
        }
    }
}

impl Display for PieceColor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            PieceColor::Unknown => "unknown",
            PieceColor::White => "white",
            PieceColor::Black => "black",
        };
        write!(f, s)
    }
}

#[wasm_bindgen]
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Default, CustomType)]
#[serde(rename_all = "camelCase")]
#[rhai_type(extra = "Self::build_rhai_type")]
pub struct Piece {
    #[rhai_type(
        set = "Self::set_piece_type_from_string",
        get = "Self::get_piece_type_as_string"
    )]
    piece_type: PieceType,
    #[rhai_type(
        rename = "type",
        set = "Self::set_color_from_string",
        get = "Self::get_color_as_string"
    )]
    color: PieceColor,
    data: Option<Dynamic>,
}

impl Piece {
    pub fn rhai_new(color: String, piece_type: String) -> Self {
        Self {
            piece_type: piece_type.try_into().unwrap_or_default(),
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_new_with_data(color: String, piece_type: String, data: Dynamic) -> Self {
        Self {
            piece_type: piece_type.try_into().unwrap_or_default(),
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }

    pub fn rhai_make_king(color: String) -> Self {
        Self {
            piece_type: PieceType::King,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_king_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::King,
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }

    pub fn rhai_make_queen(color: String) -> Self {
        Self {
            piece_type: PieceType::Queen,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_queen_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::Queen,
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }

    pub fn rhai_make_knight(color: String) -> Self {
        Self {
            piece_type: PieceType::Knight,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_knight_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::Knight,
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }

    pub fn rhai_make_bishop(color: String) -> Self {
        Self {
            piece_type: PieceType::Bishop,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_bishop_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::Bishop,
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }

    pub fn rhai_make_rook(color: String) -> Self {
        Self {
            piece_type: PieceType::Rook,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_rook_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::Rook,
            color: color.try_into().unwrap_or_default(),
            data: Some(data),
        }
    }
    
    pub fn rhai_make_pawn(color: String) -> Self {
        Self {
            piece_type: PieceType::Pawn,
            color: color.try_into().unwrap_or_default(),
            ..Default::default()
        }
    }

    pub fn rhai_make_pawn_with_data(color: String, data: Dynamic) {
        Self {
            piece_type: PieceType::Pawn,
            color: color.try_into().unwrap_or_default(),
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
            
    }

    pub fn set_piece_type_from_string(&mut self, value: String) {
        let v = value.try_into().unwrap_or_default;
        self.piece_type = v;
    }

    pub fn get_piece_type_as_string(self) -> String {
        self.piece_type.to_string()
    }

    pub fn set_color_from_string(&mut self, value: String) {
        let v = value.try_into().unwrap_or_default();
    }

    pub fn get_color_as_string(self) -> String {
        self.color.to_string()
    }
}

pub struct PieceTypeDescription<'a> {
    find_moves: Fn(&'a State, &'a BoardCoords, &'a Piece) -> Vec<BoardCoords>,
}
