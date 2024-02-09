import { Table } from "@mantine/core";
import { useSelector } from "../../app/hooks";
import useConfigureLayout from "../layout/hooks";
import { selectGames } from "../variant-environment/variantsSlice";

const GameListView = () => {
  useConfigureLayout(() => ({ sidebarAlwaysExtendedInLarge: true }));
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
