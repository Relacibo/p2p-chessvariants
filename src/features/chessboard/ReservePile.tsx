import { Box, Group, Paper, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { WasmPiece } from "./types";
import { getPieceImageUrl } from "./pieceImages";

interface ReservePileProps {
  /** Accepts either the old WasmReservePileState or a simple pieces array */
  reservePile: { reserve_piles: WasmPiece[][] } | { pieces: WasmPiece[] };
  selectedPiece?: WasmPiece | null;
  onSelectPiece?: (piece: WasmPiece | null) => void;
  /** Tile size in px; piece icons scale to 80% of this. Defaults to 40. */
  tileSize?: number;
}

function getPiles(
  rp: ReservePileProps["reservePile"]
): WasmPiece[][] {
  if ("reserve_piles" in rp) return rp.reserve_piles;
  if ("pieces" in rp) return [rp.pieces];
  return [];
}

export function ReservePile({
  reservePile,
  selectedPiece,
  onSelectPiece,
  tileSize = 40,
}: ReservePileProps) {
  const pieceSize = Math.round(tileSize * 0.85);
  const piles = getPiles(reservePile);

  return (
    <Stack gap="xs">
      {piles.map((pile: WasmPiece[], pIdx: number) => {
        const color = ["white", "black", "red", "blue"][pIdx] ?? "white";
        const label = ["White", "Black", "Red", "Blue"][pIdx] ?? `Player ${pIdx}`;
        return (
          <Paper key={pIdx} withBorder p="xs">
            <Text size="xs" fw={600} mb={4} c="dimmed">
              {label} reserve
            </Text>
            <Group gap={4} wrap="wrap" mih={pieceSize + 8}>
              {pile.length === 0 && (
                <Text size="xs" c="dimmed" fs="italic">empty</Text>
              )}
              {pile.map((piece: WasmPiece, i: number) => {
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
                        onSelectPiece?.(isSelected ? null : piece)
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
                        cursor: "pointer",
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
