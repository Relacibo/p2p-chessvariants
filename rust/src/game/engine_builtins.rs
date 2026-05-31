use std::collections::HashMap;

use rhai::{Array, Dynamic};

use super::{
    actions::Action,
    moves,
    state::{BoardCoords, BoardState, Coords},
};

/// Parse the `pieces` field from the variant config (a Rhai Dynamic map) into a
/// mapping of custom piece name → list of component piece names (for `combine`).
pub fn parse_custom_pieces(pieces_dyn: Option<Dynamic>) -> HashMap<String, Vec<String>> {
    let mut map = HashMap::new();
    let Some(dyn_val) = pieces_dyn else {
        return map;
    };

    let pieces_map = match dyn_val.try_cast::<rhai::Map>() {
        Some(m) => m,
        None => return map,
    };

    for (name, def) in pieces_map.iter() {
        let def_map = match def.clone().try_cast::<rhai::Map>() {
            Some(m) => m,
            None => continue,
        };

        let def_type = match def_map
            .get("type")
            .and_then(|t| t.clone().into_string().ok())
        {
            Some(t) => t,
            None => continue,
        };

        if def_type == "combine" {
            let pieces_arr = match def_map
                .get("pieces")
                .and_then(|p| p.clone().try_cast::<Array>())
            {
                Some(a) => a,
                None => continue,
            };
            let parts: Vec<String> = pieces_arr
                .into_iter()
                .filter_map(|p| p.into_string().ok())
                .collect();
            map.insert(name.to_string(), parts);
        }
    }

    map
}

/// Generate all pseudo-move destinations for a piece at `from` (BoardCoords).
/// For combined pieces, unions the destinations of component pieces.
pub fn get_pseudo_move_dests(
    board: &BoardState,
    from: &BoardCoords,
    piece_type: &str,
    color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> Vec<BoardCoords> {
    // Move functions now take Coords; convert back to BoardCoords for internal use.
    fn from_array(arr: Array) -> Vec<BoardCoords> {
        arr.into_iter()
            .filter_map(|d| d.try_cast::<Coords>().and_then(|c| c.as_board_coords()))
            .collect()
    }

    let from_coords = Coords::from(from.clone());

    match piece_type {
        "pawn" => from_array(moves::rhai_pawn_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "rook" => from_array(moves::rhai_rook_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "knight" => from_array(moves::rhai_knight_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "bishop" => from_array(moves::rhai_bishop_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "queen" => from_array(moves::rhai_queen_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        "king" => from_array(moves::rhai_king_moves(
            board.clone(),
            from_coords,
            color.to_string(),
        )),
        custom => {
            if let Some(parts) = custom_pieces.get(custom) {
                let mut result = Vec::new();
                for part in parts {
                    result.extend(get_pseudo_move_dests(
                        board,
                        from,
                        part,
                        color,
                        custom_pieces,
                    ));
                }
                result.sort_unstable_by_key(|c| (c.row, c.col, c.board_index));
                result.dedup_by_key(|c| (c.row, c.col, c.board_index));
                result
            } else {
                vec![]
            }
        }
    }
}

/// Apply a move on a temporary board copy (for legality checking).
pub fn apply_move_to_board(board: &mut BoardState, from: &BoardCoords, to: &BoardCoords) {
    if let Some(piece) = board.get_piece(from).cloned() {
        board.set_piece(to, Some(piece));
        board.set_piece(from, None);
    }
}

/// Return true if `coords` is attacked by any piece of `by_color`.
pub fn is_square_attacked(
    board: &BoardState,
    coords: &BoardCoords,
    by_color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> bool {
    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let from = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&from) else {
                    continue;
                };
                if piece.color_name() != by_color {
                    continue;
                }
                let dests = get_pseudo_move_dests(
                    board,
                    &from,
                    piece.piece_type_name(),
                    by_color,
                    custom_pieces,
                );
                if dests.iter().any(|d| {
                    d.row == coords.row
                        && d.col == coords.col
                        && d.board_index == coords.board_index
                }) {
                    return true;
                }
            }
        }
    }
    false
}

fn opponent_color(color: &str) -> &'static str {
    match color {
        "white" => "black",
        _ => "white",
    }
}

/// Return true if the king of `color` is in check on this board.
pub fn is_king_in_check(
    board: &BoardState,
    color: &str,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> bool {
    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let coords = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&coords) else {
                    continue;
                };
                if piece.color_name() == color && piece.piece_type_name() == "king" {
                    return is_square_attacked(
                        board,
                        &coords,
                        opponent_color(color),
                        custom_pieces,
                    );
                }
            }
        }
    }
    false
}

/// Core implementation of `engine_valid_actions(state, player)`.
/// Generates all legal moves for the given player.
pub fn engine_valid_actions_impl(
    state: Dynamic,
    player: rhai::Map,
    check_protection: bool,
    custom_pieces: &HashMap<String, Vec<String>>,
) -> Array {
    let map = match state.try_cast::<rhai::Map>() {
        Some(m) => m,
        None => return Array::new(),
    };

    let board_dyn = match map.get("board") {
        Some(b) => b.clone(),
        None => return Array::new(),
    };
    let board: BoardState = match board_dyn.try_cast::<BoardState>() {
        Some(b) => b,
        None => return Array::new(),
    };

    // Get player's color from player map
    let color = player
        .get("color")
        .and_then(|v| v.clone().into_string().ok())
        .unwrap_or("white".to_string());

    let mut actions = Array::new();

    for board_idx in 0..board.number_of_boards as i32 {
        for row in 0..board.rows as i32 {
            for col in 0..board.cols as i32 {
                let from = BoardCoords::new(row, col, board_idx);
                let Some(piece) = board.get_piece(&from) else {
                    continue;
                };
                if piece.color_name() != color {
                    continue;
                }

                let piece_type = piece.piece_type_name().to_string();
                let dests =
                    get_pseudo_move_dests(&board, &from, &piece_type, &color, custom_pieces);

                for dest in dests {
                    if check_protection {
                        let mut temp_board = board.clone();
                        apply_move_to_board(&mut temp_board, &from, &dest);
                        if is_king_in_check(&temp_board, &color, custom_pieces) {
                            continue;
                        }
                    }
                    actions.push(Dynamic::from(Action::rhai_move(
                        Coords::from(from.clone()),
                        Coords::from(dest),
                    )));
                }
            }
        }
    }

    actions
}
