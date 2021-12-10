import React, { useState } from 'react';
import { Route, Routes, useParams } from 'react-router';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { Chessboard } from '../chessboard/Chessboard';

function PlaygroundUI() {
  const { id } = useParams();
  return (
    <div>
      <Routes>
        <Route path="/">
          <Route path=":id" element={<Chessboard />} />
        </Route>
      </Routes>
    </div>
  )
}

export default PlaygroundUI;
