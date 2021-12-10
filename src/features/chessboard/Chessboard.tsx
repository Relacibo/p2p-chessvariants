import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useAppDispatch } from '../../app/hooks';
import { useParams } from 'react-router-dom';

export function Chessboard() {
  const { id: string } = useParams()
  return (
    <div>

    </div>
  )
}

export default Chessboard;
