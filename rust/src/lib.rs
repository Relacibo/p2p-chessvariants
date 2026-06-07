use error::CvError;
use game::{board, standard, state::Coords, variant_config::VariantConfig};
use modules::builtins;
use rhai::{AST, Dynamic, Engine, Module, Scope};
use serde::Serialize;
use std::rc::Rc;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub mod error;
mod game;
mod logging;
mod modules;
pub mod rhai_rust_error;

// Re-exports for integration tests and external consumers
pub use game::actions::Action;
pub use game::game_progress::GameProgress;
pub use game::piece::Piece;
pub use game::state::{BoardCoords, BoardState, Coords as GameCoords, GameState, Player};

/// A player's valid moves, as returned by `valid_moves(state, player)`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct PlayerMoves {
    pub player: i32,
    pub moves: Vec<Action>,
}

/// Result of `submitAction()`. Always includes `ui`, `game_over`, and `board_state`.
/// When an error occurs, `error` is set and the other fields are `null`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct SubmitActionResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    ui: serde_json::Value,
    game_over: Option<GameProgress>,
    board_state: serde_json::Value,
}

// ─── Stateless engine (Rhai runtime without game state) ─────────────────────

/// Holds the compiled script and Rhai runtime. Does not contain game state.
/// Top-level `const`/`let` declarations from the variant script are registered
/// as a global module, making them accessible to all `call_fn` invocations
/// regardless of nesting depth.
/// Call `init()` to create a [`ChessvariantEngine`] with an initial game state.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct StatelessChessvariantEngine {
    engine: Engine,
    ast: AST,
    pub(crate) variant_config: VariantConfig,
}

/// Fully initialized chess variant engine, combining the stateless runtime
/// with a concrete [`GameState`].
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct ChessvariantEngine {
    inner: StatelessChessvariantEngine,
    state: GameState,
}

// ─── Builtin Registration ────────────────────────────────────────────────────

fn register_builtins(engine: &mut Engine) {
    use game::state::BoardCoords;
    use game::variant_config::{BoardScriptConfig, VariantConfig};

    engine
        .build_type::<BoardState>()
        .build_type::<game::state::ReservePileState>()
        .build_type::<BoardCoords>()
        .build_type::<Piece>()
        .build_type::<game::piece_defs::PieceDefs>()
        .build_type::<game::variant_config::BoardLayoutConfig>()
        .build_type::<Action>()
        .build_type::<Player>()
        .register_indexer_get_set(
            |p: &mut Player, key: &str| -> Dynamic {
                match &p.data {
                    Some(data) => data
                        .read_lock::<rhai::Map>()
                        .and_then(|m| m.get(key).cloned())
                        .unwrap_or(Dynamic::UNIT),
                    None => Dynamic::UNIT,
                }
            },
            |p: &mut Player, key: &str, value: Dynamic| {
                let map = p
                    .data
                    .get_or_insert_with(|| Dynamic::from(rhai::Map::new()));
                if let Some(mut m) = map.write_lock::<rhai::Map>() {
                    m.insert(key.into(), value);
                }
            },
        )
        .register_type_with_name::<GameProgress>("GameProgress")
        .register_get("progress", GameProgress::get_progress_mut)
        .register_get("winning_team", GameProgress::get_winning_team_mut);

    // State — typed wrapper: board/players are properties, data keys use indexer
    engine
        .register_type_with_name::<GameState>("State")
        .register_get_set(
            "board",
            |s: &mut GameState| s.board.clone(),
            |s: &mut GameState, value: Dynamic| s.board = value,
        )
        .register_get("players", |s: &mut GameState| {
            Dynamic::from(s.players.clone())
        })
        .register_indexer_get_set(GameState::rhai_index_get, GameState::rhai_index_set);

    // VariantConfig — typed Rhai custom type with property access for scripts
    engine
        .register_type_with_name::<VariantConfig>("VariantConfig")
        .register_get("name", |c: &mut VariantConfig| c.name.clone())
        .register_get("version", |c: &mut VariantConfig| c.version.clone())
        .register_get("api_version", |c: &mut VariantConfig| c.api_version)
        .register_get("colors", |c: &mut VariantConfig| {
            Dynamic::from(c.colors.iter().map(|s| Dynamic::from(s.clone())).collect::<rhai::Array>())
        })
        .register_get("board", |c: &mut VariantConfig| c.board.clone());

    // BoardScriptConfig — nested under VariantConfig, accessible via config.board
    engine
        .register_type_with_name::<BoardScriptConfig>("BoardScriptConfig")
        .register_get("rows", |b: &mut BoardScriptConfig| b.rows)
        .register_get("cols", |b: &mut BoardScriptConfig| b.cols)
        .register_get("count", |b: &mut BoardScriptConfig| b.count);

    // Coords is an opaque enum — register manually with getters.
    engine
        .register_type_with_name::<Coords>("Coords")
        .register_get("type", Coords::get_type_mut)
        .register_get("row", Coords::get_row_mut)
        .register_get("col", Coords::get_col_mut)
        .register_get("board_index", Coords::get_board_index_mut)
        .register_get("index", Coords::get_index_mut);

    engine.register_fn("PieceDefs", game::piece_defs::PieceDefs::new_empty);
    engine.register_fn("PieceDefs", game::piece_defs::PieceDefs::new_from_array);

    // ── Legacy global aliases (backward compat for existing variant scripts) ──
    engine.register_fn("board_empty", BoardState::board_empty);
    engine.register_fn("board_get", board::rhai_board_get);
    engine.register_fn("board_set", board::rhai_board_set);
    engine.register_fn("board_move_piece", board::rhai_board_move_piece);
    engine.register_fn("board_find", board::rhai_board_find_piece);
    engine.register_fn("board_find_by_color", board::rhai_board_find_by_color);

    // Equality operators
    engine.register_fn("==", |a: Coords, b: Coords| -> bool { a == b });
    engine.register_fn("!=", |a: Coords, b: Coords| -> bool { a != b });
    engine.register_fn("==", |a: BoardCoords, b: BoardCoords| -> bool { a == b });
    engine.register_fn("!=", |a: BoardCoords, b: BoardCoords| -> bool { a != b });
    engine.register_fn("==", |a: Player, b: Player| -> bool { a.id == b.id });
    engine.register_fn("!=", |a: Player, b: Player| -> bool { a.id != b.id });

    // ── Global constructors ──
    engine.register_fn("Coords", Coords::new_board_0);
    engine.register_fn("Coords", Coords::new_board);
    engine.register_fn("ReserveCoords", Coords::new_reserve);
    engine.register_fn("Player", Player::new_by_id);
    engine.register_fn("Player", Player::new_by_id_name);
    engine.register_fn("Player", Player::new_full);
    engine.register_fn("Player", Player::new_with_data);
    engine.register_fn("Move", Action::rhai_move);
    engine.register_fn("SelectPiece", Action::rhai_select_piece);
    engine.register_fn("Interact", Action::rhai_interact);
    engine.register_fn("Cancel", Action::rhai_cancel);
    engine.register_fn("Piece", Piece::rhai_new);
    engine.register_fn("InProgress", GameProgress::in_progress);
    engine.register_fn("Winner", GameProgress::winner);
    engine.register_fn("Draw", GameProgress::draw);
    engine.register_fn("standard_start_position", standard::standard_start_position);
    engine.register_fn(
        "merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn("Rect", |r1: i32, c1: i32, r2: i32, c2: i32| -> rhai::Map {
        let mut m = rhai::Map::new();
        m.insert("r1".into(), Dynamic::from(r1));
        m.insert("c1".into(), Dynamic::from(c1));
        m.insert("r2".into(), Dynamic::from(r2));
        m.insert("c2".into(), Dynamic::from(c2));
        m
    });

    // Namespaced modules
    engine.register_static_module("engine::board", Rc::new(builtins::create_board_submodule()));
    engine.register_static_module("engine::moves", Rc::new(builtins::create_moves_submodule()));
    engine.register_static_module("log", Rc::new(builtins::create_log_module()));
}

