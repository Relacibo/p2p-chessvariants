import { NotificationsContextProps } from "@mantine/notifications/lib/types";
import { IconCircleX } from "@tabler/icons";

export function showError(
  notifications: NotificationsContextProps,
  message: string
) {
  notifications.showNotification({
    message,
    color: "red",
    icon: <IconCircleX />,
  });
}
