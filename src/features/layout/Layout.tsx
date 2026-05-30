import {
  AppShell,
  Burger,
  Button,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";
import { createContext, useState } from "react";
import type React from "react";
import Logo from "./logo";
import Sidebar from "./Sidebar";
import style from "./Layout.module.css";

export type LayoutProps = {
  children: React.JSX.Element | React.JSX.Element[] | never[];
};

export type LayoutConfig = {
  /** When true on desktop, sidebar is always open and cannot be collapsed. */
  navPinned: boolean;
};

const defaultConfig: LayoutConfig = {
  navPinned: false,
};

export const LayoutContext = createContext<{
  config: LayoutConfig;
  setConfig: React.Dispatch<React.SetStateAction<LayoutConfig>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}>({
  config: {} as LayoutConfig,
  setConfig: {} as React.Dispatch<React.SetStateAction<LayoutConfig>>,
  sidebarCollapsed: false,
  setSidebarCollapsed: {} as React.Dispatch<React.SetStateAction<boolean>>,
});

function Layout(props: LayoutProps) {
  const { children } = props;
  const [sidebarCollapsedState, setSidebarCollapsed] = useState(true);
  const [config, setConfig] = useState(defaultConfig);
  const { navPinned } = config;
  const theme = useMantineTheme();
  const isSmallQuery = `(max-width: ${theme.breakpoints.sm})`;
  const isMobile = !!useMediaQuery(isSmallQuery);

  const collapsable = !navPinned || isMobile;

  const sidebarCollapsed = collapsable && sidebarCollapsedState;
  return (
    <LayoutContext.Provider
      value={{
        config,
        setConfig,
        sidebarCollapsed,
        setSidebarCollapsed,
      }}
    >
      <AppShell
        header={isMobile ? { height: { base: 50 } } : undefined}
        navbar={{
          collapsed: {
            mobile: sidebarCollapsed,
            desktop: sidebarCollapsed,
          },
          breakpoint: "sm",
          width: { base: 300 },
        }}
        className={style.appShell}
      >
        <AppShell.Main className={style.appShellMain}>{children}</AppShell.Main>
        <Sidebar
          isMobile={isMobile}
          collapsable={collapsable}
          collapse={() => {
            setSidebarCollapsed(true);
          }}
        />
        {isMobile && (
          <AppShell.Header p="sm">
            <div className={style.headerBar}>
              <Burger
                opened={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((c) => !c)}
                size="sm"
                mr="xl"
              />
              <div className={style.headerLogo}>
                <Logo imageSize={"1.5rem"} textSize={"xl"} />
              </div>
            </div>
          </AppShell.Header>
        )}
        {!isMobile && sidebarCollapsed && (
          <Button
            size="compact-md"
            variant="outline"
            pos={"fixed"}
            bottom={"1em"}
            left={"1em"}
            p={0}
            style={{ zIndex: 300 }}
            onClick={() => {
              setSidebarCollapsed(false);
            }}
          >
            <IconChevronRight />
          </Button>
        )}
      </AppShell>
    </LayoutContext.Provider>
  );
}

export default Layout;