fn register_engine_helpers(engine: &mut Engine) {
    engine.register_fn(
        "engine::merge",
        |base: rhai::Map, updates: rhai::Map| -> rhai::Map {
            let mut result = base;
            result.extend(updates);
            result
        },
    );
    engine.register_fn(
        "engine::standard_start_position",
        standard::standard_start_position,
    );
}

// ─── Rhai Map helpers ────────────────────────────────────────────────────────

fn player_field_i32(m: &rhai::Map, key: &str) -> i32 {
    match m.get(key).and_then(|v| v.as_int().ok()) {
        Some(v) => v as i32,
        None => {
            if m.contains_key(key) {
                crate::logging::log_warn(&format!(
                    "[rhai] field '{key}' exists but is not an integer, using default 0"
                ));
            }
            0
        }
    }
}

fn player_field_string(m: &rhai::Map, key: &str) -> String {
    match m.get(key).and_then(|v: &Dynamic| v.clone().into_string().ok()) {
        Some(v) => v,
        None => {
            if m.contains_key(key) {
                crate::logging::log_warn(&format!(
                    "[rhai] field '{key}' exists but is not a string, using default \"\""
                ));
            }
            String::new()
        }
    }
}

fn player_from_map(m: &rhai::Map) -> Result<Player, CvError> {
    let id = m.get("id")
        .and_then(|v| v.as_int().ok())
        .map(|v| v as i32)
        .ok_or_else(|| CvError::Internal("player entry missing required 'id' field".into()))?;
    let name = m.get("name")
        .and_then(|v| v.clone().into_string().ok())
        .unwrap_or_default();
    let home_board = player_field_i32(m, "home_board");
    let team = player_field_i32(m, "team");
    let orientation = m.get("orientation")
        .and_then(|v| v.clone().into_string().ok())
        .ok_or_else(|| CvError::Internal(format!("player {id}: orientation not resolved")))?;
    Ok(Player { id, name, home_board, team, orientation, data: m.get("data").cloned() })
}

// ─── Player resolution ───────────────────────────────────────────────────────

/// Resolve a player ID to a `Player` from `state.players`.
/// Used both by WASM-facing methods and integration tests.
pub fn resolve_player(state: &GameState, player_id: i32) -> Result<Player, CvError> {
    for p in &state.players {
        let Some(m) = p.clone().try_cast::<rhai::Map>() else {
            continue;
        };
        if player_field_i32(&m, "id") == player_id {
            return player_from_map(&m);
        }
    }
    Err(CvError::Internal(format!(
        "player {player_id} not found in state.players"
    )))
}

/// Look up a player's full Rhai map from `state.players` by id.
fn get_player_map(state: &GameState, player_id: i32) -> Option<Dynamic> {
    state.players.iter().find_map(|p| {
        let m = p.clone().try_cast::<rhai::Map>()?;
        (m.get("id")?.as_int().ok()? == player_id).then(|| Dynamic::from(m))
    })
}

