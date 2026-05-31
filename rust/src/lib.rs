use error::CvError;
use game::{
    actions::Action,
    board,
    game_result,
    handler_registry::{HandlerRegistry, StoredHandler},
    piece::Piece,
    standard,
    state::Coords,
    ui::MoveResult,
    variant_config::VariantConfig,
};
use modules::builtins;
use rhai::{AST, Dynamic, Engine, FnPtr, Scope};
use serde::{Deserialize, Serialize};
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, PlayerId};

/// Player reference across WASM boundary. JSON: `{"board":0,"color":"white"}`
#[derive(Deserialize, Serialize, Debug, Clone)]
pub(crate) struct PlayerRef {
    board: i64,
    color: String,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Debug)]
pub struct ChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) game_state: Dynamic,
    pub(crate) variant_config: VariantConfig,
    pub(crate) cached_valid_actions: Option<(String, Vec<Action>)>,
    handler_registry: HandlerRegistry,
}

// ─── Builtin Registration ────────────────────────────────────────────────────

fn register_builtins(engine: &mut Engine) {
    use game::state::BoardCoords;

    engine
        .build_type::<BoardState>()
        .build_type::<game::state::ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Coords>()
        .build_type::<Piece>()
        .build_type::<game::variant_config::BoardLayoutConfig>()
        .build_type::<Action>()
        .build_type::<PlayerId>();

    // ── Legacy global aliases (backward compat for existing variant scripts) ──
    // These are duplicates of engine::board::* — remove once all scripts migrate.
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find_piece);

    // Equality operators
    engine.register_fn("==", |a: Coords, b: Coords| -> bool { a == b });
    engine.register_fn("!=", |a: Coords, b: Coords| -> bool { a != b });
    engine.register_fn("==", |a: BoardCoords, b: BoardCoords| -> bool { a == b });
    engine.register_fn("!=", |a: BoardCoords, b: BoardCoords| -> bool { a != b });
    engine.register_fn("==", |a: PlayerId, b: PlayerId| -> bool {
        a.board == b.board && a.color == b.color
    });
    engine.register_fn("!=", |a: PlayerId, b: PlayerId| -> bool {
        a.board != b.board || a.color != b.color
    });

    // ── Global constructors (remain bare, not namespaced) ──
    engine.register_fn("Coords", Coords::new_board_0);
    engine.register_fn("Coords", Coords::new_board);
    engine.register_fn("ReserveCoords", Coords::new_reserve);
    engine.register_fn("Player", PlayerId::new_short);
    engine.register_fn("Player", PlayerId::new_full);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("Winner", game_result::rhai_winner);
    engine.register_fn("Winners", game_result::rhai_winners);
    engine.register_fn("Draw", game_result::rhai_draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    // combine(type_a, type_b) — custom piece definition
    engine.register_fn("combine", |p1: String, p2: String| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("type".into(), Dynamic::from("combine".to_string()));
        let pieces: rhai::Array = vec![Dynamic::from(p1), Dynamic::from(p2)];
        m.insert("pieces".into(), Dynamic::from(pieces));
        m
    });
    // merge(base, updates) — shallow map merge
    engine.register_fn(
        "merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    // Rect(r1,c1,r2,c2) — board config region
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });

    // ── Namespaced modules (static, no config dependency) ──
    // Board submodule registered early; moves and helpers registered
    // later in register_engine_helpers since they depend on VariantConfig.
    engine.register_static_module("engine::board", Rc::new(builtins::create_board_submodule()));
    engine.register_static_module("log", Rc::new(builtins::create_log_module()));
}

