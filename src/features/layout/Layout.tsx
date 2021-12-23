import { Box, Button, Grid, Nav, Sidebar } from "grommet";
import React, { createContext, useState } from "react";
import AnchorLink from "../../AnchorLink";
import style from "./Layout.module.css";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";
import { FormNext, FormPrevious } from "grommet-icons";
import PeerDisplay from "../peer/PeerDisplay";

export type LayoutProps = {
  children: JSX.Element | JSX.Element[] | never[];
};

export type LayoutConfig = {
  sidebarCollapsed: boolean;
  sidebarCollapsable: boolean;
  sidebarIsOverlay: boolean;
};

const defaultConfig: LayoutConfig = {
  sidebarCollapsed: false,
  sidebarCollapsable: true,
  sidebarIsOverlay: false,
};

export const LayoutContext = createContext<{
  config: LayoutConfig;
  apply: (val: Partial<LayoutConfig>) => void;
  extendDefault: (val: Partial<LayoutConfig>) => void;
}>({
  config: defaultConfig,
  apply: () => {},
  extendDefault: () => {},
});

function Layout(props: LayoutProps) {
  const { children } = props;
  const [config, setConfig] = useState(defaultConfig);

  const { sidebarCollapsed, sidebarCollapsable, sidebarIsOverlay } = config;
  const apply = (partial: Partial<LayoutConfig>) =>
    setConfig({ ...config, ...partial });
  const extendDefault = (partial: Partial<LayoutConfig>) =>
    setConfig({ ...defaultConfig, ...partial });

  return (
    <LayoutContext.Provider
      value={{
        config,
        apply,
        extendDefault,
      }}
    >
      <Grid
        fill
        rows={["flex"]}
        columns={["flex", "auto"]}
        gap="small"
        areas={[["main", "sidebar"]]}
      >
        {!sidebarCollapsed && (
          <Sidebar
            gridArea="sidebar"
            width="15.4vw"
            style={
              sidebarIsOverlay
                ? {
                    position: "absolute",
                    right: 0,
                    minWidth: "10em",
                  }
                : {
                    position: "relative",
                    minWidth: "10em",
                  }
            }
            background={{
              color: "brand",
            }}
          >
            {sidebarCollapsable && (
              <Box
                style={{
                  zIndex: 30,
                  position: "absolute",
                  left: ".5em",
                  bottom: ".5em",
                }}
              >
                <Button
                  style={{
                    padding: 0,
                    width: "small",
                  }}
                  icon={<FormNext size="40%" />}
                  onClick={() => {
                    apply({ sidebarCollapsed: true });
                  }}
                />
              </Box>
            )}
            <Box style={{ zIndex: 10 }}>
              <Box
                margin={{ top: "small" }}
                alignSelf="center"
                className={style.navbarTitle}
              >
                pawn-connect.org
              </Box>
              <Nav margin={{ top: "large" }} gap="small">
                <AnchorLink size="xlarge" to={"/"}>
                  Join Lobby
                </AnchorLink>
                <AnchorLink size="xlarge" to={"game"}>
                  Games
                </AnchorLink>
              </Nav>
            </Box>
            <Box gap="medium" margin={{ left: "0", top: "auto" }}>
              <PeerDisplay />
              <Box alignSelf="end">
                <DarkmodeSelector />
              </Box>
            </Box>
          </Sidebar>
        )}
        <Box gridArea="main" style={{ position: "relative" }}>
          {children}
          {sidebarCollapsed && (
            <Button
              plain={false}
              style={{
                position: "absolute",
                bottom: "1em",
                right: "1em",
                width: "small",
                borderRadius: "2em",
                padding: 0,
              }}
              icon={<FormPrevious size="40%" />}
              onClick={() => {
                apply({ sidebarCollapsed: false });
              }}
            />
          )}
        </Box>
      </Grid>
    </LayoutContext.Provider>
  );
}

export default Layout;