// ─── StatelessChessvariantEngine ─────────────────────────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl StatelessChessvariantEngine {
    /// Compile a Rhai script, evaluate top-level declarations, and extract
    /// [`VariantConfig`] from the mandatory `config()` function.
    /// Returns a stateless engine ready for `init()`.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String) -> Result<Self, CvError> {
        let mut engine = Engine::new();
        register_builtins(&mut engine);

        let ast = engine.compile(&script_content)?;

        // Register ALL engine helpers BEFORE evaluating the script,
        // so that closures in `let`/`const` declarations (like
        // condition: |s,f,t| engine::board::get(...)) can reference them.
        register_engine_helpers(&mut engine);

        let mut scope = Scope::new();

        // Run the AST top-level to evaluate `let`/`const` declarations
        // and install fn definitions into the scope.
        engine.run_ast_with_scope(&mut scope, &ast)?;

        // Extract ALL top-level `let`/`const` declarations from the scope and
        // register them as a global module so they are visible in every scope.
        // This makes closures inside piece definitions (|s,f,t| ...) work,
        // as Rhai closures do not automatically capture their environment.
        {
            let mut module = Module::new();
            for (name, _const, value) in scope.iter() {
                module.set_var(name, value.clone());
            }
            engine.register_global_module(Rc::new(module));
        }

        let mut config_scope = Scope::new();
        let dynamic_config = engine.call_fn::<Dynamic>(&mut config_scope, &ast, "config", ())?;
        let variant_config: VariantConfig = dynamic_config.try_into()?;

        Ok(Self {
            engine,
            ast,
            variant_config,
        })
    }

    /// Three-phase init flow — runs `setup_players` + `init`.
    ///
    ///   1. Validate player_count against variant config
    ///   2. Call `setup_players(variant_config, player_count)` → players + optional teams
    ///   3. Call `init(variant_config, setup)` → board + variant data
    ///
    /// Engine injects `teams` into `data` so scripts access `state["teams"]` as before.
    /// Consumes `self`.
    pub fn init(self, player_count: i32) -> Result<ChessvariantEngine, CvError> {
        // Validate player count
        if !self
            .variant_config
            .allowed_player_count
            .validate(player_count as u32)
        {
            return Err(CvError::Internal(format!(
                "player_count {player_count} is not allowed by variant config"
            )));
        }

        // Phase 1: setup_players(variant_config, player_count) → { players, teams? }
        let mut setup_scope = Scope::new();
        let setup_result = self.engine.call_fn::<Dynamic>(
            &mut setup_scope,
            &self.ast,
            "setup_players",
            (self.variant_config.clone(), player_count),
        )?;
        let setup_map = setup_result
            .try_cast::<rhai::Map>()
            .ok_or_else(|| {
                CvError::Internal("setup_players() must return a map with 'players' key".into())
            })?;

        self.init_with_setup_map(setup_map)
    }

    /// Init from JSON setup data (players + optional teams as serialized Rhai maps).
    /// For P2P peers: host broadcasts setup, peer calls this to init the engine.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = initFromSetupJson))]
    pub fn init_from_setup_json(self, setup_json: String) -> Result<ChessvariantEngine, CvError> {
        let json_value: serde_json::Value = serde_json::from_str(&setup_json)?;
        let rhai_dynamic = rhai::serde::to_dynamic(&json_value)
            .map_err(|e| CvError::Internal(format!("Failed to convert setup JSON to Rhai: {e}")))?;
        let setup_map = rhai_dynamic
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("setup JSON must be an object".into()))?;

        self.init_with_setup_map(setup_map)
    }
}

// Internal method — not WASM-exposed (rhai::Map cannot cross the WASM boundary).
impl StatelessChessvariantEngine {
    /// Resolve orientation for a single player from the setup data.
    ///
    /// Resolution order (first match wins):
    /// 1. `player["orientation"]` if present in the Rhai map
    /// 2. `teams[player.team].orientations` matching `player.home_board`
    /// 3. Default: team 0 → "normal", team 1 → "flipped", others → "normal"
    fn resolve_orientation(
        player: &mut rhai::Map,
        teams: Option<&rhai::Map>,
    ) -> Result<(), CvError> {
        let id = player_field_i32(player, "id");

        // 1. Player-level orientation (explicit, from script)
        if let Some(ori) = player.get("orientation").and_then(|v| v.clone().into_string().ok()) {
            return Ok(());
        }

        // 2. Team-level orientation
        let team = player_field_i32(player, "team");
        let home_board = player_field_i32(player, "home_board");
        if let Some(teams_map) = teams {
            // Teams can be array-style [{id, orientations}] or map-style {0: {...}, 1: {...}}
            let team_entry = teams_map
                .get(team.to_string().as_str())
                .or_else(|| teams_map.get(format!("team_{team}").as_str()))
                .cloned()
                .or_else(|| {
                    // Search array-style
                    teams_map.values().find_map(|v| {
                        let m = v.clone().try_cast::<rhai::Map>()?;
                        (player_field_i32(&m, "id") == team).then(|| v.clone())
                    })
                });

            if let Some(entry) = team_entry {
                if let Some(tm) = entry.clone().try_cast::<rhai::Map>() {
                    if let Some(orientations) = tm.get("orientations")
                        .and_then(|v| v.clone().try_cast::<rhai::Array>())
                    {
                        for o in orientations {
                            if let Some(om) = o.clone().try_cast::<rhai::Map>() {
                                if player_field_i32(&om, "board") == home_board {
                                    if let Some(ori) = om.get("orientation")
                                        .and_then(|v| v.clone().into_string().ok())
                                    {
                                        player.insert("orientation".into(), Dynamic::from(ori));
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Default per team
        let default = match team {
            0 => "normal",
            1 => "flipped",
            _ => "normal",
        };
        player.insert("orientation".into(), Dynamic::from(default));
        Ok(())
    }

    /// Init from a pre-built setup map (players + optional teams).
    /// Skips `setup_players()` — used by P2P peers that receive setup from the host.
    pub fn init_with_setup_map(self, setup_map: rhai::Map) -> Result<ChessvariantEngine, CvError> {
        let StatelessChessvariantEngine {
            engine,
            ast,
            variant_config,
        } = self;

        let players_raw = setup_map
            .get("players")
            .cloned()
            .and_then(|v| v.try_cast::<rhai::Array>())
            .ok_or_else(|| {
                CvError::Internal(
                    "setup must contain a 'players' key with an array".into(),
                )
            })?;

        let teams_raw = setup_map.get("teams").cloned();
        let teams_map = teams_raw.as_ref().and_then(|v| v.clone().try_cast::<rhai::Map>());

        // Resolve orientation for each player, validate required fields
        let players: Vec<Dynamic> = players_raw
            .into_iter()
            .map(|entry| {
                let mut m = entry.try_cast::<rhai::Map>()
                    .ok_or_else(|| CvError::Internal("each player entry must be a map".into()))?;
                // Validate `id` exists
                if m.get("id").and_then(|v| v.as_int().ok()).is_none() {
                    return Err(CvError::Internal("each player entry must have an 'id' field".into()));
                }
                Self::resolve_orientation(&mut m, teams_map.as_ref())?;
                Ok(Dynamic::from(m))
            })
            .collect::<Result<_, CvError>>()?;

        let teams = teams_raw;

        // Phase 2: init(variant_config, setup) → { board, data: {...} }
        let mut init_scope = Scope::new();
        let init_result = engine.call_fn::<Dynamic>(
            &mut init_scope,
            &ast,
            "init",
            (variant_config.clone(), Dynamic::from(setup_map)),
        )?;
        let init_map = init_result
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal("init() must return a map".into()))?;

        let board = init_map
            .get("board")
            .cloned()
            .ok_or_else(|| CvError::Internal("init() must return a 'board' key".into()))?;

        // Phase 3: Extract data map from init result, inject teams from setup
        let base_data = init_map
            .get("data")
            .cloned()
            .and_then(|d| d.try_cast::<rhai::Map>())
            .unwrap_or_default();

        let mut data = base_data;

        // Inject teams from setup_players into state data so scripts access state["teams"]
        if let Some(teams_val) = teams {
            data.insert("teams".into(), teams_val);
        }

        let game_state = GameState::from_parts(board, players, data);

        Ok(ChessvariantEngine {
            inner: StatelessChessvariantEngine {
                engine,
                ast,
                variant_config,
            },
            state: game_state,
        })
    }
}

// WASM-exposed getters and utilities on StatelessChessvariantEngine.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl StatelessChessvariantEngine {
    // ── Config getters (WASM-facing) ──

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

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.variant_config)?)
    }

    /// Parse a variant script and return its config as a JSON string (native tests).
    #[allow(dead_code)]
    pub fn parse_config(script_content: String) -> Result<String, CvError> {
        let stateless = Self::new(script_content)?;
        Ok(serde_json::to_string(&stateless.variant_config)?)
    }

    /// Parse a variant script and return its config as a JS object.
    /// Does not call `init()` — suitable for lobby previews.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = parseConfig))]
    pub fn parse_config_js(script_content: String) -> Result<wasm_bindgen::JsValue, CvError> {
        let stateless = Self::new(script_content)?;
        serde_wasm_bindgen::to_value(&stateless.variant_config)
            .map_err(|e| CvError::Internal(e.to_string()))
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

// ─── ChessvariantEngine: getters & static utilities ──────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    /// Combined constructor for WASM. Compiles the script and initialises
    /// the game state in one step (runs setup_players + init).
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(script_content: String, player_count: i32) -> Result<Self, CvError> {
        let stateless = StatelessChessvariantEngine::new(script_content)?;
        stateless.init(player_count)
    }

    /// Combined constructor for P2P peers. Compiles the script and initialises
    /// with pre-built setup data (received from the host).
    /// Called as `ChessvariantEngine.newWithSetup(script, setupJson)` in JS.
    pub fn new_with_setup(script_content: String, setup_json: String) -> Result<Self, CvError> {
        let stateless = StatelessChessvariantEngine::new(script_content)?;
        stateless.init_from_setup_json(setup_json)
    }

    // ── Getters ──

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(getter))]
    pub fn name(&self) -> String {
        self.inner.variant_config.name.clone()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playerCount))]
    pub fn player_count(&self) -> i32 {
        self.max_players()
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = minPlayers))]
    pub fn min_players(&self) -> i32 {
        match &self.inner.variant_config.allowed_player_count {
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().min().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { min, .. } => *min as i32,
        }
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = maxPlayers))]
    pub fn max_players(&self) -> i32 {
        match &self.inner.variant_config.allowed_player_count {
            game::variant_config::AllowedPlayerCount::Exact(n) => *n as i32,
            game::variant_config::AllowedPlayerCount::Discrete(vals) => {
                vals.iter().max().copied().unwrap_or(0) as i32
            }
            game::variant_config::AllowedPlayerCount::Range { max, .. } => *max as i32,
        }
    }

    /// Parse a variant script and return its config as a JSON string (native).
    pub fn parse_config(script_content: String) -> Result<String, CvError> {
        StatelessChessvariantEngine::parse_config(script_content)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = parseConfig))]
    pub fn parse_config_js(script_content: String) -> Result<wasm_bindgen::JsValue, CvError> {
        StatelessChessvariantEngine::parse_config_js(script_content)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = variantConfigJson))]
    pub fn variant_config_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.inner.variant_config)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = setLogLevel))]
    pub fn set_log_level(level: String) {
        logging::set_log_level(&level);
    }
}

