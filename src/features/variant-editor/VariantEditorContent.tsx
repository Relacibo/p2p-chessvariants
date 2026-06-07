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

/** Minimal working Rhai variant skeleton using the PieceDefs API. */
const EMPTY_TEMPLATE = `fn config() {
    #{ api_version: 1, name: "My Variant", version: "0.1.0", colors: ["white", "black"],
       allowed_player_count: 2, board: #{ type: "rectangle", rows: 8, cols: 8 } }
}

// ── Piece definitions ─────────────────────────────────────────────────

let PIECE_DEFS = PieceDefs([
    #{ type: "king",   def: [#{ type: "jump", offsets: [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]] }] },
    #{ type: "queen",  def: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "rook",   def: [#{ type: "slide", dirs: [[0,1],[0,-1],[1,0],[-1,0]] }] },
    #{ type: "bishop", def: [#{ type: "slide", dirs: [[1,1],[1,-1],[-1,1],[-1,-1]] }] },
    #{ type: "knight", def: [#{ type: "jump", offsets: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] }] },
    #{ type: "pawn", color: "white", def: [
        #{ type: "jump", offsets: [[-1, 0]], move_type: "move", condition: |s,f,t| engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[-2, 0]], move_type: "move", condition: |s,f,t| f.row == 6 && engine::board::get(s.board, Coords(f.row-1, f.col)) == () && engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[-1,-1],[-1,1]], move_type: "capture", condition: |s,f,t| { let x = engine::board::get(s.board, t); let y = engine::board::get(s.board, f); x == () || x.color != y.color } },
        // En passant (uncomment if your variant uses en passant):
        // #{ type: "jump", offsets: [[-1,-1],[-1,1]], move_type: "move", condition: |s,f,t| s["en_passant"] != () && t == s["en_passant"] },
    ]},
    #{ type: "pawn", color: "black", def: [
        #{ type: "jump", offsets: [[1, 0]], move_type: "move", condition: |s,f,t| engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[2, 0]], move_type: "move", condition: |s,f,t| f.row == 1 && engine::board::get(s.board, Coords(f.row+1, f.col)) == () && engine::board::get(s.board, t) == () },
        #{ type: "jump", offsets: [[1,-1],[1,1]], move_type: "capture", condition: |s,f,t| { let x = engine::board::get(s.board, t); let y = engine::board::get(s.board, f); x == () || x.color != y.color } },
        // En passant (uncomment if your variant uses en passant):
        // #{ type: "jump", offsets: [[1,-1],[1,1]], move_type: "move", condition: |s,f,t| s["en_passant"] != () && t == s["en_passant"] },
    ]},
]);

fn get_pseudo_dests(board, from, state) {
    let piece = engine::board::get(board, from);
    if piece == () { return []; }
    let comps = PIECE_DEFS.get(piece);
    if comps == () { return []; }
    let dests = [];
    for comp in comps {
        let mt = if comp.move_type != () { comp.move_type } else { "both" };
        let raw = switch comp.type {
            "jump"  => engine::moves::jump(board, from, comp.offsets, piece.color, mt),
            "slide" => engine::moves::slide(board, from, comp.dirs, piece.color, mt),
            _ => [],
        };
        if comp.condition != () { raw = raw.filter(|t| comp.condition(state, from, t)); }
        for d in raw { dests.push(d); }
    }
    dests
}

// Like get_pseudo_dests but skips components with move_type == "move"
// (e.g. pawn forward pushes). Used by sq_attacked_by for check detection.
fn get_attack_dests(board, from, state) {
    let piece = engine::board::get(board, from);
    if piece == () { return []; }
    let comps = PIECE_DEFS.get(piece);
    if comps == () { return []; }
    let dests = [];
    for comp in comps {
        if comp.move_type == "move" { continue; }
        let mt = if comp.move_type != () { comp.move_type } else { "both" };
        let raw = switch comp.type {
            "jump"  => engine::moves::jump(board, from, comp.offsets, piece.color, mt),
            "slide" => engine::moves::slide(board, from, comp.dirs, piece.color, mt),
            _ => [],
        };
        if comp.condition != () { raw = raw.filter(|t| comp.condition(state, from, t)); }
        for d in raw { dests.push(d); }
    }
    dests
}

// ── Setup & Init ─────────────────────────────────────────────────────

fn setup_players(variant_config, player_count) {
    #{ players: [
        #{ id: 0, name: "White", team: 0, orientations: [#{ board: 0, orientation: "normal"  }], data: #{ color: "white" } },
        #{ id: 1, name: "Black", team: 1, orientations: [#{ board: 0, orientation: "flipped" }], data: #{ color: "black" } },
    ] }
}

fn init(variant_config, setup) {
    #{ board: standard_start_position(),
       data: #{ turn: 0 } }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn sq_attacked_by(board, square, enemy_colors, state) {
    for r in 0..board.rows { for c in 0..board.cols {
        let p = engine::board::get(board, Coords(r,c));
        if p == () || !enemy_colors.contains(p.color) { continue; }
        let dests = get_attack_dests(board, Coords(r,c), state);
        for d in dests { if d == square { return true; } }
    }}
    false
}

fn is_in_check(board, king_color, enemy_colors, state) {
    let kings = engine::board::find(board, Piece(king_color, "king"));
    if kings == () || kings.len == 0 { return false; }
    sq_attacked_by(board, kings[0], enemy_colors, state)
}

// ── valid_moves ──────────────────────────────────────────────────────

fn valid_moves(state, player) {
    if player.id != state["turn"] { return []; }

    let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.data.color);
    if enemies.len == 0 { enemies = state.players.filter(|p| p.data.color != player.data.color).map(|p| p.data.color); }

    let candidates = [];
    for r in 0..state.board.rows { for c in 0..state.board.cols {
        let from = Coords(r, c);
        let piece = engine::board::get(state.board, from);
        if piece == () || piece.color != player.data.color { continue; }
        let dests = get_pseudo_dests(state.board, from, state);
        for to in dests { candidates.push(Move(from, to)); }
    }}
    candidates.filter(|m| { try { handle_action(state, player, m); true } catch(err) { false } })
}

// ── derive_game_progress ─────────────────────────────────────────────

fn derive_game_progress(state, all_valid_moves) {
    for entry in all_valid_moves { if entry.moves.len > 0 { return InProgress(); } }
    Draw()
}

// ── handle_action ────────────────────────────────────────────────────

fn handle_action(state, player, action) {
    if action.type != "move" { return state; }

    let player_color = player.data.color;
    let enemies = state.players.filter(|p| p.team != player.team).map(|p| p.data.color);
    if enemies.len == 0 { enemies = state.players.filter(|p| p.data.color != player_color).map(|p| p.data.color); }

    if player.id != state["turn"] { throw "not your turn"; }
    let src = engine::board::get(state.board, action.from);
    if src == () { throw "no piece at source square"; }
    if src.color != player_color { throw "not your piece"; }
    let tgt = engine::board::get(state.board, action.to);
    if tgt != () && tgt.color == player_color { throw "cannot capture own piece"; }

    let new_board = engine::board::move_piece(state.board, action.from, action.to);
    if is_in_check(new_board, player_color, enemies, state) { throw "move leaves king in check"; }

    state.board = new_board;
    state["turn"] = if player.id == 0 { 1 } else { 0 };
    state
}

// ── derive_ui ────────────────────────────────────────────────────────

fn derive_ui(state, player) {
    // Return UI elements (buttons, banners, piece_pickers) here.
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
  onTest?: (scriptContent: string) => void;
  showPopOut?: boolean;
  editorHeight?: string;
  /** Extra elements rendered at the right end of the toolbar. */
  toolbarRight?: React.ReactNode;
}

export function VariantEditorContent({
  onTest,
  showPopOut = false,
  editorHeight,
  toolbarRight,
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
          {/* Spacer + caller extras */}
          {toolbarRight && <div style={{ marginLeft: "auto" }} />}
          {toolbarRight}
        </Group>

        {/* Monaco Editor */}
        <Editor
          height={editorHeight ?? "calc(100vh - 100px)"}
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
