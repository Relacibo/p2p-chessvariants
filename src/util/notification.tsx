import { Box } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconCircleX } from "@tabler/icons-react";
import { CvJsError } from "chessvariant-engine";

export function handleError(error: unknown) {
  if (typeof error === "string") {
    handleErrorMessage(error);
    return;
  }
  if (error instanceof CvJsError) {
    const { free, name, message, stack } = error;
    showNotification({
      title: name,
      message: <Box>{message}</Box>,
      color: "red",
      icon: <IconCircleX />,
    });
    console.error(name);
    console.error(message);
    if (stack) {
      console.error(stack);
    }
    free();
  }
}

export function handleErrorMessage(message: string) {
  showNotification({
    message: <Box>{message}</Box>,
    color: "red",
    icon: <IconCircleX />,
  });
  console.error(message);
}
