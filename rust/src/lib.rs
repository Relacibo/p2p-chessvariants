use std::collections::HashMap;
use error::CvError;
use game::{
    actions::Action,
    board,
    engine_builtins,
    game_result,
    moves,
    piece::Piece,
    standard,
    state::ReservePileState,
    variant_config::{BoardLayoutConfig, VariantConfig},
};
use rhai::{AST, Dynamic, Engine, Scope};
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::actions::Action as ChessAction;
pub use game::board as board_helpers;
pub use game::piece::Piece as ChessPiece;
pub use game::state::{BoardCoords, BoardState};

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
#[allow(dead_code)] // game_state and variant_config will be used by apply/make_move
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
    pub(crate) cached_valid_actions: Option<(String, Vec<Action>)>,
}

fn action_to_rhai_dynamic(action: Action) -> Dynamic {
    let mut map = rhai::Map::new();
    map.insert("type".into(), Dynamic::from(action.kind));
    map.insert(
        "from".into(),
        action.from.map(Dynamic::from).unwrap_or(Dynamic::UNIT),
    );
    map.insert(
        "to".into(),
        action.to.map(Dynamic::from).unwrap_or(Dynamic::UNIT),
    );
    map.insert(
        "piece".into(),
        action.piece.map(Dynamic::from).unwrap_or(Dynamic::UNIT),
    );
    map.insert(
        "tag".into(),
        action.tag.map(Dynamic::from).unwrap_or(Dynamic::UNIT),
    );
    map.insert(
        "value".into(),
        action.value.map(Dynamic::from).unwrap_or(Dynamic::UNIT),
    );
    Dynamic::from_map(map)
}

fn register_builtins(engine: &mut Engine) {
    engine
        .build_type::<BoardState>()
        .build_type::<ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Piece>()
        .build_type::<BoardLayoutConfig>()
        .build_type::<Action>();

    // Equality operators for custom types used in script comparisons
    use game::state::BoardCoords as BC;
    engine.register_fn("==", |a: BC, b: BC| -> bool { a == b });
    engine.register_fn("!=", |a: BC, b: BC| -> bool { a != b });

    engine.register_fn("Coords", BoardCoords::new_board_0);
    engine.register_fn("Coords", BoardCoords::new);
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find);
    engine.register_fn("board_rows", board::rhai_board_rows);
    engine.register_fn("board_cols", board::rhai_board_cols);
    engine.register_fn("board_count", board::rhai_board_count);
    engine.register_fn("ray", board::rhai_ray);
    engine.register_fn("xray", board::rhai_xray);
    engine.register_fn("jump", board::rhai_jump);
    engine.register_fn("pawn_moves", moves::rhai_pawn_moves);
    engine.register_fn("rook_moves", moves::rhai_rook_moves);
    engine.register_fn("knight_moves", moves::rhai_knight_moves);
    engine.register_fn("bishop_moves", moves::rhai_bishop_moves);
    engine.register_fn("queen_moves", moves::rhai_queen_moves);
    engine.register_fn("king_moves", moves::rhai_king_moves);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("Drop", Action::rhai_drop);
    engine.register_fn("Choose", Action::rhai_choose);
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    engine.register_fn("Rectangle", BoardLayoutConfig::rhai_rectangle);
    // Rect(r1, c1, r2, c2) — rectangular region descriptor used in board config
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });
    // combine(type1, type2) — declares a piece whose moves are the union of two standard pieces
    engine.register_fn("combine", |p1: String, p2: String| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("type".into(), Dynamic::from("combine".to_string()));
        let pieces: rhai::Array = vec![Dynamic::from(p1), Dynamic::from(p2)];
        m.insert("pieces".into(), Dynamic::from(pieces));
        m
    });
    engine.register_fn("merge", |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
        let mut result = base;
        result.extend(updates);
        result
    });

    engine.register_static_module("log", Rc::new(logging::create_module()));
}