// ─── Core engine logic (WASM-facing) ─────────────────────────────────────────

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl ChessvariantEngine {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = boardStateJson))]
    pub fn board_state_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.try_as_board_state()?)?)
    }

    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = playersJson))]
    pub fn players_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string(&self.state.players)?)
    }

    /// Returns full game state as JSON.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = stateJson))]
    pub fn state_json(&self) -> Result<String, CvError> {
        Ok(serde_json::to_string_pretty(&self.state)?)
    }

    /// Compute valid_moves for a single player.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validMovesForPlayerJson))]
    pub fn valid_moves_for_player_json(&mut self, player_json: String) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.state, player_id)?;
        let moves = self.compute_valid_moves_for_player(&player)?;
        Ok(serde_json::to_string(&PlayerMoves { player: player.id, moves })?)
    }

    /// Returns valid moves for ALL players + game_over.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = validMovesAllJson))]
    pub fn valid_moves_all_json(&mut self) -> Result<String, CvError> {
        let (all_moves, game_over) = self.compute_valid_moves_all()?;
        let valid_moves_json: Vec<serde_json::Value> = all_moves
            .iter()
            .map(|pm| serde_json::to_value(pm).map_err(CvError::Json))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(serde_json::to_string(&serde_json::json!({
            "valid_moves": valid_moves_json,
            "game_over": game_over,
        }))?)
    }

    /// Submit an action. Always returns a JSON string.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = submitAction))]
    pub fn submit_action_js(&mut self, player_json: String, action_json: String) -> String {
        match self.submit_action_js_impl(player_json, action_json) {
            Ok(json) => json,
            Err(e) => serde_json::to_string(&SubmitActionResult {
                error: Some(e.to_string()),
                ui: serde_json::Value::Null,
                game_over: None,
                board_state: serde_json::Value::Null,
            })
            .unwrap_or_else(|e| format!(r#"{{"error":"{}"}}"#, e)),
        }
    }

    /// Fetch the UI for a player without changing state.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = deriveUiJson))]
    pub fn derive_ui_json_js(&self, player_json: String) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.state, player_id)?;
        let ui = self.run_derive_ui(&player)?;
        Ok(serde_json::to_string(&serde_json::json!({ "ui": ui }))?)
    }

    /// Returns `true` when the game has reached a terminal state.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = deriveGameProgressBool))]
    pub fn derive_game_progress_bool(&mut self) -> bool {
        matches!(self.compute_valid_moves_all(), Ok((_, Some(_))))
    }

    /// Returns the IDs of all players who currently have valid moves.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(js_name = activePlayerIds))]
    pub fn active_player_ids(&mut self) -> Result<Vec<i32>, CvError> {
        let player_ids = self.get_player_ids()?;
        let mut active = Vec::new();
        for pid in &player_ids {
            let moves = self.compute_valid_moves_for_player(pid)?;
            if !moves.is_empty() {
                active.push(pid.id);
            }
        }
        Ok(active)
    }
}

