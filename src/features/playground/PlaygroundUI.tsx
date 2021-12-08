import React, { useState } from 'react';
import { Route, Routes, useParams } from 'react-router';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { Chessboard } from '../chessboard/Chessboard';

export function PlaygroundUI() {
    const { id } = useParams();
    return (
        <Routes>
            <Route path="/">
                
            </Route>
            <Route path=":id">
                <div>
                    <Chessboard/>
                </div>
            </Route>
        </Routes>
    )
}
