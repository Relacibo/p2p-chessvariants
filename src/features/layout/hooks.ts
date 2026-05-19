import { useContext, useLayoutEffect } from "react";
import { LayoutConfig, LayoutContext } from "./Layout";

const useConfigureLayout = (
  fun: (config: LayoutConfig) => Partial<LayoutConfig>
) => {
  const { config, setConfig, setSidebarCollapsed } = useContext(LayoutContext);
  useLayoutEffect(() => {
    const partial = fun(config);
    setConfig((c) => ({ ...c, ...partial }));
    // Always start collapsed; Layout keeps the sidebar open when navPinned=true
    // on desktop via collapsable=false, independent of sidebarCollapsedState.
    setSidebarCollapsed(true);
  }, []);
};
export default useConfigureLayout;
