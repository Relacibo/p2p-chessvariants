/**
 * Maps our engine piece_type string → Wikimedia Commons file letter.
 * See https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces
 *
 * File pattern: Chess_{PIECE_LETTER}{COLOR_LETTER}t45.svg
 *   {PIECE_LETTER} from this map; {COLOR_LETTER} from COLOR_LETTER below
 *   "t" = transparent background; "45" = 45×45 viewBox
 */
const PIECE_LETTER: Record<string, string> = {
  // ── Standard FIDE pieces ──
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",

  // ── Rotated standard pieces (for 4-player boards etc.) ──
  king_rotated: "f",
  queen_rotated: "g",
  rook_rotated: "m",
  bishop_rotated: "B",
  knight_rotated: "N",
  pawn_rotated: "h",

  // ── Fairy pieces ──
  ferz: "F",
  wazir: "W",
  dabbaba: "v",
  elephant: "e",
  giraffe: "G",
  unicorn: "U",
  zebra: "Z",
  nightrider: "K",
  mann: "M",
  centaur: "C",
  commoner: "x",
  champion: "z",
  wizard: "w",
  fool: "t",
  archbishop: "a",
  chancellor: "c",
  amazon: "A",
  dragon: "D",
  short_rook: "S",
  boat: "s",
  ship: "s", // alias for boat

  // ── Common variant aliases ──
  hawk: "a", // Seirawan: Hawk = Archbishop (Bishop+Knight)
  princess: "a",
  cardinal: "a",
  empress: "c", // Seirawan: Elephant in some naming, but Chancellor = Rook+Knight
  marshal: "c",
  camel: "Z", // Zebra is closest visually to a camel in this set
  duck: "", // no visual match — will use fallback rendering
};

/**
 * Maps colour string → Wikimedia Commons colour letter.
 *   l = light (white), d = dark (black), r = red, g = green, y = yellow, b = blue
 */
const COLOR_LETTER: Record<string, string> = {
  white: "l",
  black: "d",
  red: "l", // fall back to light SVG + tint (no red SVGs downloaded yet)
  blue: "l",
  yellow: "l",
  green: "l",
};

/**
 * Hex tint colour applied to sprites for colours that reuse the light SVG.
 * Only needed for colours not available as dedicated SVG files.
 */
export const PIECE_TINT: Record<string, number> = {
  red: 0xff3333,
  blue: 0x3366ff,
  yellow: 0xffdd33,
  green: 0x33cc33,
};

/**
 * Returns the URL of the SVG texture for a given piece type and colour,
 * or `null` when no mapping exists (caller should render a fallback).
 *
 * URL format: /pieces/wikimedia/Chess_{pieceLetter}{colorLetter}t45.svg
 */
export function getPieceImageUrl(color: string, pieceType: string): string | null {
  const letter = PIECE_LETTER[pieceType];
  // Explicitly return null for empty-string mappings (intentionally missing)
  if (letter === undefined || letter === "") return null;
  const colorLetter = COLOR_LETTER[color] ?? COLOR_LETTER["white"];
  return `/pieces/wikimedia/Chess_${letter}${colorLetter}t45.svg`;
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function getCachedImage(url: string): HTMLImageElement | undefined {
  return imageCache.get(url);
}

export async function preloadAllPieceImages(): Promise<void> {
  const colors = ["white", "black"];
  const pieceTypes = ["king", "queen", "rook", "bishop", "knight", "pawn"];
  await Promise.all(
    colors.flatMap((color) =>
      pieceTypes.map(async (pieceType) => {
        const url = getPieceImageUrl(color, pieceType);
        if (!url || imageCache.has(url)) return;
        try {
          const img = await loadImage(url);
          imageCache.set(url, img);
        } catch (e) {
          console.error("[pieceImages] failed to preload piece image", url, e);
        }
      })
    )
  );
}
