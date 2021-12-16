import React from "react";
import { Route, Routes } from "react-router";
import { Chessboard } from "../chessboard/Chessboard";
import StorageDisplay from "../StorageDisplay";


function PlaygroundUI() {/*
  const { id } = useParams();*/
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
