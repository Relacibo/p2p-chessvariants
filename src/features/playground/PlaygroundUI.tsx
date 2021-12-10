import React, { useState } from 'react';
import { Route, Routes, useParams } from 'react-router';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { Chessboard } from '../chessboard/Chessboard';

export function PlaygroundUI() {
    const { id } = useParams();
    return (
        <div>
            <Routes>
                <Route path="/">
                    <Route path=":id">
                        <div>
                            <Chessboard />
                        </div>
                    </Route>
                </Route>
            </Routes>
        </div>
    )
}
