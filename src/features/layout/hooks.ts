import { useContext, useLayoutEffect } from "react";
import { LayoutConfig, LayoutContext } from "./Layout";

const useSwitchSzene = (
  fun: (config: LayoutConfig) => Partial<LayoutConfig>
) => {
  let { config, setConfig, setSidebarCollapsed } = useContext(LayoutContext);
  useLayoutEffect(() => {
    let partial = fun(config);
    setConfig((config) => ({ ...config, ...partial }));
    setSidebarCollapsed(true);
  }, []);
};
export default useSwitchSzene;