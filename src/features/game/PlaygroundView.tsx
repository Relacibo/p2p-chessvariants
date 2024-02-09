import { useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import { handleError } from "../../util/notification";
import { Chessboard } from "../chessboard/Chessboard";
import useConfigureLayout from "../layout/hooks";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: false }));
  const { id } = useParams();
  const state = useSelector(selectGame(id!));
  const failed = state == null;

  useLayoutEffect(() => {
    if (failed) {
      handleError("Could not open the game!");
    }
  });
  if (failed) {
    return <Navigate to="/game"></Navigate>;
  }
  return (
    <>
      {/* <Chessboard boardState={[]} /> */}
    </>
  );
}

export default PlaygroundView;
