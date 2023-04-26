import { Button, Navbar, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronLeft } from "@tabler/icons";
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
          <MainLink to={"user-profile"}>User profile</MainLink>
        </Stack>
      </Navbar.Section>
      <Navbar.Section mt="auto">
        <Stack spacing={"sm"}> 
          <PeerDisplay />
          <DarkmodeSelector />
          <Auth />
        </Stack>
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
              collapse();
            }}
          >
            <IconChevronLeft />
          </Button>
        </div>
      )}
    </Navbar>
  );
};

export default Sidebar;