// ─── Core engine logic (native) ──────────────────────────────────────────────

impl ChessvariantEngine {
    fn try_as_board_state(&self) -> Result<BoardState, CvError> {
        // Single BoardState
        if let Some(b) = self.state.board.clone().try_cast::<BoardState>() {
            return Ok(b);
        }
        // Array of BoardState — merge into one
        let Some(arr): Option<rhai::Array> = self.state.board.clone().try_cast::<rhai::Array>()
        else {
            todo!("handle empty board! Don't return sentinel! Return error: board wrong format")
        };
        if arr.is_empty() {
            todo!("empty board array in try_as_board_state");
        }
        let first: BoardState = arr[0]
            .clone()
            .try_cast::<BoardState>()
            .ok_or_else(|| CvError::Internal("board array element is not a BoardState".into()))?;
        let mut boards: Vec<Vec<Option<Piece>>> = first.boards.clone();
        for elem in &arr[1..] {
            if let Some(b) = elem.clone().try_cast::<BoardState>() {
                boards.extend(b.boards);
            }
        }
        Ok(BoardState {
            rows: first.rows,
            cols: first.cols,
            number_of_boards: boards.len() as i32,
            boards,
        })
    }

    fn submit_action_js_impl(
        &mut self,
        player_json: String,
        action_json: String,
    ) -> Result<String, CvError> {
        let player_id: i32 = serde_json::from_str(&player_json)?;
        let player = resolve_player(&self.state, player_id)?;
        let action: Action = serde_json::from_str(&action_json)?;
        let result = self.submit_action_core(&player, &action)?;
        Ok(serde_json::to_string(&result)?)
    }

    /// Core action submission. Used both by WASM `submitAction` and native tests.
    pub fn submit_action_core(
        &mut self,
        player: &Player,
        action: &Action,
    ) -> Result<serde_json::Value, CvError> {
        if action.kind == "move" {
            let legal_moves = self.compute_valid_moves_for_player(player)?;
            if !legal_moves.iter().any(|m| m == action) {
                return Err(CvError::Internal("illegal move".into()));
            }
        }
        // Use a block so the scope is dropped before recursive calls
        {
            let mut scope = Scope::new();
            let new_state_dyn = self.inner.engine.call_fn::<Dynamic>(
                &mut scope,
                &self.inner.ast,
                "handle_action",
                (
                    Dynamic::from(self.state.clone()),
                    get_player_map(&self.state, player.id).ok_or_else(|| {
                        CvError::Internal(format!("player {} not found", player.id))
                    })?,
                    Dynamic::from(action.clone()),
                ),
            )?;

            self.state = new_state_dyn
                .try_cast::<GameState>()
                .ok_or_else(|| CvError::Internal("handle_action must return a State".into()))?;
        } // drop scope here

        let (_, game_over) = self.compute_valid_moves_all()?;
        let ui = self.run_derive_ui(player)?;
        let board_json = serde_json::to_value(self.try_as_board_state()?)?;

        Ok(serde_json::to_value(&SubmitActionResult {
            error: None,
            ui,
            game_over,
            board_state: board_json,
        })?)
    }

    /// Returns a reference to the current game state.
    pub fn state(&self) -> &GameState {
        &self.state
    }

    /// Submit a move by player ID (for integration tests).
    pub fn submit_move(
        &mut self,
        player_id: i32,
        from: Coords,
        to: Coords,
    ) -> Result<serde_json::Value, CvError> {
        let player = resolve_player(&self.state, player_id)?;
        let action = Action::rhai_move(from, to);
        self.submit_action_core(&player, &action)
    }

    /// Submit a select_piece action by player ID (for promotion / gating tests).
    pub fn submit_select_piece(
        &mut self,
        player_id: i32,
        color: &str,
        piece_type: &str,
    ) -> Result<serde_json::Value, CvError> {
        let player = resolve_player(&self.state, player_id)?;
        let piece = Piece::rhai_new(color.to_string(), piece_type.to_string());
        let action = Action::rhai_select_piece(piece);
        self.submit_action_core(&player, &action)
    }

    /// Returns the current game outcome from `derive_game_progress()`.
    pub fn outcome(&mut self) -> Option<GameProgress> {
        match self.compute_valid_moves_all() {
            Ok((_, game_over)) => game_over,
            _ => None,
        }
    }

    #[allow(dead_code)]
    fn read_piece_from_board(&self, coords: &Coords) -> Result<Piece, CvError> {
        let bc = coords
            .as_board_coords()
            .ok_or_else(|| CvError::Internal("cannot read piece from non-board coords".into()))?;
        self.try_as_board_state()?
            .get_piece(&bc)
            .cloned()
            .ok_or_else(|| CvError::Internal("no piece at source square".into()))
    }

    fn run_derive_ui(&self, player: &Player) -> Result<serde_json::Value, CvError> {
        let mut scope = Scope::new();
        let result = self.inner.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.inner.ast,
            "derive_ui",
            (
                Dynamic::from(self.state.clone()),
                get_player_map(&self.state, player.id).ok_or_else(|| {
                    CvError::Internal(format!("player {} not found for derive_ui", player.id))
                })?,
            ),
        );
        let ui_map = match result {
            Ok(v) => v
                .try_cast::<rhai::Map>()
                .ok_or_else(|| CvError::Internal("derive_ui must return a map".into()))?,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => {
                return Ok(serde_json::Value::Object(serde_json::Map::new()));
            }
            Err(e) => return Err(CvError::from(e)),
        };

