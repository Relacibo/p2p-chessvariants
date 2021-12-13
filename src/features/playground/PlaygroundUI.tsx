import React, { useState } from "react";
import { Route, Routes, useParams } from "react-router";

import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { Chessboard } from "../chessboard/Chessboard";
import StorageDisplay from "../StorageDisplay";

function PlaygroundUI() {
  const { id } = useParams();
  return (
    <div>
      <StorageDisplay />
      <Routes>
        <Route path="/">
          <Route path=":id" element={<Chessboard />} />
        </Route>
      </Routes>
    </div>
  );
}

export default PlaygroundUI;
