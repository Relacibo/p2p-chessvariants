import React, { useState } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { useParams } from "react-router-dom";
import { selectGames } from "../variant-environment/variantsSlice";
import { createSelector } from "@reduxjs/toolkit";

export function Chessboard() {
  const { id: string } = useParams();
  const games = useSelector(selectGames);
  return <div></div>;
}

export default Chessboard;
