import { Group, Title, Button } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import { useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import { handleError } from "../../util/notification";
import { Chessboard } from "../chessboard/Chessboard";
import useConfigureLayout from "../layout/hooks";
import { getGithubBrowseUrl } from "../lobby/scriptUrl";
import { selectAllVariants } from "../lobby/variantsSlice";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  useConfigureLayout(() => ({ navPinned: false }));
  const { id } = useParams();
  const gameInfo = useSelector(selectGame(id!));
  const variants = useSelector(selectAllVariants);
  const failed = gameInfo == null;

  useLayoutEffect(() => {
    if (failed) {
      handleError("Could not open the game!");
    }
  });
  if (failed) {
    return <Navigate to="/game"></Navigate>;
  }

  const scriptUrl = gameInfo.variant;
  const variantName =
    variants.find((v) => v.url === scriptUrl)?.name || "Custom Variant";
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
      {/* <Chessboard boardState={[]} /> */}
    </>
  );
}

export default PlaygroundView;
