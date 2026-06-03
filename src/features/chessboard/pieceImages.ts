const PIECE_LETTER: Record<string, string> = {
  king: "K",
  queen: "Q",
  rook: "R",
  bishop: "B",
  knight: "N",
  pawn: "P",
};

const COLOR_PREFIX: Record<string, string> = {
  white: "w",
  black: "b",
  red: "w",    // reuse white piece + tint
  blue: "w",   // reuse white piece + tint
  yellow: "w", // reuse white piece + tint
  green: "w",  // reuse white piece + tint
};

/** Hex tint colour applied to sprites for non-white/black pieces. */
export const PIECE_TINT: Record<string, number> = {
  red: 0xff3333,
  blue: 0x3366ff,
  yellow: 0xffdd33,
  green: 0x33cc33,
};

export function getPieceImageUrl(color: string, pieceType: string): string | null {
  const prefix = COLOR_PREFIX[color];
  const letter = PIECE_LETTER[pieceType];
  if (!prefix || !letter) return null;
  return `/pieces/cburnett/${prefix}${letter}.svg`;
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
        } catch {
          // ignore — piece image simply won't render
        }
      })
    )
  );
}
