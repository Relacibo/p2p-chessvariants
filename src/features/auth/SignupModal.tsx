import {
  Box,
  Button,
  Group,
  LoadingOverlay,
  Stack,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect, useState } from "react";
import { useSignUpWithGoogleMutation } from "../../api/api";
import { User } from "../../api/types/auth/users";

export type SignupResult =
  | {
      result: "success";
      token: string;
      user: User;
    }
  | {
      result: "canceled";
    };

type Props = {
  credential: string;
  usernameSuggestion: string;
  setResult: (response: SignupResult) => void;
};

const SignupModal = ({ credential, setResult, usernameSuggestion }: Props) => {
  let [updatePost, result] = useSignUpWithGoogleMutation();
  let [submitted, setSubmitted] = useState(false);
  const form = useForm({
    initialValues: {
      username: usernameSuggestion,
    },
  });
  useEffect(() => {
    if (result.status === QueryStatus.fulfilled) {
      let { data } = result;
      if (data.result == "success") {
        setResult(data);
        modals.closeAll();
        return;
      }
      form.values.username = data.usernameSuggestion;
      form.setErrors({ username: "Already taken!" });
    } else if (result.status == QueryStatus.rejected) {
      form.setErrors({ username: "Unexpected error!" });
    }
    setSubmitted(false);
  }, [result]);
  return (
    <Box>
      <LoadingOverlay visible={submitted} />
      {!submitted ? (
        <form
          onSubmit={() => {
            setSubmitted(true);
            let username = form.values.username;
            updatePost({ credential, username });
          }}
        >
          <Stack>
            <TextInput {...form.getInputProps("username")} />
            <Group ml="auto">
              <Button color="red"
                onClick={() =>
                  {
                  setResult({
                    result: "canceled",
                  });
                  modals.closeAll()
                }
                }
              >
                Cancel
              </Button>
              <Button color="green" type="submit">Submit</Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <></>
      )}
    </Box>
  );
};

export const openSignupModal = (
  credential: string,
  usernameSuggestion: string,
  setResult: (response: SignupResult) => void
) => {
  modals.open({
    // NOTE: Cannot use close button, cannot call update components from there
    withCloseButton: false,
    title: "Please choose a unique username!",
    children: (
      <SignupModal
        usernameSuggestion={usernameSuggestion}
        credential={credential}
        setResult={setResult}
      ></SignupModal>
    ),
  });
};

export default SignupModal;
