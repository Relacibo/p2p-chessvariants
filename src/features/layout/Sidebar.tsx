import { Button, AppShell, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronLeft } from "@tabler/icons-react";
import Auth from "../auth/Auth";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";
import PeerDisplay from "../peer/PeerDisplay";
import Logo from "./logo";
import MainLink from "./MainLink";
import style from "./Sidebar.module.css";

type Props = {
  sidebarAlwaysExtendedInLarge: boolean;
  collapse: () => void;
};

const Sidebar = ({ sidebarAlwaysExtendedInLarge, collapse }: Props) => {
  let theme = useMantineTheme();
  let isSmallQuery = `(max-width: ${theme.breakpoints.sm}px)`;
  let isSmall = useMediaQuery(isSmallQuery);
  return (
    <AppShell.Navbar p="sm" className={style.sidebar}>
      {!isSmall && (
        <AppShell.Section className={style.navbarTitle}>
          <Logo imageSize={"3rem"} />
        </AppShell.Section>
      )}
      <AppShell.Section grow mt="md">
        <Stack gap="sm">
          <MainLink to={"/"}>Join Lobby</MainLink>
          <MainLink to={"game"}>Games</MainLink>
          <MainLink to={"user-profile"}>User profile</MainLink>
        </Stack>
      </AppShell.Section>
      <AppShell.Section mt="auto">
        <Stack gap={"sm"}>
          <PeerDisplay />
          <DarkmodeSelector />
          <Auth />
        </Stack>
      </AppShell.Section>
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
            variant="outline"
            size="compact-md"
            style={{
              padding: 0,
              width: "small",
            }}
            onClick={() => {
              collapse();
            }}
          >
            <IconChevronLeft />
          </Button>
        </div>
      )}
    </AppShell.Navbar>
  );
};

export default Sidebar;
