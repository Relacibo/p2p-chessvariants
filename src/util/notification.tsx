import { Box } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconCircleX } from "@tabler/icons";

export function showError(message: string) {
  showNotification({
    message: <Box>{message}</Box>,
    color: "red",
    icon: <IconCircleX />,
  });
}
