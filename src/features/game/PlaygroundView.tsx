import { useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import { showError } from "../../util/notification";
import { Chessboard } from "../chessboard/Chessboard";
import useSwitchSzene from "../layout/hooks";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  useSwitchSzene(() => ({ sidebarAlwaysExtendedInLarge: false }));
  const { id } = useParams();
  const state = useSelector(selectGame(id!));
  const failed = state == null;

  useLayoutEffect(() => {
    if (failed) {
      showError("Could not open the game!");
    }
  });
  if (failed) {
    return <Navigate to="/game"></Navigate>;
  }
  return (
    <>
      <Chessboard boardState={[]} />
    </>
  );
}

export default PlaygroundView;