        serialize_ui_to_json(&ui_map)
    }

    fn compute_valid_moves_for_player(&mut self, player: &Player) -> Result<Vec<Action>, CvError> {
        let mut scope = Scope::new();
        let result = self.inner.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.inner.ast,
            "valid_moves",
            (
                Dynamic::from(self.state.clone()),
                get_player_map(&self.state, player.id).ok_or_else(|| {
                    CvError::Internal(format!("player {} not found for valid_moves", player.id))
                })?,
            ),
        );
        let actions_dyn = match result {
            Ok(v) => v,
            Err(e) => match &*e {
                rhai::EvalAltResult::ErrorFunctionNotFound(fn_sig, ..)
                    if fn_sig.starts_with("valid_moves") =>
                {
                    // Script has no valid_moves function — no moves defined.
                    return Ok(vec![]);
                }
                _ => return Err(CvError::from(e)),
            },
        };

        let arr = actions_dyn
            .try_cast::<rhai::Array>()
            .ok_or_else(|| CvError::Internal("valid_moves did not return an array".into()))?;

        Ok(arr
            .into_iter()
            .filter_map(|item| {
                item.clone()
                    .try_cast::<Action>()
                    .or_else(|| rhai::serde::from_dynamic(&item).ok())
            })
            .collect())
    }

    fn get_player_ids(&self) -> Result<Vec<Player>, CvError> {
        self.state
            .players
            .iter()
            .map(|p: &Dynamic| {
                let pm: rhai::Map = p
                    .clone()
                    .try_cast::<rhai::Map>()
                    .ok_or_else(|| CvError::Internal("player entry is not a map".into()))?;
                player_from_map(&pm)
            })
            .collect()
    }

    fn compute_valid_moves_all(
        &mut self,
    ) -> Result<(Vec<PlayerMoves>, Option<GameProgress>), CvError> {
        let player_ids = self.get_player_ids()?;
        let mut result = Vec::new();

        for pid in &player_ids {
            let moves = self.compute_valid_moves_for_player(pid)?;
            result.push(PlayerMoves {
                player: pid.id,
                moves,
            });
        }

        let game_over = self.call_derive_game_progress(&result)?;
        Ok((result, game_over))
    }

    /// Calls the script's mandatory `derive_game_progress(state, all_valid_moves)`.
    /// Returns `Ok(None)` for `InProgress`, `Ok(Some(progress))` for terminal states.
    /// Propagates errors — the function is mandatory, no fallback.
    fn call_derive_game_progress(
        &mut self,
        all_moves: &[PlayerMoves],
    ) -> Result<Option<GameProgress>, CvError> {
        let mut scope = Scope::new();
        let mut entries: rhai::Array = Vec::new();
        for pm in all_moves {
            let mut entry = rhai::Map::new();
            let player_map = get_player_map(&self.state, pm.player).ok_or_else(|| {
                CvError::Internal(format!(
                    "player {} not found for derive_game_progress",
                    pm.player
                ))
            })?;
            entry.insert("player".into(), player_map);
            let moves_arr: rhai::Array =
                pm.moves.iter().map(|m| Dynamic::from(m.clone())).collect();
            entry.insert("moves".into(), Dynamic::from(moves_arr));
            entries.push(Dynamic::from(entry));
        }

        let progress: GameProgress = self.inner.engine.call_fn(
            &mut scope,
            &self.inner.ast,
            "derive_game_progress",
            (Dynamic::from(self.state.clone()), Dynamic::from(entries)),
        )?;

        match progress {
            GameProgress::InProgress => Ok(None),
            GameProgress::Draw | GameProgress::Decisive { .. } => Ok(Some(progress)),
        }
    }

    #[allow(dead_code)]
    fn script_has_function(&self, name: &str) -> bool {
        let mut scope = Scope::new();
        match self.inner.engine.call_fn::<Dynamic>(
            &mut scope,
            &self.inner.ast,
            name,
            (self.state.clone(),),
        ) {
            Ok(_) => true,
            Err(e) if matches!(*e, rhai::EvalAltResult::ErrorFunctionNotFound(..)) => false,
            Err(_) => true,
        }
    }
}

// ─── Orientation helper ─────────────────────────────────────────────────────

// ─── UI Serialization helper ──────────────────────────────────────────────────

