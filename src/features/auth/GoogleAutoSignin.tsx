import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useGoogleOneTapLogin } from "@react-oauth/google";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect, useState } from "react";
import { useSignInWithGoogleMutation } from "../../api/api";
import { LoginResponse } from "../../api/types/google";
import { useDispatch } from "../../app/hooks";
import { login } from "./authSlice";
import { default as SignonForm, default as SignonModal } from "./SignonForm";
const GoogleAutoSignin = () => {
  const dispatch = useDispatch();
  const [opened, { open, close }] = useDisclosure(false);
  let [updatePost, result] = useSignInWithGoogleMutation();
  let [credential, setCredential] = useState<string | null>(null);

  useEffect(() => {
    if (result.status === QueryStatus.fulfilled) {
      let { data } = result;
      if (data.result === "success") {
        dispatch(login(data));
      } else {
        let setResult = (result: LoginResponse) => {};
        modals.open({
          title: "Please choose a unique username!",
          children: (
            <SignonForm
              credential={credential!}
              setResult={setResult}
            ></SignonForm>
          ),
        });
      }
    }
  }, [result, credential]);

  useGoogleOneTapLogin({
    onSuccess: (response) => {
      if (!response.credential) {
        return;
      }
      let payload = {
        credential: response.credential,
      };
      updatePost(payload);
    },
    onError: () => {
      console.log("Login Failed");
    },
  });
  return <></>;
};

export default GoogleAutoSignin;
