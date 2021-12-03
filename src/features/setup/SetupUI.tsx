import React, { useState } from 'react';

import { useAppSelector, useAppDispatch } from '../../app/hooks';
import { Chessboard } from '../chessboard/Chessboard';

export function SetupUI() {
    return (
    <form>
        <label>
            <input type="text" name="NameInput" />
        </label>
        <input type="submit" value="Submit" />
    </form>
    )
}
