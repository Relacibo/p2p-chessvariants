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
import { User } from "../../api/types/user/users";
import { useSignUpMutation } from "../../api/api";
import { OauthData } from "../../api/types/auth/auth";
import { showError } from "../../util/notification";

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
  oauthData: OauthData;
  usernameSuggestion: string;
  setResult: (response: SignupResult) => void;
};

const SignupModal = ({ oauthData, setResult, usernameSuggestion }: Props) => {
  let [signup, signupResult] = useSignUpMutation();
  let [submitted, setSubmitted] = useState(false);
  const form = useForm({
    initialValues: {
      username: usernameSuggestion,
    },
  });
  useEffect(() => {
    if (signupResult.status === QueryStatus.fulfilled) {
      let { data } = signupResult;
      if (data.result == "success") {
        setResult(data);
        modals.closeAll();
        return;
      }
      const { usernameSuggestion } = data;
      form.values.username = usernameSuggestion;
      form.setErrors({ username: "Already taken!" });
    } else if (signupResult.status == QueryStatus.rejected) {
      showError("Unexpected error!");
    }
    setSubmitted(false);
  }, [signupResult]);
  return (
    <Box>
      <LoadingOverlay visible={submitted} />
      {!submitted ? (
        <form
          onSubmit={() => {
            setSubmitted(true);
            let username = form.values.username;
            signup({ oauthData, username });
          }}
        >
          <Stack>
            <TextInput {...form.getInputProps("username")} />
            <Group ml="auto">
              <Button
                color="red"
                onClick={() => {
                  setResult({
                    result: "canceled",
                  });
                  modals.closeAll();
                }}
              >
                Cancel
              </Button>
              <Button color="green" type="submit">
                Submit
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <></>
      )}
    </Box>
  );
};

export default SignupModal;
