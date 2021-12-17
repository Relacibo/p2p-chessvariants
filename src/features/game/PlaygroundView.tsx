import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Chessboard } from "../chessboard/Chessboard";
import { selectGame } from "../variant-environment/variantsSlice";

function PlaygroundView() {
  const { id } = useParams();
  const state = useSelector(selectGame(id!))
  const isStateSet = state != null;
  const failed = false;


  useEffect(() => {
    if (failed) {
      toast.error("Could not open the game!");
    }
  });
  return (
    <>
      <Chessboard boardState={[]}/>
    </>
  );
}

export default PlaygroundView;
