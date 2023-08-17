import { CredentialResponse, useGoogleOneTapLogin } from "@react-oauth/google";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect, useState } from "react";
import { useSignInWithGoogleMutation } from "../../api/api";
import { useDispatch, useSelector } from "../../app/hooks";
import { login, selectLoggedOutCause } from "./authSlice";
import { openSignupModal, SignupResult } from "./SignupModal";
const GoogleAutoSignin = () => {
  const dispatch = useDispatch();
  const [signin, signinResult] = useSignInWithGoogleMutation();
  const [credential, setCredential] = useState<string | null>(null);
  const [signupResult, setSignupResult] = useState<SignupResult | null>();

  useGoogleOneTapLogin({
    onSuccess: (response) => {
      let { credential } = response;
      if (!credential) {
        return;
      }
      // Get's activated, if the user clicks on the one tap
      setCredential(credential);
      signin({
        credential,
      });
    },
    onError: () => {
      console.error("Login Failed");
    },
  });

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
      // TODO
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
  return <></>;
};

export default GoogleAutoSignin;
