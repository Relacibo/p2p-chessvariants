/**
 * Direct mapping from piece type + colour → image path.
 * Just look up the path, no naming convention logic.
 *
 * To add a new piece: add entries for both "white" and "black" colours.
 * If an SVG doesn't exist, the PixiJS fallback renderer (circle + text) is used.
 */

type ColorKey = "white" | "black";
type PiecePathMap = Record<string, Partial<Record<ColorKey, string>>>;

const W = "/pieces/wikimedia";

const PIECE_PATHS: Record<string, Record<string, string>> = {
  // ── Standard (from cburnett, copied to wikimedia naming) ──
  king:   { white: `${W}/Chess_klt45.svg`, black: `${W}/Chess_kdt45.svg` },
  queen:  { white: `${W}/Chess_qlt45.svg`, black: `${W}/Chess_qdt45.svg` },
  rook:   { white: `${W}/Chess_rlt45.svg`, black: `${W}/Chess_rdt45.svg` },
  bishop: { white: `${W}/Chess_blt45.svg`, black: `${W}/Chess_bdt45.svg` },
  knight: { white: `${W}/Chess_nlt45.svg`, black: `${W}/Chess_ndt45.svg` },
  pawn:   { white: `${W}/Chess_plt45.svg`, black: `${W}/Chess_pdt45.svg` },

  // ── Fairy pieces (from Wikimedia Commons, downloaded) ──
  ferz:       { white: `${W}/Chess_Flt45.svg`, black: `${W}/Chess_Fdt45.svg` },
  wazir:      { white: `${W}/Chess_Wlt45.svg`, black: `${W}/Chess_Wdt45.svg` },
  dabbaba:    { white: `${W}/Chess_vlt45.svg`, black: `${W}/Chess_vdt45.svg` },
  elephant:   { white: `${W}/Chess_elt45.svg`, black: `${W}/Chess_edt45.svg` },
  giraffe:    { white: `${W}/Chess_Glt45.svg`, black: `${W}/Chess_Gdt45.svg` },
  unicorn:    { white: `${W}/Chess_Ult45.svg`, black: `${W}/Chess_Udt45.svg` },
  zebra:      { white: `${W}/Chess_Zlt45.svg`, black: `${W}/Chess_Zdt45.svg` },
  nightrider: { white: `${W}/Chess_Klt45.svg`, black: `${W}/Chess_Kdt45.svg` },
  mann:       { white: `${W}/Chess_Mlt45.svg`, black: `${W}/Chess_Mdt45.svg` },
  centaur:    { white: `${W}/Chess_Clt45.svg`, black: `${W}/Chess_Cdt45.svg` },
  commoner:   { white: `${W}/Chess_xlt45.svg`, black: `${W}/Chess_xdt45.svg` },
  champion:   { white: `${W}/Chess_zlt45.svg`, black: `${W}/Chess_zdt45.svg` },
  wizard:     { white: `${W}/Chess_wlt45.svg`, black: `${W}/Chess_wdt45.svg` },
  fool:       { white: `${W}/Chess_tlt45.svg`, black: `${W}/Chess_tdt45.svg` },
  archbishop: { white: `${W}/Chess_alt45.svg`, black: `${W}/Chess_adt45.svg` },
  chancellor: { white: `${W}/Chess_clt45.svg`, black: `${W}/Chess_cdt45.svg` },
  amazon:     { white: `${W}/Chess_Alt45.svg`, black: `${W}/Chess_Adt45.svg` },
  dragon:     { white: `${W}/Chess_Dlt45.svg`, black: `${W}/Chess_Ddt45.svg` },
  short_rook: { white: `${W}/Chess_Slt45.svg`, black: `${W}/Chess_Sdt45.svg` },
  boat:       { white: `${W}/Chess_slt45.svg`, black: `${W}/Chess_sdt45.svg` },
  ship:       { white: `${W}/Chess_slt45.svg`, black: `${W}/Chess_sdt45.svg` },

  // ── Aliases ──
  hawk:     { white: `${W}/Chess_alt45.svg`, black: `${W}/Chess_adt45.svg` },
  princess: { white: `${W}/Chess_alt45.svg`, black: `${W}/Chess_adt45.svg` },
  cardinal: { white: `${W}/Chess_alt45.svg`, black: `${W}/Chess_adt45.svg` },
  empress:  { white: `${W}/Chess_clt45.svg`, black: `${W}/Chess_cdt45.svg` },
  marshal:  { white: `${W}/Chess_clt45.svg`, black: `${W}/Chess_cdt45.svg` },

  // ── Custom (non-Wikimedia) ──
  duck: { white: `${W}/Custom_Ducklt45.png`, black: `${W}/Custom_Duckdt45.svg` },
};

/**
 * Hex tint applied to sprites for non-white/black colours (red, blue, yellow, green).
 * These colours reuse the white SVG and get tinted in PixiJS.
 */
export const PIECE_TINT: Record<string, number> = {
  red: 0xff3333,
  blue: 0x3366ff,
  yellow: 0xffdd33,
  green: 0x33cc33,
};

/** Colours that don't need tinting (have dedicated files). */
const DIRECT_COLORS = new Set(["white", "black"]);

/**
 * Returns the image path for a piece type and colour,
 * or `null` when no mapping exists (caller should render a fallback).
 */
export function getPieceImageUrl(color: string, pieceType: string): string | null {
  const paths = PIECE_PATHS[pieceType];
  if (!paths) return null;

  // Direct colour match
  if (paths[color]) return paths[color]!;

  // For non-white/black colours (red, blue, etc.), use white path + tint
  if (paths["white"]) return paths["white"]!;

  return null;
}