/// Serialize a Rhai UI element map to JSON, stripping handler closures.
fn serialize_ui_to_json(ui_map: &rhai::Map) -> Result<serde_json::Value, CvError> {
    let mut json_map = serde_json::Map::new();

    for (id_immutable, element_dyn) in ui_map {
        let id = id_immutable.to_string();
        if json_map.contains_key(&id) {
            return Err(CvError::Internal(format!(
                "duplicate UI element ID '{id}' in derive_ui return value"
            )));
        }

        let elem_map = element_dyn
            .clone()
            .try_cast::<rhai::Map>()
            .ok_or_else(|| CvError::Internal(format!("UI element '{id}' is not a map")))?;

        let typ = elem_map
            .get("type")
            .and_then(|v| v.clone().into_string().ok());
        let Some(typ) = typ else {
            return Err(CvError::Internal(format!(
                "UI element '{id}' has no 'type' field"
            )));
        };

        let json_element = match typ.as_str() {
            "button" => {
                let label = elem_map
                    .get("label")
                    .and_then(|v| v.clone().into_string().ok())
                    .ok_or_else(|| {
                        CvError::Internal(format!("button '{id}' has no 'label' field"))
                    })?;
                serde_json::json!({ "type": "button", "label": label })
            }
            "banner" => {
                let text = elem_map
                    .get("text")
                    .and_then(|v| v.clone().into_string().ok())
                    .ok_or_else(|| {
                        CvError::Internal(format!("banner '{id}' has no 'text' field"))
                    })?;
                let style = elem_map
                    .get("style")
                    .and_then(|v| v.clone().into_string().ok())
                    .unwrap_or_else(|| "info".to_string());
                serde_json::json!({ "type": "banner", "text": text, "style": style })
            }
            "reserve_pile" => {
                let pieces_arr = elem_map
                    .get("pieces")
                    .cloned()
                    .and_then(|d| d.try_cast::<rhai::Array>())
                    .ok_or_else(|| {
                        CvError::Internal(format!("reserve_pile '{id}' has no 'pieces' array"))
                    })?;
                let pieces_json: Vec<serde_json::Value> = pieces_arr
                    .iter()
                    .filter_map(|d| d.clone().try_cast::<Piece>())
                    .map(|p| serde_json::to_value(&p).map_err(CvError::Json))
                    .collect::<Result<Vec<_>, _>>()?;
                let board_index = player_field_i32(&elem_map, "board_index");
                serde_json::json!({ "type": "reserve_pile", "pieces": pieces_json, "board_index": board_index })
            }
            "piece_picker" => {
                let pieces_arr = elem_map
                    .get("pieces")
                    .cloned()
                    .and_then(|d| d.try_cast::<rhai::Array>())
                    .ok_or_else(|| {
                        CvError::Internal(format!("piece_picker '{id}' has no 'pieces' array"))
                    })?;
                let pieces_json: Vec<serde_json::Value> = pieces_arr
                    .iter()
                    .filter_map(|d| d.clone().try_cast::<Piece>())
                    .map(|p| serde_json::to_value(&p).map_err(CvError::Json))
                    .collect::<Result<Vec<_>, _>>()?;
                let cancelable = elem_map.get("cancelable").and_then(|v| v.as_bool().ok());
                let title = elem_map
                    .get("title")
                    .cloned()
                    .and_then(|v: Dynamic| v.into_string().ok());
                let mut json = serde_json::json!({
                    "type": "piece_picker",
                    "pieces": pieces_json,
                });
                if let Some(c) = cancelable {
                    json["cancelable"] = serde_json::Value::Bool(c);
                }
                if let Some(t) = title {
                    json["title"] = serde_json::Value::String(t);
                }
                json
            }
            _ => continue,
        };

        json_map.insert(id, json_element);
    }

    Ok(serde_json::Value::Object(json_map))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use game::state::Coords;

    fn chess_script() -> String {
        include_str!("../../variants/chess.rhai").to_string()
    }

    fn new_engine(script: &str) -> ChessvariantEngine {
        let stateless =
            StatelessChessvariantEngine::new(script.to_string()).expect("engine construction");
        stateless.init(2).expect("init should succeed")
    }

    #[test]
    fn test_config_returns_correct_values() {
        let engine = new_engine(&chess_script());
        let config = engine.variant_config_json().expect("variant_config_json");
        let v: serde_json::Value = serde_json::from_str(&config).expect("parse config JSON");
        assert_eq!(v["name"], "Chess");
        assert_eq!(v["allowed_player_count"]["exact"], 2);
        assert_eq!(v["board"]["rows"], 8);
        assert_eq!(v["board"]["cols"], 8);
        assert_eq!(v["board"]["count"], 1);
    }

    #[test]
    fn test_parse_config_standalone() {
        let config = ChessvariantEngine::parse_config(chess_script()).expect("parse_config");
        let v: serde_json::Value = serde_json::from_str(&config).expect("parse config JSON");
        assert_eq!(v["name"], "Chess");
        assert_eq!(v["board"]["rows"], 8);
    }

    #[test]
    fn test_board_state_has_8x8_board() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse board state JSON");
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
        let boards = v["boards"].as_array().expect("boards array");
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0].as_array().expect("board rows").len(), 64);
    }

    #[test]
    fn test_board_has_32_pieces() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        let board = &v["boards"][0];
        let piece_count = board
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| !c.is_null())
            .count();
        assert_eq!(
            piece_count, 32,
            "standard start position should have 32 pieces"
        );
    }

    #[test]
    fn test_players_json_has_two_players() {
        let engine = new_engine(&chess_script());
        let pj = engine.players_json().expect("players_json");
        let v: serde_json::Value = serde_json::from_str(&pj).expect("parse");
        let players = v.as_array().expect("players array");
        assert_eq!(players.len(), 2);
        // Player 0 has data.color = "white"
        assert_eq!(players[0]["data"]["color"], "white");
        // Player 1 has data.color = "black"
        assert_eq!(players[1]["data"]["color"], "black");
    }

    #[test]
    fn test_valid_moves_returns_for_white() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["valid_moves"].as_array().expect("valid_moves array");
        assert_eq!(all.len(), 2, "should have moves for 2 players");
        // Find white player's moves (id=0)
        let white = all
            .iter()
            .find(|e| e["player"].as_i64() == Some(0))
            .expect("white player");
        let moves = white["moves"].as_array().expect("white moves");
        assert!(!moves.is_empty(), "white should have valid moves");
        // Each move should have type "move"
        for m in moves {
            assert_eq!(m["type"], "move", "move action type");
            assert!(m["from"]["row"].as_i64().is_some());
            assert!(m["to"]["row"].as_i64().is_some());
        }
    }

    #[test]
    fn test_active_player_has_moves_inactive_does_not() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["valid_moves"].as_array().expect("valid_moves array");
        // Only the active player (white, id=0, turn=0) should have moves
        let white = all
            .iter()
            .find(|e| e["player"].as_i64() == Some(0))
            .expect("white player");
        let black = all
            .iter()
            .find(|e| e["player"].as_i64() == Some(1))
            .expect("black player");
        assert!(
            !white["moves"].as_array().unwrap().is_empty(),
            "white should have valid moves"
        );
        assert!(
            black["moves"].as_array().unwrap().is_empty(),
            "black should NOT have moves (not black's turn)"
        );
    }

    #[test]
    fn test_valid_moves_for_single_player() {
        let mut engine = new_engine(&chess_script());
        let vm = engine
            .valid_moves_for_player_json("0".to_string())
            .expect("valid_moves_for_player_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let moves = v["moves"].as_array().expect("moves array");
        assert!(!moves.is_empty(), "white should have moves");
    }

    #[test]
    fn test_submit_move_works() {
        let mut engine = new_engine(&chess_script());
        // Move white pawn from a2 to a4: Coords(6,0) -> Coords(4,0)
        let from = Coords::new_board(6, 0, 0);
        let to = Coords::new_board(4, 0, 0);
        let result = engine.submit_move(0, from, to);
        assert!(result.is_ok(), "submit_move should succeed for a2a4");
        // After move, black should be the active player
        let vm = engine
            .valid_moves_all_json()
            .expect("valid_moves_all_json after move");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let all = v["valid_moves"].as_array().expect("valid_moves array");
        // White's moves should be empty (not white's turn)
        let white = all
            .iter()
            .find(|e| e["player"].as_i64() == Some(0))
            .expect("white player");
        assert!(
            white["moves"].as_array().unwrap().is_empty(),
            "white should have no moves after playing"
        );
        // Black should have moves
        let black = all
            .iter()
            .find(|e| e["player"].as_i64() == Some(1))
            .expect("black player");
        assert!(
            !black["moves"].as_array().unwrap().is_empty(),
            "black should have moves"
        );
    }

    #[test]
    fn test_submit_illegal_move_fails() {
        let mut engine = new_engine(&chess_script());
        // Try moving white queen from d1 to d5 — illegal with pawns in the way
        let from = Coords::new_board(7, 3, 0);
        let to = Coords::new_board(3, 3, 0);
        let result = engine.submit_move(0, from, to);
        assert!(result.is_err(), "illegal move should fail");
    }

    #[test]
    fn test_pawn_move_sequence() {
        let mut engine = new_engine(&chess_script());
        // a2a4 (white pawn push) — this is a legal move
        engine
            .submit_move(0, Coords::new_board(6, 0, 0), Coords::new_board(4, 0, 0))
            .unwrap();
        // b7b5 (black pawn push)
        engine
            .submit_move(1, Coords::new_board(1, 1, 0), Coords::new_board(3, 1, 0))
            .unwrap();
        // a4a5 (white pawn push)
        engine
            .submit_move(0, Coords::new_board(4, 0, 0), Coords::new_board(3, 0, 0))
            .unwrap();
        // After 3 moves, verify board state changed
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        // Should still be 8x8
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
    }

    #[test]
    fn test_derive_ui_returns_empty_for_no_promotion() {
        let engine = new_engine(&chess_script());
        let ui = engine
            .derive_ui_json_js("0".to_string())
            .expect("derive_ui_json");
        let v: serde_json::Value = serde_json::from_str(&ui).expect("parse");
        // No promotion pending — should be empty or have minimal structure
        assert!(v.as_object().is_some());
        assert!(
            !v.as_object().unwrap().contains_key("promotion"),
            "no promotion should be pending"
        );
    }

    #[test]
    fn test_game_progress_is_in_progress() {
        let mut engine = new_engine(&chess_script());
        assert!(
            !engine.derive_game_progress_bool(),
            "game should be in progress"
        );
        assert!(engine.outcome().is_none(), "no outcome yet");
    }

    #[test]
    fn test_engine_with_chess_variant() {
        let engine = new_engine(&chess_script());
        let bs = engine.board_state_json().expect("board_state_json");
        let v: serde_json::Value = serde_json::from_str(&bs).expect("parse");
        assert_eq!(v["rows"], 8);
        assert_eq!(v["cols"], 8);
        // Standard chess has 32 pieces
        let board = &v["boards"][0];
        let piece_count = board
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| !c.is_null())
            .count();
        assert_eq!(piece_count, 32, "standard start position has 32 pieces");
    }

    #[test]
    fn test_state_json_roundtrip() {
        let engine = new_engine(&chess_script());
        let sj = engine.state_json().expect("state_json");
        let v: serde_json::Value = serde_json::from_str(&sj).expect("parse");
        // state has board and players
        assert!(v.get("board").is_some(), "state should have board key");
        assert!(
            v["board"].is_object(),
            "board must be a JSON object (not a type-name string), got: {:?}",
            v["board"]
        );
        assert!(v["players"].is_array(), "state.players should be array");
        assert!(
            v.get("data").is_some(),
            "state should have 'data' key with variant-specific fields"
        );
        assert!(
            v["data"].get("turn").is_some(),
            "state.data should have turn key"
        );
    }

    /// PIECE_DEFS is registered as a global module. This test verifies that
    /// the valid_moves function in the script can access PIECE_DEFS and
    /// correctly use pawn condition closures (|s,f,t| engine::board::get(...)).
    #[test]
    fn test_pawn_condition_closure_in_piece_defs() {
        let mut engine = new_engine(&chess_script());
        // Get valid moves for white — this exercises get_pseudo_dests which
        // uses pawn conditions (closures) from PIECE_DEFS
        let vm = engine
            .valid_moves_for_player_json("0".to_string())
            .expect("valid_moves_for_player_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        let moves = v["moves"].as_array().expect("moves array");

        // Find a pawn move — white pawns are on rows 1-6
        let pawn_moves: Vec<_> = moves
            .iter()
            .filter(|m| m["from"]["row"] == 6 || m["from"]["row"] == 5)
            .collect();
        assert!(
            !pawn_moves.is_empty(),
            "white should have pawn moves from ranks 1-2"
        );

        // Each pawn move from starting position should be a single or double step
        for m in &pawn_moves {
            let from_row = m["from"]["row"].as_i64().unwrap();
            let to_row = m["to"]["row"].as_i64().unwrap();
            let row_diff = from_row - to_row;
            assert!(
                row_diff == 1 || row_diff == 2,
                "pawn move should be 1 or 2 squares forward, got from row {} to row {}",
                from_row,
                to_row
            );
        }
    }

    /// Test that the derive_game_progress function reports correctly.
    #[test]
    fn test_derive_game_progress_in_progress() {
        let mut engine = new_engine(&chess_script());
        let vm = engine.valid_moves_all_json().expect("valid_moves_all_json");
        let v: serde_json::Value = serde_json::from_str(&vm).expect("parse");
        // Game is in progress — game_over should be null
        assert!(
            v["game_over"].is_null(),
            "game_over should be null for in-progress game"
        );
        assert_eq!(engine.player_count(), 2);
    }

    /// Test engine construction with 4 players fails for chess (only allows 2).
    #[test]
    fn test_invalid_player_count_fails() {
        let stateless =
            StatelessChessvariantEngine::new(chess_script()).expect("stateless engine creation");
        let result = stateless.init(4);
        assert!(result.is_err(), "chess only allows 2 players");
    }

    /// Test the engine name and player count getters.
    #[test]
    fn test_name_and_player_count() {
        let engine = new_engine(&chess_script());
        assert_eq!(engine.name(), "Chess");
        assert_eq!(engine.player_count(), 2);
        assert_eq!(engine.min_players(), 2);
        assert_eq!(engine.max_players(), 2);
    }
}
