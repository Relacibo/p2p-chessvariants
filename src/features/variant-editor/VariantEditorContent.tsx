import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Editor } from "@monaco-editor/react";
import {
  IconDeviceFloppy,
  IconExternalLink,
  IconFolderOpen,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { registerRhaiLanguage } from "./rhaiLanguage";
import {
  listLocalScripts,
  loadLocalScript,
  saveLocalScript,
} from "./localScripts";

/** Minimal working Rhai variant skeleton with PIECE_DEFS and action handling. */
const EMPTY_TEMPLATE = `fn config() {
    #{ api_version: 1, name: "My Variant", version: "0.1.0", colors: ["white", "black"],
       allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}

// ── Piece definitions ─────────────────────────────────────────────────

const PIECE_DEFS = #{
    king:   #{ moves: [#{ jump: [#[-1,-1],#[-1,0],#[-1,1],#[0,-1],#[0,1],#[1,-1],#[1,0],#[1,1]] }] },
    queen:  #{ moves: [#{ slide: #[#[1,0],#[-1,0],#[0,1],#[0,-1],#[1,1],#[-1,1],#[1,-1],#[-1,-1]] }] },
    rook:   #{ moves: [#{ slide: #[#[1,0],#[-1,0],#[0,1],#[0,-1]] }] },
    bishop: #{ moves: [#{ slide: #[#[1,1],#[-1,1],#[1,-1],#[-1,-1]] }] },
    knight: #{ moves: [#{ jump: #[#[2,1],#[2,-1],#[-2,1],#[-2,-1],#[1,2],#[1,-2],#[-1,2],#[-1,-2]] }] },
    "pawn:white": #{ moves: [
        #{ single: #[1,0], condition: |s,from,to| engine::board::get(s.board, to) == () },
        #{ double: #[2,0], condition: |s,from,to| from.row == 6 && engine::board::get(s.board, to) == ()
                                                                && engine::board::get(s.board, Coords(from.row+1,from.col)) == () },
        #{ jump: #[#[1,1],#[1,-1]], condition: |s,from,to| { let tgt = engine::board::get(s.board, to); tgt != () && tgt.color != "white" } }
    ] },
    "pawn:black": #{ moves: [
        #{ single: #[-1,0], condition: |s,from,to| engine::board::get(s.board, to) == () },
        #{ double: #[-2,0], condition: |s,from,to| from.row == 1 && engine::board::get(s.board, to) == ()
                                                                && engine::board::get(s.board, Coords(from.row-1,from.col)) == () },
        #{ jump: #[#[-1,1],#[-1,-1]], condition: |s,from,to| { let tgt = engine::board::get(s.board, to); tgt != () && tgt.color != "black" } }
    ] },
};

fn get_piece_defs(piece) {
    let key = piece.type + ":" + piece.color;
    if key in PIECE_DEFS { return PIECE_DEFS[key]; }
    if piece.type in PIECE_DEFS { return PIECE_DEFS[piece.type]; }
    #{ moves: [] }
}

// ── Setup & Init ─────────────────────────────────────────────────────

fn setup_players(variant_config, player_count) {
    #{ players: [
        #{ id: 0, name: "White", team: 0, data: #{ color: "white" } },
        #{ id: 1, name: "Black", team: 1, data: #{ color: "black" } },
    ] }
}

fn init(variant_config, setup) {
    #{ board: standard_start_position(),
       data: #{ turn: 0 } }
}

// ── Move generation helpers ──────────────────────────────────────────

fn sq_attacked_by(board, square, enemy_colors, state) {
    for r in 0..board.rows {
        for c in 0..board.cols {
            let p = engine::board::get(board, Coords(r,c));
            if p == () || !(p.color in enemy_colors) { continue; }
            let defs = get_piece_defs(p);
            for m in defs.moves {
                let dests = if "jump" in m {
                    engine::moves::jump(board, Coords(r,c), m.jump)
                } else if "slide" in m {
                    engine::moves::slide(board, Coords(r,c), m.slide)
                } else { continue };
                for d in dests { if d.row == square.row && d.col == square.col && d.board_index == square.board_index { return true; } }
            }
        }
    }
    false
}

fn is_in_check(board, king_color, enemy_colors, state) {
    for r in 0..board.rows {
        for c in 0..board.cols {
            let p = engine::board::get(board, Coords(r,c));
            if p != () && p.type == "king" && p.color == king_color {
                return sq_attacked_by(board, Coords(r,c), enemy_colors, state);
            }
        }
    }
    false
}

// ── valid_moves ──────────────────────────────────────────────────────

fn valid_moves(state, player) {
    if player.id != state["turn"] { return []; }
    let player_color = player["color"];
    let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.data.color);
    if enemies.len == 0 { enemies = state.players.filter(|p| p.data.color != player_color).map(|p| p.data.color); }
    let moves = [];
    for r in 0..state.board.rows {
        for c in 0..state.board.cols {
            let p = engine::board::get(state.board, Coords(r,c));
            if p == () || p.color != player_color { continue; }
            let defs = get_piece_defs(p);
            for m in defs.moves {
                let dests = if "jump" in m {
                    engine::moves::jump(state.board, Coords(r,c), m.jump)
                } else if "slide" in m {
                    engine::moves::slide(state.board, Coords(r,c), m.slide)
                } else if "single" in m {
                    [Coords(r + m.single[0], c + m.single[1])]
                } else if "double" in m {
                    [Coords(r + m.double[0], c + m.double[1])]
                } else { continue };
                for d in dests {
                    if m.condition != () && !m.condition.call(state, Coords(r,c), d) { continue; }
                    let action = Move(Coords(r,c), d);
                    try { handle_action(state, player, action); moves.push(action); }
                    catch(err) { }
                }
            }
        }
    }
    moves
}

// ── derive_game_progress ─────────────────────────────────────────────

fn derive_game_progress(state, all_valid_moves) {
    for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } }
    Draw()
}

// ── handle_action ────────────────────────────────────────────────────

fn handle_action(state, player, action) {
    if action.type != "move" { return state; }

    let player_color = player["color"];
    let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.data.color);
    if enemies.len == 0 { enemies = state.players.filter(|p| p.data.color != player_color).map(|p| p.data.color); }

    // Basic legality checks
    if player.id != state["turn"] { throw "not your turn"; }
    let src = engine::board::get(state.board, action.from);
    if src == () { throw "no piece at source square"; }
    if src.color != player_color { throw "not your piece"; }
    let tgt = engine::board::get(state.board, action.to);
    if tgt != () && tgt.color == player_color { throw "cannot capture own piece"; }

    // Apply the move
    let new_board = engine::board::move_piece(state.board, action.from, action.to);
    if is_in_check(new_board, player_color, enemies, state) { throw "move leaves king in check"; }

    state.board = new_board;
    state["turn"] = if player.id == 0 { 1 } else { 0 };
    state
}

// ── derive_ui ────────────────────────────────────────────────────────

fn derive_ui(state, player) {
    // Return UI elements (buttons, banners, piece_pickers) here.
    // Example: #{
    //     "my_button": #{ type: "button", label: "Resign", on_click: |s| { /* handle */ state } }
    // }
    #{}
}
`;

interface TemplateOption {
  value: string;
  label: string;
}

const TEMPLATES: TemplateOption[] = [
  { value: "/variants/chess.rhai", label: "Chess (Standard)" },
  { value: "/variants/seirawan_chess.rhai", label: "Seirawan Chess" },
  { value: "/variants/bughouse.rhai", label: "Bughouse" },
  { value: "/variants/4player.rhai", label: "4-Player" },
  { value: "__empty__", label: "Empty Skeleton" },
];

const DRAFT_KEY = "cv-editor-draft";

export interface VariantEditorContentProps {
  /** If provided, shown in the toolbar instead of the pop-out button. */
  onTest?: (scriptContent: string) => void;
  /** Show a "Pop out →" button (hidden in the pop-out window itself). */
  showPopOut?: boolean;
}

export function VariantEditorContent({
  onTest,
  showPopOut = false,
}: VariantEditorContentProps) {
  const [scriptContent, setScriptContent] = useState(() => {
    // Restore draft from a previous pop-out or saved state
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        localStorage.removeItem(DRAFT_KEY);
        return draft;
      }
    } catch { /* ignore */ }
    return EMPTY_TEMPLATE;
  });
  const [scriptName, setScriptName] = useState("");
  const [template, setTemplate] = useState<string | null>("__empty__");

  useEffect(() => {
    if (!template) return;
    if (template === "__empty__") {
      setScriptContent(EMPTY_TEMPLATE);
      return;
    }
    fetch(template)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => setScriptContent(text))
      .catch((e) => {
        console.error("[VariantEditor] failed to load template", e);
        notifications.show({
          title: "Template Error",
          message: `Failed to load ${template}: ${e.message}`,
          color: "red",
        });
      });
  }, [template]);

  const handleSave = useCallback(() => {
    const name = scriptName.trim();
    if (!name) {
      notifications.show({
        title: "Save Error",
        message: "Please enter a script name.",
        color: "red",
      });
      return;
    }
    saveLocalScript(name, scriptContent);
    notifications.show({
      title: "Saved",
      message: `"${name}" saved to local storage.`,
      color: "green",
    });
  }, [scriptName, scriptContent]);

  const handleTest = useCallback(() => {
    if (!scriptContent.trim()) return;
    onTest?.(scriptContent);
  }, [scriptContent, onTest]);

  const handlePopOut = useCallback(() => {
    localStorage.setItem(DRAFT_KEY, scriptContent);
    window.open("/dev/editor", "cv-editor-popout", "width=1200,height=900");
  }, [scriptContent]);

  // Load dialog
  const [loadOpened, { open: openLoad, close: closeLoad }] = useDisclosure(false);
  const [savedScripts, setSavedScripts] = useState<{ name: string; savedAt: number }[]>([]);

  const handleOpenLoad = useCallback(() => {
    setSavedScripts(listLocalScripts());
    openLoad();
  }, [openLoad]);

  const handleLoadScript = useCallback(
    (name: string) => {
      const script = loadLocalScript(name);
      if (script) {
        setScriptContent(script);
        setScriptName(name);
        setTemplate(null);
        closeLoad();
        notifications.show({
          title: "Loaded",
          message: `"${name}" loaded.`,
          color: "green",
        });
      }
    },
    [closeLoad],
  );

  return (
    <>
      <Stack h="100%" gap="xs">
        {/* Toolbar */}
        <Group wrap="nowrap">
          <Select
            data={TEMPLATES}
            value={template}
            onChange={setTemplate}
            placeholder="Template"
            clearable
            style={{ width: 200 }}
          />
          <TextInput
            placeholder="Script name"
            value={scriptName}
            onChange={(e) => setScriptName(e.currentTarget.value)}
            style={{ width: 180 }}
          />
          <Button
            variant="light"
            leftSection={<IconDeviceFloppy size="1.1rem" />}
            onClick={handleSave}
          >
            Save
          </Button>
          <Button
            variant="light"
            leftSection={<IconFolderOpen size="1.1rem" />}
            onClick={handleOpenLoad}
          >
            Load
          </Button>
          {onTest && (
            <Button
              variant="filled"
              leftSection={<IconPlayerPlay size="1.1rem" />}
              onClick={handleTest}
            >
              Test
            </Button>
          )}
          {showPopOut && (
            <Button
              variant="subtle"
              leftSection={<IconExternalLink size="1.1rem" />}
              onClick={handlePopOut}
            >
              Pop out
            </Button>
          )}
        </Group>

        {/* Monaco Editor */}
        <Editor
          height="calc(100vh - 100px)"
          language="rhai"
          theme="vs-dark"
          value={scriptContent}
          onChange={(v) => setScriptContent(v ?? "")}
          beforeMount={(monaco) => registerRhaiLanguage(monaco)}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </Stack>

      {/* Load dialog */}
      <Modal
        opened={loadOpened}
        onClose={closeLoad}
        title="Load Script"
        size="sm"
      >
        {savedScripts.length === 0 ? (
          <span>No saved scripts.</span>
        ) : (
          <Stack>
            {savedScripts.map((s) => (
              <Group key={s.name} justify="space-between">
                <div>
                  <div>{s.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => handleLoadScript(s.name)}
                >
                  Load
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
}
