import { TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect } from "react";
import { useSignUpWithGoogleMutation } from "../../api/api";
import { LoginResponse } from "../../api/types/google";

type Props = {
  credential: string;
  setResult: (response: LoginResponse) => void;
};

const SignonModal = ({ credential, setResult }: Props) => {
  let [updatePost, result] = useSignUpWithGoogleMutation();
  const form = useForm({
    initialValues: {
      username: "",
    },
  });
  useEffect(() => {
    if (result.status === QueryStatus.fulfilled) {
      setResult(result.data);
      modals.closeAll();
    }
  }, [result]);
  return (
    <form
      onSubmit={async () => {
        let username = form.values.username;
        await updatePost({ credential, username });
      }}
    >
      <TextInput
        label="username"
        {...form.getInputProps("username")}
      ></TextInput>
    </form>
  );
};

export default SignonModal;
