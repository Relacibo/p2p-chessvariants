import { Box } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconCircleX } from "@tabler/icons-react";

export function handleError(error: unknown) {
  if (typeof error === "string") {
    handleErrorMessage(error);
    return;
  }
  if (typeof error === "object") {
  }
  switch (typeof error) {
    case "string":
      handleErrorMessage(error);
      return;
    case "object":
      handleErrorObject(error);
      return;
  }
}

function handleErrorMessage(message: string) {
  showNotification({
    message: <Box>{message}</Box>,
    color: "red",
    icon: <IconCircleX />,
  });
  console.error(message);
}

function handleErrorObject(err: unknown) {
  console.error(`An error happened!: ${JSON.stringify(err)}`);
  const { free, message, name } = err as any;
  if (message) {
    showNotification({
      title: name,
      message: <Box>{message}</Box>,
      color: "red",
      icon: <IconCircleX />,
    });
  }
  if (free) {
    free();
  }
}
