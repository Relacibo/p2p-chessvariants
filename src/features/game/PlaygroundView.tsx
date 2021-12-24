import React, { useContext, useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Chessboard } from "../chessboard/Chessboard";
import { LayoutContext } from "../layout/Layout";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  const { extendDefault } = useContext(LayoutContext);
  useLayoutEffect(() => {
    extendDefault({
      sidebarCollapsed: true,
      sidebarCollapsable: true,
      sidebarIsOverlay: true,
    });
  }, []);
  const { id } = useParams();
  const state = useSelector(selectGame(id!));
  const failed = state == null;

  useLayoutEffect(() => {
    if (failed) {
      toast.error("Could not open the game!");
    }
  });
  if (failed) {
    return <Navigate to="/game"></Navigate>
  }
  return (
    <>
      <Chessboard boardState={[]} />
    </>
  );
}

export default PlaygroundView;
