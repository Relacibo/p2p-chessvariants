import { showNotification } from "@mantine/notifications";
import { NotificationsContextProps } from "@mantine/notifications/lib/types";
import { IconCircleX } from "@tabler/icons";

export function showError(
  message: string
) {
  showNotification({
    message,
    color: "red",
    icon: <IconCircleX />,
  });
}
