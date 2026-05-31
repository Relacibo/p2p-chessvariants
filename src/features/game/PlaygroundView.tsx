import { Alert, Box, Group, Loader, Title, Button } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { ChessvariantEngine } from "chessvariant-engine";
import { Chessboard } from "../chessboard/Chessboard";
import { WasmAction, WasmBoardState, WasmVariantConfig } from "../chessboard/types";
import useConfigureLayout from "../layout/hooks";
import { fetchScriptText, getGithubBrowseUrl } from "../lobby/scriptUrl";
import { selectAllVariants } from "../lobby/variantsSlice";

function PlaygroundView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const { id } = useParams();
  const variants = useSelector(selectAllVariants);

  const engineRef = useRef<ChessvariantEngine | null>(null);
  const [variantConfig, setVariantConfig] = useState<WasmVariantConfig | null>(null);
  const [boardState, setBoardState] = useState<WasmBoardState | null>(null);
  const [validActions, setValidActions] = useState<WasmAction[]>([]);
  const [lastAction, setLastAction] = useState<WasmAction | undefined>();
  const [player, setPlayer] = useState<string>("");
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const scriptText = await fetchScriptText(id);
        const engine = new ChessvariantEngine(scriptText, 2);
        if (cancelled) {
          engine.free();
          return;
        }
        engineRef.current = engine;
        setVariantConfig(JSON.parse(engine.variantConfigJson()));
        setBoardState(JSON.parse(engine.boardStateJson()));
        const activePlayers: string[] = JSON.parse(engine.activePlayersJson());
        setPlayer(activePlayers[0] ?? "");
        setValidActions(JSON.parse(engine.validActionsJson(activePlayers[0] ?? "")));
      } catch (e: unknown) {
        if (!cancelled)
          setEngineError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.free();
      engineRef.current = null;
    };
  }, [id]);

  const handleSubmitAction = useCallback(
    (action: WasmAction) => {
      const engine = engineRef.current;
      if (!engine || !player) return;
      try {
        engine.handleEventJson(player, JSON.stringify(action));
        setBoardState(JSON.parse(engine.boardStateJson()));
        const activePlayers: { board: number; color: string }[] = JSON.parse(engine.activePlayersJson());
        const firstPlayerJson = activePlayers[0] ? JSON.stringify(activePlayers[0]) : "";
        setPlayer(firstPlayerJson);
        setValidActions(JSON.parse(engine.validActionsJson(firstPlayerJson)));
        setLastAction(action);
      } catch (e: unknown) {
        console.error("Failed to apply action:", e);
      }
    },
    [player]
  );

  const scriptUrl = id!;
  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name ||
    variantConfig?.name ||
    "Custom Variant";
  const browseUrl = getGithubBrowseUrl(scriptUrl);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>{variantName}</Title>
        <Button
          component="a"
          href={browseUrl}
          target="_blank"
          variant="light"
          leftSection={<IconBrandGithub size="1rem" />}
        >
          View Source
        </Button>
      </Group>

      {engineError && (
        <Alert color="red" title="Engine error" mb="md">
          {engineError}
        </Alert>
      )}

      {!engineError && (!boardState || !variantConfig) && (
        <Box ta="center" py="xl">
          <Loader />
        </Box>
      )}

      {boardState && variantConfig && (
        <Chessboard
          variantConfig={variantConfig}
          boardState={boardState}
          validActions={validActions}
          player={player}
          onSubmitAction={handleSubmitAction}
          lastAction={lastAction}
          size={480}
        />
      )}
    </>
  );
}

export default PlaygroundView;
