import { useDispatch } from "react-redux";
import { useSignInMutation } from "../../api/userApi";
import { OauthData } from "../../api/types/auth/auth";
import { useState } from "react";
import SignupModal, { SignupResult } from "./SignupModal";
import React, { useEffect } from "react";
import { QueryStatus } from "@reduxjs/toolkit/query";
import { login } from "./authSlice";
import { modals } from "@mantine/modals";

const useLogin = () => {
  const dispatch = useDispatch();
  const [signin, signinResult] = useSignInMutation();
  const [signupModalResult, setSignupModalResult] =
    useState<SignupResult | null>(null);

  const [oauthData, setOauthData] = useState<OauthData | null>(null);

  useEffect(() => {
    if (signinResult.status === QueryStatus.fulfilled) {
      // If the BE login endpoint responds
      const data = signinResult.data;
      if (!data) return;
      if (data.result === "success") {
        dispatch(login(data));
        return;
      }
      const { usernameSuggestion } = data;

      modals.open({
        // NOTE: Cannot use close button, cannot call update components from there
        title: "Please choose a unique username!",
        children: (
          <SignupModal
            usernameSuggestion={usernameSuggestion}
            oauthData={oauthData!}
            setResult={setSignupModalResult}
          ></SignupModal>
        ),
      });
    } else if (signinResult.status === QueryStatus.rejected) {
    }
  }, [signinResult]);

  useEffect(() => {
    if (!signupModalResult) {
      return;
    }
    if (signupModalResult.result === "success") {
      dispatch(login(signupModalResult));
      return;
    }
    // canceled
    signinResult.reset();
  }, [signupModalResult]);

  const l = (data: OauthData) => {
    setOauthData(data);
    signin({ oauthData: data });
  };

  return [l];
};

export default useLogin;
