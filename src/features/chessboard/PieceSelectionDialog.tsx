import { useMemo } from "react";
import { Box, Button, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { WasmAction, WasmPiece } from "./types";
import { getPieceImageUrl } from "./pieceImages";

/** Minimal wrapper to deduplicate pieces by color + pieceType. */
function dedupePieces(pieces: WasmPiece[]): WasmPiece[] {
  const seen = new Set<string>();
  return pieces.filter((p) => {
    const key = `${p.color}|${p.pieceType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface PieceSelectionDialogProps {
  selectablePieces: WasmPiece[];
  hasCancel: boolean;
  onSubmit: (action: WasmAction) => void;
}

export function PieceSelectionDialog({
  selectablePieces,
  hasCancel,
  onSubmit,
}: PieceSelectionDialogProps) {
  const uniquePieces = useMemo(
    () => dedupePieces(selectablePieces),
    [selectablePieces],
  );

  const pieceSize = 80;

  return (
    <Box
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
      }}
    >
      <Paper
        shadow="xl"
        withBorder
        p="xl"
        radius="md"
        style={{ minWidth: 300, maxWidth: 500 }}
      >
        <Stack gap="md" align="center">
          <Text fw={600} size="lg">
            Choose a piece
          </Text>

          <Group gap="md" justify="center" wrap="wrap">
            {uniquePieces.map((piece, i) => {
              const imgUrl = getPieceImageUrl(piece.color, piece.pieceType);
              const label = `${piece.color} ${piece.pieceType}`;
              return (
                <UnstyledButton
                  key={i}
                  onClick={() =>
                    onSubmit({
                      type: "select_piece",
                      piece,
                    })
                  }
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {imgUrl ? (
                    <Box
                      component="img"
                      src={imgUrl}
                      alt={label}
                      style={{
                        width: pieceSize,
                        height: pieceSize,
                        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                      }}
                    />
                  ) : (
                    <Box
                      style={{
                        width: pieceSize,
                        height: pieceSize,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 32,
                        fontWeight: 700,
                        background: piece.color === "white" ? "#f0f0f0" : "#333",
                        color: piece.color === "white" ? "#333" : "#f0f0f0",
                        borderRadius: 8,
                      }}
                    >
                      {piece.pieceType[0]?.toUpperCase() ?? "?"}
                    </Box>
                  )}
                  <Text size="xs" c="dimmed" tt="capitalize">
                    {piece.pieceType}
                  </Text>
                </UnstyledButton>
              );
            })}
          </Group>

          {hasCancel && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => onSubmit({ type: "cancel" })}
            >
              Cancel
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

export default PieceSelectionDialog;
