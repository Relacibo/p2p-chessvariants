import {
  AppShell,
  Box,
  Burger,
  Button,
  Group,
  Header,
  Navbar,
  Stack,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons";
import { createContext, useState } from "react";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";
import PeerDisplay from "../peer/PeerDisplay";
import style from "./Layout.module.css";
import Logo from "./logo";
import MainLink from "./MainLink";

export type LayoutProps = {
  children: JSX.Element | JSX.Element[] | never[];
};

export type LayoutConfig = {
  sidebarAlwaysExtendedInLarge: boolean;
};

const defaultConfig: LayoutConfig = {
  sidebarAlwaysExtendedInLarge: false,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [config, setConfig] = useState(defaultConfig);
  let { sidebarAlwaysExtendedInLarge } = config;
  let theme = useMantineTheme();
  let isSmallQuery = `(max-width: ${theme.breakpoints.sm}px)`;
  let isSmall = useMediaQuery(isSmallQuery);

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
          (sidebarAlwaysExtendedInLarge && !isSmall) || !sidebarCollapsed ? (
            <Navbar p="sm" width={{ base: isSmall ? "100%" : 300 }}>
              {!isSmall && (
                <Navbar.Section className={style.navbarTitle}>
                  <Logo imageSize={"3rem"} />
                </Navbar.Section>
              )}
              <Navbar.Section grow mt="md">
                <Stack spacing="sm">
                  <MainLink to={"/"}>Join Lobby</MainLink>
                  <MainLink to={"game"}>Games</MainLink>
                </Stack>
              </Navbar.Section>
              <Navbar.Section mt="auto">
                <Group position="apart">
                  <PeerDisplay />
                  <DarkmodeSelector />
                </Group>
              </Navbar.Section>
              {!sidebarAlwaysExtendedInLarge && !isSmall && (
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
                      setSidebarCollapsed(true);
                    }}
                  >
                    <IconChevronLeft />
                  </Button>
                </div>
              )}
            </Navbar>
          ) : undefined
        }
        header={
          isSmall ? (
            <Header height={{ base: 50, md: 70 }} p="sm">
              <Group>
                <Burger
                  opened={!sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((c) => !c)}
                  size="sm"
                  mr="xl"
                />
                <Box
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  <Logo imageSize={"1.5rem"} textSize="lg" />
                </Box>
              </Group>
            </Header>
          ) : undefined
        }
      >
        {children}
        {!sidebarAlwaysExtendedInLarge && sidebarCollapsed && !isSmall && (
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
