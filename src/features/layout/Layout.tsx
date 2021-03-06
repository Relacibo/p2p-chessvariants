import { Anchor, AppShell, Button, Group, Navbar, Stack } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons";
import React, { createContext, useState } from "react";
import { Link } from "react-router-dom";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";
import PeerDisplay from "../peer/PeerDisplay";
import style from "./Layout.module.css";

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
      <AppShell
        padding={0}
        sx={(theme) => ({
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[6]
              : theme.colors.gray[0],
          color:
            theme.colorScheme === "dark" ? theme.colors.dark[0] : theme.black,
          height: "100vh",
        })}
        navbar={
          !sidebarCollapsed ? (
            <Navbar
              p="sm"
              width={{ base: 300 }}
              style={
                sidebarIsOverlay
                  ? {
                      position: "absolute",
                      right: 0,
                    }
                  : {
                      position: "relative",
                    }
              }
            >
              {sidebarCollapsable && (
                <div
                  style={{
                    zIndex: 30,
                    position: "absolute",
                    right: ".5em",
                    bottom: ".5em",
                  }}
                >
                  <Button
                    compact
                    variant="outline"
                    style={{
                      padding: 0,
                      width: "small",
                    }}
                    onClick={() => {
                      apply({ sidebarCollapsed: true });
                    }}
                  >
                    <IconChevronLeft />
                  </Button>
                </div>
              )}
              <Navbar.Section className={style.navbarTitle}>
                pawn-connect.org
              </Navbar.Section>
              <Navbar.Section>
                <Stack spacing="sm">
                  <Anchor size="xl" component={Link} to={"/"}>
                    Join Lobby
                  </Anchor>
                  <Anchor size="xl" component={Link} to={"game"}>
                    Games
                  </Anchor>
                </Stack>
              </Navbar.Section>
              <Navbar.Section mt="auto">
                <Group position="apart">
                  <PeerDisplay />
                  <DarkmodeSelector />
                </Group>
              </Navbar.Section>
            </Navbar>
          ) : undefined
        }
      >
        {children}
        {sidebarCollapsed && (
          <Button
            compact
            variant="outline"
            style={{
              position: "absolute",
              bottom: "1em",
              left: "1em",
              padding: 0,
            }}
            onClick={() => {
              apply({ sidebarCollapsed: false });
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
