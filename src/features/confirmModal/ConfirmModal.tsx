import { Box, Button, Group } from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";

type Props = {};

const ConfirmModal = ({}: Props) => {
  const form = useForm({
    initialValues: {},
  });
  return <Group grow><Button color="green" variant="outline">Yes</Button><Button color="red" variant="outline">No</Button></Group>;
};

export const openConfirmModal = (onConfirm: () => void) => {
  modals.open({
    // NOTE: Cannot use close button, cannot call update components from there
    withCloseButton: false,
    title: "Are you sure?",
    children: <ConfirmModal/>,
  });
};
