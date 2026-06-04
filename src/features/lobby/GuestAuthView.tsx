import {
  Button,
  Divider,
  Paper,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useGuestLoginMutation } from "../../api/api";
import { useDispatch } from "../../app/hooks";
import { login } from "../auth/authSlice";

export type GuestAuthViewProps = {
  title: string;
  guestLabel: string;
  dividerLabel: string;
  /** Called after a successful guest login (token + user already in store). */
  onSuccess?: () => void;
};

/** Shared guest-login form used by both LobbyView (join) and CreateLobbyView (create). */
export default function GuestAuthView({
  title,
  guestLabel,
  dividerLabel,
  onSuccess,
}: GuestAuthViewProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [guestLogin, { isLoading: isGuestLoggingIn }] =
    useGuestLoginMutation();

  const guestForm = useForm({
    initialValues: { displayName: "" },
    validate: {
      displayName: (v) =>
        v.trim().length > 0 ? null : "Display name is required",
    },
  });

  const loginRedirect = `/auth/login?redirect=${encodeURIComponent(location.pathname)}`;

  const handleGuestLogin = async (values: { displayName: string }) => {
    try {
      const res = await guestLogin(values).unwrap();
      dispatch(login({ token: res.token, user: res.user }));
      onSuccess?.();
      notifications.show({
        title: `Joined as ${values.displayName}`,
        message: "Connecting to lobby...",
        color: "blue",
      });
    } catch (e: any) {
      notifications.show({
        title: "Error",
        message: e.message || "Failed to join as guest",
        color: "red",
      });
    }
  };

  return (
    <Paper p="md" maw={480} mx="auto">
      <Stack>
        <Title order={3}>{title}</Title>
        <Button variant="default" onClick={() => navigate(loginRedirect)}>
          Login with account
        </Button>
        <Divider label={dividerLabel} labelPosition="center" />
        <form onSubmit={guestForm.onSubmit(handleGuestLogin)}>
          <Stack>
            <TextInput
              label="Display Name"
              placeholder="Guest Player"
              {...guestForm.getInputProps("displayName")}
            />
            <Button type="submit" loading={isGuestLoggingIn}>
              {guestLabel}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  );
}
