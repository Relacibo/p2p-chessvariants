import { Box, Group, Paper, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { PlayerRef, WasmPiece, WasmReservePileState } from "./types";
import { getPieceImageUrl } from "./pieceImages";

const PLAYER_COLORS = ["white", "black", "red", "blue"];
const PLAYER_LABELS = ["White", "Black", "Red", "Blue"];

/** Parse a player JSON string `{"board":0,"color":"white"}` to extract the color. */
function parsePlayerColor(player: string): string {
  try {
    const p = JSON.parse(player) as PlayerRef;
    return p.color;
  } catch {
    return player; // legacy: plain color string
  }
}

interface ReservePileProps {
  reservePile: WasmReservePileState;
  /** JSON-stringified PlayerRef: `{"board":0,"color":"white"}` */
  player: string;
  selectedPiece?: WasmPiece | null;
  onSelectPiece?: (piece: WasmPiece | null) => void;
  /** Tile size in px; piece icons scale to 80% of this. Defaults to 40. */
  tileSize?: number;
}

export function ReservePile({
  reservePile,
  player,
  selectedPiece,
  onSelectPiece,
  tileSize = 40,
}: ReservePileProps) {
  const pieceSize = Math.round(tileSize * 0.85);
  const playerColor = parsePlayerColor(player);

  return (
    <Stack gap="xs">
      {reservePile.reserve_piles.map((pile, pIdx) => {
        const color = PLAYER_COLORS[pIdx] ?? "white";
        const label = PLAYER_LABELS[pIdx] ?? `Player ${pIdx}`;
        const isMyPile = PLAYER_COLORS[pIdx] === playerColor;
        return (
          <Paper key={pIdx} withBorder p="xs" style={{ opacity: isMyPile ? 1 : 0.65 }}>
            <Text size="xs" fw={600} mb={4} c="dimmed">
              {label} reserve
            </Text>
            <Group gap={4} wrap="wrap" mih={pieceSize + 8}>
              {pile.length === 0 && (
                <Text size="xs" c="dimmed" fs="italic">empty</Text>
              )}
              {pile.map((piece, i) => {
                const imgUrl = getPieceImageUrl(piece.color, piece.pieceType);
                const isSelected =
                  selectedPiece?.color === piece.color &&
                  selectedPiece?.pieceType === piece.pieceType;

                return (
                  <Tooltip
                    key={i}
                    label={`${color} ${piece.pieceType}`}
                    withArrow
                    openDelay={300}
                  >
                    <UnstyledButton
                      onClick={() =>
                        isMyPile
                          ? onSelectPiece?.(isSelected ? null : piece)
                          : undefined
                      }
                      style={{
                        width: pieceSize,
                        height: pieceSize,
                        borderRadius: 4,
                        outline: isSelected ? "2px solid #228be6" : "none",
                        background: isSelected
                          ? "rgba(34,139,230,0.15)"
                          : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: isMyPile ? "pointer" : "default",
                      }}
                    >
                      {imgUrl ? (
                        <Box
                          component="img"
                          src={imgUrl}
                          alt={`${color} ${piece.pieceType}`}
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : (
                        <Text size="xs" fw={700}>
                          {piece.pieceType[0]?.toUpperCase()}
                        </Text>
                      )}
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