fn register_engine_builtins(engine: &mut Engine, config: &VariantConfig) {
    use game::state::BoardCoords;

    let check_protection = config.check_protection;
    let custom_pieces = engine_builtins::parse_custom_pieces(config.pieces.clone());

    // Clone for each closure that captures it
    let cp_valid = custom_pieces.clone();
    let cp_attacked = custom_pieces.clone();
    let cp_pseudo = custom_pieces;

    engine.register_fn(
        "engine_valid_actions",
        move |state: rhai::Dynamic, player: String| -> rhai::Array {
            engine_builtins::engine_valid_actions_impl(state, player, check_protection, &cp_valid)
        },
    );

    engine.register_fn(
        "is_square_attacked",
        move |board: game::state::BoardState, coords: BoardCoords, by_color: String| -> bool {
            engine_builtins::is_square_attacked(&board, &coords, &by_color, &cp_attacked)
        },
    );

    engine.register_fn(
        "pseudo_moves",
        move |board: game::state::BoardState,
              from: BoardCoords,
              piece_type: String,
              color: String|
              -> rhai::Array {
            engine_builtins::get_pseudo_move_dests(&board, &from, &piece_type, &color, &cp_pseudo)
                .into_iter()
                .map(rhai::Dynamic::from)
                .collect()
        },
    );
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(
        script_content: String,
        player_count: i32,
    ) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;
        register_engine_builtins(&mut engine, &variant_config);
        let mut game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;
        
        // Auto-populate players and teams from config into the game state
        {
            let mut state_map = game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
                .clone();
            
            // Build players array from config
            let players_arr: rhai::Array = variant_config.players.iter().map(|p| {
                let mut m = rhai::Map::new();
                m.insert("name".into(), Dynamic::from(p.name.clone()));
                m.insert("color".into(), Dynamic::from(p.color.clone()));
                m.insert("board".into(), Dynamic::from(p.board as i64));
                m.insert("team".into(), Dynamic::from(p.team.clone()));
                Dynamic::from_map(m)
            }).collect();
            state_map.insert("players".into(), Dynamic::from(players_arr));
            
            // Build teams map from config
            let mut teams_map: HashMap<String, rhai::Array> = HashMap::new();
            for p in &variant_config.players {
                teams_map.entry(p.team.clone())
                    .or_insert_with(|| rhai::Array::new())
                    .push(Dynamic::from(p.name.clone()));
            }
            // Convert HashMap to rhai::Map
            let mut teams_rhai = rhai::Map::new();
            for (k, v) in teams_map {
                teams_rhai.insert(k.into(), Dynamic::from(v));
            }
            state_map.insert("teams".into(), Dynamic::from_map(teams_rhai));
            
            game_state = Dynamic::from_map(state_map);
        }

        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
            cached_valid_actions: None,
        })
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn name(&self) -> String {
        self.variant_config.name.clone()
    }

    /// Returns the number of players defined in the config.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playerCount))]
    pub fn player_count(&self) -> i32 {
        self.variant_config.players.len() as i32
    }

    /// Parse and return the config block from a script without initializing the game.
    /// Returns the config as a JSON string.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = parseConfig))]
    pub fn parse_config(script_content: String) -> Result<String, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        let json = serde_json::to_string(&variant_config)?;
        Ok(json)
    }

    /// Returns the variant config as a JSON string.
    /// Includes board dimensions, disabled_rects, reserve_pile flag, etc.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        let json = serde_json::to_string(&self.variant_config)?;
        Ok(json)
    }

    /// Returns the current board state as a JSON string.
    /// Extracts `state.board` (a BoardState) and serializes it.
    /// Shape: `{ rows, cols, numberOfBoards, boards: (Piece|null)[][] }`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        let board_dyn = self.game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
            .get("board")
            .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
            .clone();
        // BoardState is a Rhai CustomType — stored as a native Rust value, so use try_cast.
        // Fall back to serde deserialization if the script stores it as a plain map.
        let board = if let Some(b) = board_dyn.clone().try_cast::<game::state::BoardState>() {
            b
        } else {
            rhai::serde::from_dynamic(&board_dyn)?
        };
        let json = serde_json::to_string(&board)?;
        Ok(json)
    }

    /// Returns the reserve pile state as a JSON string, or null if no reserve pile.
    /// Shape: `{ reserve_piles: Piece[][] }`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = reservePileJson))]
    pub fn reserve_pile_json(&self) -> Result<Option<String>, CvError> {
        if !self.variant_config.reserve_pile {
            return Ok(None);
        }
        let pile_dyn = {
            let map = self.game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
            match map.get("reserve_pile") {
                Some(v) => v.clone(),
                None => return Ok(None),
            }
        };
        let pile = if let Some(p) = pile_dyn.clone().try_cast::<ReservePileState>() {
            p
        } else {
            rhai::serde::from_dynamic(&pile_dyn)?
        };
        let json = serde_json::to_string(&pile)?;
        Ok(Some(json))
    }

    /// Returns whose turn it is as a player index (i32), or -1 if unavailable.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = currentTurn))]
    pub fn current_turn(&self) -> i32 {
        self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("turn").and_then(|v| v.as_int().ok().map(|i| i as i32)))
            .unwrap_or(-1)
    }

    /// Returns the list of active player names as a JSON string array.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = activePlayersJson))]
    pub fn active_players_json(&self) -> Result<String, CvError> {
        let ap = self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("active_players").cloned())
            .and_then(|v| v.try_cast::<rhai::Array>());
        match ap {
            Some(arr) => {
                let names: Vec<String> = arr.iter()
                    .filter_map(|d| d.clone().into_string().ok())
                    .collect();
                Ok(serde_json::to_string(&names)?)
            }
            None => Ok("[]".into()),
        }
    }

    /// Returns the list of player names (from config) as a JSON string array.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        let names: Vec<&str> = self.variant_config.players.iter().map(|p| p.name.as_str()).collect();
        Ok(serde_json::to_string(&names)?)
    }

    /// Returns the list of valid actions for the given player as a JSON string.
    /// Calls the script's `valid_actions(state, player)` function.
    /// Returns `[]` if the script does not define `valid_actions`.
    /// Shape: `Action[]` where Action = `{ type, from?, to?, piece?, tag?, value? }`
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validActionsJson))]
    pub fn valid_actions_json(&mut self, player: String) -> Result<String, CvError> {
        // Check cache first
        if let Some((cached_player, cached_actions)) = &self.cached_valid_actions {
            if *cached_player == player {
                return Ok(serde_json::to_string(cached_actions)?);
            }
        }
        // Cache miss - compute and cache
        let actions = self.compute_valid_actions(&player)?;
        self.cached_valid_actions = Some((player.clone(), actions.clone()));
        Ok(serde_json::to_string(&actions)?)
    }

    /// Internal method to compute valid actions for a player (used for caching).
    fn compute_valid_actions(&self, player: &str) -> Result<Vec<Action>, CvError> {
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "valid_actions",
            (self.game_state.clone(), player.to_string()),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(_, _)) => {
                return Ok(vec![]);
            }
            Err(e) => return Err(CvError::from(e)),
        };
        // The array may contain native Rhai CustomType (Action) or serde-mapped objects.
        let all: Vec<Action> = {
            let arr = actions_dyn
                .clone()
                .try_cast::<rhai::Array>()
                .ok_or_else(|| CvError::Internal("valid_actions did not return an array".into()))?;
            arr.into_iter()
                .filter_map(|item| {
                    item.clone()
                        .try_cast::<Action>()
                        .or_else(|| rhai::serde::from_dynamic(&item).ok())
                })
                .collect()
        };
        Ok(all)
    }

    /// Applies an action from a JSON string and returns the new board state JSON.
    /// `action_json`: serialized Action object.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = applyActionJson))]
    pub fn apply_action_json(&mut self, player: String, action_json: String) -> Result<String, CvError> {
        let action: Action = serde_json::from_str(&action_json)?;
        // Convert to a Rhai map that contains native BoardCoords so scripts can use
        // board_get(board, action.from) etc. without type errors.
        let action_dyn = action_to_rhai_dynamic(action);
        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "apply",
            (self.game_state.clone(), player.clone(), action_dyn),
        )?;
        self.game_state = new_state;
        // Invalidate cache after apply
        self.cached_valid_actions = None;
        self.board_state_json()
    }

    /// Set the logging level for the Rhai logging module.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

// These methods use `Dynamic` which is not a WASM ABI type, so they are excluded from the
// wasm_bindgen impl block. They are available for native use and integration tests.
impl ChessvariantEngine {
    /// Applies an action submitted by `player`.
    /// Returns the new state on success, or an error if the script rejects the action.
    pub fn apply(&mut self, player: String, action: Dynamic) -> Result<Dynamic, CvError> {
        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "apply",
            (self.game_state.clone(), player.clone(), action),
        )?;
        self.game_state = new_state.clone();
        Ok(new_state)
    }

    /// Returns a clone of the current game state.
    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }
}