fn register_engine_helpers(engine: &mut Engine, config: &VariantConfig) {
    builtins::register_engine_helpers(config, engine);
    // moves sub-module
    engine.register_static_module("engine::moves", Rc::new(builtins::create_moves_submodule()));
    // Utilities on engine:: namespace
    engine.register_fn(
        "engine::merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn("engine::standard_start_position", standard::standard_start_position);
}

// ─── Player ID helpers ───────────────────────────────────────────────────────

/// Convert a PlayerRef to PlayerId. Team is set to 0 — scripts read team from
/// state.players, not from the PlayerId passed by the engine.
fn player_ref_to_player_id(_state: &Dynamic, pref: &PlayerRef) -> PlayerId {
    PlayerId::with_team(pref.board as i32, pref.color.clone(), 0)
}

fn player_id_to_json(p: &PlayerId) -> serde_json::Value {
    serde_json::json!({"board": p.board, "color": p.color, "team": p.team})
}

/// Normalize an active_players entry to JSON.
fn normalize_active_player(d: &Dynamic) -> Option<serde_json::Value> {
    if let Ok(color) = d.clone().into_string() {
        return Some(serde_json::json!({"board": 0, "color": color, "team": 0}));
    }
    if let Some(p) = d.clone().try_cast::<PlayerId>() {
        return Some(player_id_to_json(&p));
    }
    if let Some(m) = d.clone().try_cast::<rhai::Map>() {
        let board = m.get("board").and_then(|v| v.as_int().ok()).unwrap_or(0);
        let color = m
            .get("color")
            .and_then(|v| v.clone().into_string().ok())
            .unwrap_or_default();
        let team = m.get("team").and_then(|v| v.as_int().ok()).unwrap_or(0);
        return Some(serde_json::json!({"board": board, "color": color, "team": team}));
    }
    None
}

/// Extract team IDs from state.players into state.teams (deduplicated, sorted).
fn populate_teams(state_map: &mut rhai::Map) {
    let players_arr = state_map
        .get("players")
        .and_then(|v| v.clone().try_cast::<rhai::Array>());
    if let Some(players) = players_arr {
        let mut team_ids: Vec<u32> = players
            .iter()
            .filter_map(|p| {
                p.clone()
                    .try_cast::<rhai::Map>()
                    .and_then(|m| m.get("team")?.as_int().ok())
                    .map(|t| t as u32)
            })
            .collect();
        team_ids.sort_unstable();
        team_ids.dedup();
        let teams_arr: rhai::Array = team_ids
            .into_iter()
            .map(|t| Dynamic::from(t as i64))
            .collect();
        state_map.insert("teams".into(), Dynamic::from(teams_arr));
    }
}

// ─── Constructor ─────────────────────────────────────────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String, player_count: i32) -> Result<ChessvariantEngine, CvError> {
        let mut engine = Engine::new();
        let ast = engine.compile(&script_content)?;
        register_builtins(&mut engine);

        let mut scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        if !variant_config
            .allowed_player_count
            .validate(player_count as u32)
        {
            return Err(CvError::Internal(format!(
                "player_count {} is not allowed by variant config",
                player_count
            )));
        }

        register_engine_helpers(&mut engine, &variant_config);
        let game_state = engine.call_fn::<Dynamic>(&mut scope, &ast, "init", (player_count,))?;

        populate_teams(
            &mut game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
                .clone(),
        );

        Ok(ChessvariantEngine {
            engine,
            ast,
            game_state,
            variant_config,
            cached_valid_actions: None,
            handler_registry: HandlerRegistry::new(),
        })
    }

    // ── Getters ──

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn name(&self) -> String {
        self.variant_config.name.clone()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playerCount))]
    pub fn player_count(&self) -> i32 {
        self.max_players()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = minPlayers))]
    pub fn min_players(&self) -> i32 {
        match &self.variant_config.allowed_player_count {
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().min().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { min, .. } => *min as i32,
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = maxPlayers))]
    pub fn max_players(&self) -> i32 {
        match &self.variant_config.allowed_player_count {
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().max().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { max, .. } => *max as i32,
        }
    }

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

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        let json = serde_json::to_string(&self.variant_config)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        let board_dyn = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?
            .get("board")
            .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
            .clone();
        let board = if let Some(b) = board_dyn.clone().try_cast::<BoardState>() {
            b
        } else {
            rhai::serde::from_dynamic(&board_dyn)?
        };
        let json = serde_json::to_string(&board)?;
        Ok(json)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = reservePileJson))]
    pub fn reserve_pile_json(&self) -> Result<Option<String>, CvError> {
        if !self.variant_config.reserve_pile {
            return Ok(None);
        }
        let pile_dyn = {
            let map = self
                .game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
            match map.get("reserve_pile") {
                Some(v) => v.clone(),
                None => return Ok(None),
            }
        };
        let pile = if let Some(p) = pile_dyn
            .clone()
            .try_cast::<game::state::ReservePileState>()
        {
            p
        } else {
            rhai::serde::from_dynamic(&pile_dyn)?
        };
        let json = serde_json::to_string(&pile)?;
        Ok(Some(json))
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = activePlayersJson))]
    pub fn active_players_json(&self) -> Result<String, CvError> {
        let ap = self
            .game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("active_players").cloned())
            .and_then(|v| v.try_cast::<rhai::Array>());
        match ap {
            Some(arr) => {
                let players: Vec<serde_json::Value> = arr
                    .iter()
                    .filter_map(|d| normalize_active_player(d))
                    .collect();
                Ok(serde_json::to_string(&players)?)
            }
            None => Ok("[]".into()),
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        let players_map = self
            .game_state
            .read_lock::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
        let players_arr = players_map
            .get("players")
            .and_then(|v| v.clone().try_cast::<rhai::Array>())
            .ok_or_else(|| CvError::Internal("game_state.players not found".into()))?;

        let mut players: Vec<serde_json::Value> = Vec::new();
        for p in players_arr.iter() {
            let player_map = p
                .clone()
                .try_cast::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("player is not a map".into()))?;
            let color = player_map
                .get("color")
                .and_then(|v| v.clone().into_string().ok())
                .unwrap_or_default();
            let board = player_map
                .get("board")
                .and_then(|v| v.as_int().ok())
                .unwrap_or(0);
            let team = player_map
                .get("team")
                .and_then(|v| v.as_int().ok())
                .unwrap_or(0);
            players.push(serde_json::json!({
                "color": color,
                "board": board,
                "team": team
            }));
        }
        Ok(serde_json::to_string(&players)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validActionsJson))]
    pub fn valid_actions_json(&mut self, player_json: String) -> Result<String, CvError> {
        if let Some((cached_player, cached_actions)) = &self.cached_valid_actions {
            if *cached_player == player_json {
                return Ok(serde_json::to_string(cached_actions)?);
            }
        }
        let actions = self.compute_valid_actions(&player_json)?;
        self.cached_valid_actions = Some((player_json, actions.clone()));
        Ok(serde_json::to_string(&actions)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NEW API (v2): handleMove, uiInteraction, getUiJson
    // ══════════════════════════════════════════════════════════════════════════

    /// Execute a move. Validates legality, calls `on_move`, updates state,
    /// fetches UI via `get_ui`, and checks for game-over.
    ///
    /// `player_json`: `{"board":0,"color":"white"}`
    /// `from_json`: `{"type":"board","row":6,"col":4,...}` or reserve
    /// `to_json`: destination coords
    /// `piece_json`: optional, required for reserve drops
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = handleMove))]
    pub fn handle_move_js(
        &mut self,
        player_json: String,
        from_json: String,
        to_json: String,
        piece_json: Option<String>,
    ) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let from: Coords = serde_json::from_str(&from_json)?;
        let to: Coords = serde_json::from_str(&to_json)?;
        let piece: Option<Piece> = piece_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?;

        let result = self.run_handle_move(&player_ref, &from, &to, piece.as_ref())?;
        Ok(serde_json::to_string(&result)?)
    }

    /// Handle a UI interaction (button click, piece selection).
    /// `element_id`: the stable ID of the UI element
    /// `value_json`: optional — the selected Piece for piece_selection
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = uiInteraction))]
    pub fn ui_interaction_js(
        &mut self,
        player_json: String,
        element_id: String,
        value_json: Option<String>,
    ) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let value: Option<Piece> = value_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?;

        let result = self.run_ui_interaction(&player_ref, &element_id, value.as_ref())?;
        Ok(serde_json::to_string(&result)?)
    }

    /// Fetch the UI for a player without changing state (poll / page refresh).
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = getUiJson))]
    pub fn get_ui_json_js(&mut self, player_json: String) -> Result<String, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        let ui = self.run_get_ui(&player_ref)?;
        Ok(serde_json::to_string(&serde_json::json!({ "ui": ui }))?)
    }
}

