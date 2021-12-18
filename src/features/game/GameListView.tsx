import { useContext, useEffect } from "react";
import { LayoutContext } from "../layout/Layout";
import StorageDisplay from "../StorageDisplay";

const GameListView = () => {
  const { extendDefault } = useContext(LayoutContext);
  useEffect(() => {
    extendDefault({ sidebarCollapsed: false, sidebarCollapsable: false });
  }, []);
  return (
    <>
      <StorageDisplay />
    </>
  );
};

export default GameListView;
