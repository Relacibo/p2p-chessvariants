import { Button, AppShell, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconDeviceGamepad2,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { useSelector } from "react-redux";
import { selectUser } from "../auth/authSlice";
import Auth from "../auth/Auth";
import DarkmodeSelector from "../darkmode/DarkmodeSelector";
import Logo from "./logo";
import MainLink from "./MainLink";
import style from "./Sidebar.module.css";

type Props = {
  isMobile: boolean;
  collapsable: boolean;
  collapse: () => void;
};

const Sidebar = ({ isMobile, collapsable, collapse }: Props) => {
  let theme = useMantineTheme();
  const user = useSelector(selectUser);

  return (
    <AppShell.Navbar p="sm" className={style.sidebar}>
      {!isMobile && (
        <AppShell.Section className={style.navbarTitle}>
          <Logo imageSize={"3rem"} />
        </AppShell.Section>
      )}
      <AppShell.Section grow mt="md">
        <Stack gap="sm">
          <MainLink to={""} icon={<IconDeviceGamepad2 size="1.2rem" stroke={1.5} />}>
            Play
          </MainLink>
          <MainLink to={"community"} icon={<IconUsers size="1.2rem" stroke={1.5} />}>
            Community
          </MainLink>
          {user && (
            <MainLink to={"settings"} icon={<IconSettings size="1.2rem" stroke={1.5} />}>
              Einstellungen
            </MainLink>
          )}
        </Stack>
      </AppShell.Section>
      <AppShell.Section mt="auto">
        <Stack gap={"sm"}>
          <DarkmodeSelector />
          <Auth />
        </Stack>
      </AppShell.Section>
      {!isMobile && collapsable && (
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
