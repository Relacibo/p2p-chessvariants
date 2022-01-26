import { useNotifications } from "@mantine/notifications";
import React, { useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import { showError } from "../../util/notification";
import { Chessboard } from "../chessboard/Chessboard";
import { useLayoutConfigSetter } from "../layout/hooks";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  const notifications = useNotifications();
  useLayoutConfigSetter({
    sidebarCollapsed: true,
    sidebarCollapsable: true,
    sidebarIsOverlay: true,
  });
  const { id } = useParams();
  const state = useSelector(selectGame(id!));
  const failed = state == null;

  useLayoutEffect(() => {
    if (failed) {
      showError(notifications, "Could not open the game!");
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
