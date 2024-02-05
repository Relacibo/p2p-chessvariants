import {
  AppShell,
  Box,
  Burger,
  Button,
  Container,
  Group,
  MantineTheme,
  Paper,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";
import { createContext, useState } from "react";
import Logo from "./logo";
import Sidebar from "./Sidebar";
import style from "./Layout.module.css";

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
        header={{ height: { base: 50, md: 70, lg: ".05px"} }}
        navbar={{
          collapsed: {
            mobile: sidebarCollapsed,
            desktop: !sidebarAlwaysExtendedInLarge && sidebarCollapsed,
          },
          breakpoint: "sm",
          width: { base: isSmall ? "100%" : 300 },
        }}
        className={style.appShell}
      >
        <AppShell.Main>{children}</AppShell.Main>
        <Sidebar
          sidebarAlwaysExtendedInLarge={sidebarAlwaysExtendedInLarge}
          collapse={() => {
            setSidebarCollapsed(true);
          }}
        />
        {isSmall && (
          <AppShell.Header p="sm">
            <Group>
              <Burger
                opened={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((c) => !c)}
                size="sm"
                mr="xl"
              />
              <Box
                pos={"absolute"}
                left={"50%"}
                style={{
                  transform: "translateX(-50%)",
                }}
              >
                <Logo imageSize={"1.5rem"} textSize={"xl"} />
              </Box>
            </Group>
          </AppShell.Header>
        )}
        {(!sidebarAlwaysExtendedInLarge || isSmall) && sidebarCollapsed && (
          <Button
            size="compact-md"
            variant="outline"
            pos={"absolute"}
            bottom={"1em"}
            left={"1em"}
            p={0}
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
