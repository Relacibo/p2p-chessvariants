import React, { useContext, useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Chessboard } from "../chessboard/Chessboard";
import { LayoutContext } from "../layout/Layout";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  const { id } = useParams();
  const state = useSelector(selectGame(id!));
  const isStateSet = state != null;
  const failed = false;
  const { extendDefault } = useContext(LayoutContext);
  useLayoutEffect(() => {
    extendDefault({
      sidebarCollapsed: true,
      sidebarCollapsable: true,
      sidebarIsOverlay: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (failed) {
      toast.error("Could not open the game!");
    }
  });
  return (
    <>
      <Chessboard boardState={[]} />
    </>
  );
}

export default PlaygroundView;
