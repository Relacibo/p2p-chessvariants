import { Box } from "@mantine/core";
import { GoogleLogin } from "@react-oauth/google";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useSignInWithGoogleMutation } from "../../api/api";
import useSwitchView from "../layout/hooks";
import { login } from "./authSlice";
import { openSignupModal, SignupResult } from "./SignupModal";

type Props = {};
const LoginWithGoogleView = ({}: Props) => {
  const dispatch = useDispatch();
  useSwitchView(() => ({ sidebarAlwaysExtendedInLarge: true }));

  let [updatePost, signinResult] = useSignInWithGoogleMutation();
  let [credential, setCredential] = useState<string | null>(null);
  let [signupResult, setSignupResult] = useState<SignupResult | null>();

  useEffect(() => {
    if (signinResult.status === QueryStatus.fulfilled) {
      // If the BE login endpoint responds
      let { data } = signinResult;
      if (data.result === "success") {
        dispatch(login(data));
        return;
      }
      let { usernameSuggestion } = data;
      openSignupModal(credential!, usernameSuggestion, setSignupResult);
    } else if (signinResult.status === QueryStatus.rejected) {
    }
  }, [signinResult]);

  useEffect(() => {
    if (!signupResult) {
      return;
    }
    if (signupResult.result === "success") {
      dispatch(login(signupResult));
      return;
    }
    // canceled
    signinResult.reset();
  }, [signupResult]);
  return (
    <Box style={{width: 200}}><GoogleLogin
      onSuccess={(response) => {
        let { credential } = response;
        if (!credential) {
          return;
        }
        // Get's activated, if the user clicks on the one tap
        setCredential(credential);
        updatePost({
          credential,
        });
      }}
      onError={() => {
        console.log("Login Failed");
      }}
    /></Box>
  );
};
export default LoginWithGoogleView;