// ─── Core engine logic ───────────────────────────────────────────────────────

impl ChessvariantEngine {
    /// Read a piece from the board at the given coordinates.
    fn read_piece_from_board(&self, coords: &Coords) -> Result<Piece, CvError> {
        let board = {
            let map = self
                .game_state
                .read_lock::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("game_state is not a map".into()))?;
            map.get("board")
                .cloned()
                .ok_or_else(|| CvError::Internal("game_state has no 'board' key".into()))?
        };
        let board: BoardState = if let Some(b) = board.clone().try_cast::<BoardState>() {
            b
        } else {
            rhai::serde::from_dynamic(&board)?
        };
        let bc = coords
            .as_board_coords()
            .ok_or_else(|| CvError::Internal("cannot read piece from non-board coords".into()))?;
        board
            .get_piece(&bc)
            .cloned()
            .ok_or_else(|| CvError::Internal("no piece at source square".into()))
    }

    /// Core move execution.
    pub(crate) fn run_handle_move(
        &mut self,
        player_ref: &PlayerRef,
        from: &Coords,
        to: &Coords,
        piece: Option<&Piece>,
    ) -> Result<MoveResult, CvError> {
        let player = player_ref_to_player_id(&self.game_state, player_ref);

        // 1. Validate against valid_actions (if the script implements it)
        if self.script_has_function("valid_actions") {
            let player_json = serde_json::to_string(&player_ref)?;
            let actions = self.compute_valid_actions(&player_json)?;
            let is_legal = actions.iter().any(|a| {
                // Action.from and Action.to are Option<Coords>, compare properly
                a.from.as_ref() == Some(from) && a.to.as_ref() == Some(to)
            });
            if !is_legal {
                return Err(CvError::Internal("illegal move — not in valid_actions".into()));
            }
        }

        // 2. Resolve the moving piece
        let piece = match piece.cloned() {
            Some(p) => p,
            None if from.coord_type == "board" => self.read_piece_from_board(from)?,
            _ => {
                return Err(CvError::Internal(
                    "piece required for reserve drops".into(),
                ))
            }
        };

        // 3. Call on_move(state, player, from, to, piece)
        let mut scope = Scope::new();
        let new_state = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "on_move",
            (
                self.game_state.clone(),
                Dynamic::from(player),
                Dynamic::from(from.clone()),
                Dynamic::from(to.clone()),
                Dynamic::from(piece),
            ),
        )?;

        self.game_state = new_state;
        self.cached_valid_actions = None;

        // 4. Check game-over
        self.call_check_game_over()?;

        let game_over = self.extract_game_over_dyn();

        // 5. Fetch UI
        let ui = self.run_get_ui(player_ref)?;

        Ok(MoveResult { ui, game_over })
    }

    /// Core UI interaction execution.
    pub(crate) fn run_ui_interaction(
        &mut self,
        player_ref: &PlayerRef,
        element_id: &str,
        value: Option<&Piece>,
    ) -> Result<MoveResult, CvError> {
        // Validate element_id exists in registry
        let handler = self
            .handler_registry
            .get_clone(element_id)
            .ok_or_else(|| CvError::Internal(format!("no handler for element '{element_id}'")))?;

        // Dispatch handler
        let new_state = match handler {
            StoredHandler::Button { ref closure } => {
                closure.call::<Dynamic>(
                    &self.engine,
                    &self.ast,
                    (self.game_state.clone(),),
                )?
            }
            StoredHandler::PieceSelection { ref closure } => {
                let piece = value
                    .cloned()
                    .ok_or_else(|| CvError::Internal("piece value required for piece_selection".into()))?;
                closure.call::<Dynamic>(
                    &self.engine,
                    &self.ast,
                    (self.game_state.clone(), Dynamic::from(piece)),
                )?
            }
        };

        self.game_state = new_state;
        self.cached_valid_actions = None;

        // Check game-over
        self.call_check_game_over()?;
        let game_over = self.extract_game_over_dyn();

        // Fetch UI
        let ui = self.run_get_ui(player_ref)?;

        Ok(MoveResult { ui, game_over })
    }

    /// Call get_ui(state, player), extract closures, build JSON from the rest.
    pub(crate) fn run_get_ui(
        &mut self,
        player_ref: &PlayerRef,
    ) -> Result<serde_json::Value, CvError> {
        self.handler_registry.clear();

        let player = player_ref_to_player_id(&self.game_state, player_ref);

        // Call get_ui(state, player) — optional, returns #{} if missing
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "get_ui",
            (self.game_state.clone(), Dynamic::from(player)),
        );
        let ui_map = match result {
            Ok(v) => v
                .try_cast::<rhai::Map>()
                .unwrap_or_else(rhai::Map::new),
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(serde_json::Value::Object(serde_json::Map::new()));
            }
            Err(e) => return Err(CvError::from(e)),
        };

        let mut json_map = serde_json::Map::new();

