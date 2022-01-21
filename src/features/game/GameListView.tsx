import { Table, TableBody, TableCell, TableRow } from "grommet";
import React, { useContext, useLayoutEffect } from "react";
import { useSelector } from "react-redux";
import { LayoutContext } from "../layout/Layout";
import { selectGames, GameInfo } from "../variant-environment/variantsSlice";

const GameListView = () => {
  const { extendDefault } = useContext(LayoutContext);
  useLayoutEffect(() => {
    extendDefault({ sidebarCollapsed: false, sidebarCollapsable: false });
  }, []);
  const games = useSelector(selectGames);
  return (
    <Table>
      <TableBody>
        {Object.entries(games).map(([key, { state, variant }]) => {
          //const {} = variant;
          return (
            <TableRow key={key}>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default GameListView;
