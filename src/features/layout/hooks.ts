import { useCallback, useContext, useLayoutEffect } from "react";
import { LayoutConfig, LayoutContext } from "./Layout";

export const useLayoutConfigSetter = (config: Partial<LayoutConfig>) => {
  const { extendDefault } = useContext(LayoutContext);
  useLayoutEffect(() => {
    extendDefault(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
