import { useContext, useLayoutEffect } from "react";
import { LayoutConfig, LayoutContext } from "./Layout";

const useConfigureLayout = (
  fun: (config: LayoutConfig) => Partial<LayoutConfig>
) => {
  const { config, setConfig, setSidebarCollapsed } = useContext(LayoutContext);
  useLayoutEffect(() => {
    const partial = fun(config);
    setConfig((c) => ({ ...c, ...partial }));
    // Pinned pages open the sidebar; non-pinned pages collapse it on navigation.
    setSidebarCollapsed(!(partial.navPinned ?? false));
  }, []);
};
export default useConfigureLayout;