for (id_immutable, element_dyn) in &ui_map {
            let id = id_immutable.to_string();
            // Duplicate check
            if json_map.contains_key(&id) {
                return Err(CvError::Internal(format!(
                    "duplicate UI element ID '{}' in get_ui return value",
                    id
                )));
            }

            let elem_map = element_dyn
                .clone()
                .try_cast::<rhai::Map>()
                .ok_or_else(|| {
                    CvError::Internal(format!("UI element '{}' is not a map", id))
                })?;

            let typ = elem_map
                .get("type")
                .and_then(|v| v.clone().into_string().ok())
                .unwrap_or_default();

            let json_element = match typ.as_str() {
                "button" => {
                    let label = elem_map
                        .get("label")
                        .and_then(|v| v.clone().into_string().ok())
                        .unwrap_or_default();
                    let on_click: FnPtr = elem_map
                        .get("on_click")
                        .cloned()
                        .ok_or_else(|| {
                            CvError::Internal(format!(
                                "button '{}' missing on_click handler",
                                id
                            ))
                        })?
                        .cast();
                    self.handler_registry
                        .insert(id.clone(), StoredHandler::Button {
                            closure: on_click,
                        });
                    serde_json::json!({ "type": "button", "label": label })
                }
                "piece_selection" => {
                    let title = elem_map
                        .get("title")
                        .and_then(|v| v.clone().into_string().ok())
                        .unwrap_or_default();
                    let pieces_dyn = elem_map
                        .get("pieces")
                        .cloned()
                        .ok_or_else(|| {
                            CvError::Internal(format!(
                                "piece_selection '{}' missing pieces array",
                                id
                            ))
                        })?;
                    let pieces_arr = pieces_dyn
                        .try_cast::<rhai::Array>()
                        .unwrap_or_default();
                    let pieces_json: Vec<serde_json::Value> = pieces_arr
                        .iter()
                        .filter_map(|d| {
                            let piece: Piece = d.clone().try_cast::<Piece>()?;
                            Some(serde_json::json!({
                                "color": piece.color_name(),
                                "type": piece.piece_type_name(),
                            }))
                        })
                        .collect();
                    let on_select: FnPtr = elem_map
                        .get("on_select")
                        .cloned()
                        .ok_or_else(|| {
                            CvError::Internal(format!(
                                "piece_selection '{}' missing on_select handler",
                                id
                            ))
                        })?
                        .cast();
                    self.handler_registry
                        .insert(id.clone(), StoredHandler::PieceSelection {
                            closure: on_select,
                        });
                    serde_json::json!({
                        "type": "piece_selection",
                        "title": title,
                        "pieces": pieces_json,
                    })
                }
                "banner" => {
                    let text = elem_map
                        .get("text")
                        .and_then(|v| v.clone().into_string().ok())
                        .unwrap_or_default();
                    let style = elem_map
                        .get("style")
                        .and_then(|v| v.clone().into_string().ok())
                        .unwrap_or_else(|| "info".to_string());
                    serde_json::json!({ "type": "banner", "text": text, "style": style })
                }
                _ => {
                    continue;
                }
            };

            json_map.insert(id, json_element);
        }

        Ok(serde_json::Value::Object(json_map))
    }

    /// Validate a move exists in valid_actions (called before on_move)
    fn compute_valid_actions(&self, player_json: &str) -> Result<Vec<Action>, CvError> {
        if self.is_game_over() {
            return Ok(vec![]);
        }

        let player_ref: PlayerRef = serde_json::from_str(player_json)?;
        let player = player_ref_to_player_id(&self.game_state, &player_ref);
        let mut scope = Scope::new();
        let result = self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "valid_actions",
            (self.game_state.clone(), Dynamic::from(player)),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(vec![]);
            }
            Err(e) => return Err(CvError::from(e)),
        };
        let all: Vec<Action> = {
            let arr = actions_dyn
                .clone()
                .try_cast::<rhai::Array>()
                .ok_or_else(|| {
                    CvError::Internal("valid_actions did not return an array".into())
                })?;
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

    /// Check if the script defines a function by trying to call it.
    fn script_has_function(&self, name: &str) -> bool {
        let mut scope = Scope::new();
        match self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            name,
            (self.game_state.clone(),),
        ) {
            Ok(_) => true,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => false,
            Err(_) => true, // other errors mean the function exists but something went wrong
        }
    }

    fn is_game_over(&self) -> bool {
        self.game_state
            .read_lock::<rhai::Map>()
            .and_then(|m| m.get("game_over").cloned())
            .map(|v| !v.is_unit())
            .unwrap_or(false)
    }

    fn call_check_game_over(&mut self) -> Result<(), CvError> {
        let mut scope = Scope::new();
        match self.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.ast,
            "check_game_over",
            (self.game_state.clone(),),
        ) {
            Ok(state) => {
                self.game_state = state;
                Ok(())
            }
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => Ok(()),
            Err(e) => Err(CvError::from(e)),
        }
    }

    fn extract_game_over_dyn(&self) -> Option<serde_json::Value> {
        let map = self.game_state.read_lock::<rhai::Map>()?;
        let go = map.get("game_over")?.clone();
        if go.is_unit() {
            return None;
        }
        if let Some(go_map) = go.clone().try_cast::<rhai::Map>() {
            let mut json = serde_json::Map::new();
            for (k, v) in go_map.iter() {
                let val: serde_json::Value = if let Some(s) = v.clone().into_string().ok() {
                    serde_json::Value::String(s)
                } else if let Ok(n) = v.as_int() {
                    serde_json::json!(n)
                } else if let Some(arr) = v.clone().try_cast::<rhai::Array>() {
                    let items: Vec<serde_json::Value> = arr
                        .iter()
                        .filter_map(|d| d.as_int().ok().map(|n| serde_json::json!(n)))
                        .collect();
                    serde_json::Value::Array(items)
                } else {
                    continue;
                };
                json.insert(k.to_string(), val);
            }
            return Some(serde_json::Value::Object(json));
        }
        None
    }

    /// Execute a move from native Rust code (integration tests).
    /// `player_ref`: JSON like `{"board":0,"color":"white"}`
    /// `from`, `to`: Coords
    /// `piece`: optional piece for reserve drops
    pub fn handle_move(
        &mut self,
        player_json: String,
        from: Coords,
        to: Coords,
        piece: Option<Piece>,
    ) -> Result<MoveResult, CvError> {
        let player_ref: PlayerRef = serde_json::from_str(&player_json)?;
        self.run_handle_move(&player_ref, &from, &to, piece.as_ref())
    }

    /// Returns a clone of the current game state (for integration tests).
    pub fn state(&self) -> Dynamic {
        self.game_state.clone()
    }
}