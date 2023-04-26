import { Group } from "@mantine/core";
import { IconExclamationCircle } from "@tabler/icons";
import { PropsWithChildren } from "react";

type Props = PropsWithChildren & {};

const ErrorDisplay = ({ children }: Props) => {
  return (
    <Group>
      <IconExclamationCircle color="red" />
      {children}
    </Group>
  );
};

export default ErrorDisplay;
