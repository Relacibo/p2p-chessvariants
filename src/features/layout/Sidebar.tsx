import { Button, AppShell, Stack, Group, Box } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconDeviceGamepad2,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { useSelector } from "react-redux";
import { selectIsGuest, selectUser } from "../auth/authSlice";
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
  const user = useSelector(selectUser);
  const isGuest = useSelector(selectIsGuest);

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
          <MainLink to={"dev"} icon={<IconUsers size="1.2rem" stroke={1.5} />}>
            Variant editor
          </MainLink>
          {user && !isGuest && (
            <MainLink to={"settings"} icon={<IconSettings size="1.2rem" stroke={1.5} />}>
              Settings
            </MainLink>
          )}
        </Stack>
      </AppShell.Section>
      <AppShell.Section mt="auto">
        <Stack gap={"sm"}>
          <DarkmodeSelector />
          {!isMobile && collapsable ? (
            <Group gap="xs" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Auth />
              </Box>
              <Button
                variant="outline"
                size="compact-md"
                p={0}
                onClick={collapse}
                style={{ flexShrink: 0 }}
              >
                <IconChevronLeft />
              </Button>
            </Group>
          ) : (
            <Auth />
          )}
        </Stack>
      </AppShell.Section>
    </AppShell.Navbar>
  );
};

export default Sidebar;
