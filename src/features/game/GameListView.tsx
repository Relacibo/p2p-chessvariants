import { Table } from "@mantine/core";
import { useSelector } from "react-redux";
import { useLayoutConfigSetter } from "../layout/hooks";
import { selectGames } from "../variant-environment/variantsSlice";

const GameListView = () => {
  useLayoutConfigSetter({ sidebarCollapsed: false, sidebarCollapsable: false });
  const games = useSelector(selectGames);
  return (
    <Table>
      <tbody>
        {Object.entries(games).map(([key, { state, variant }]) => {
          //const {} = variant;
          return (
            <tr key={key}>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default GameListView;
