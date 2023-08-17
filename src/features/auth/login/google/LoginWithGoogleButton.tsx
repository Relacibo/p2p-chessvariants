import { Box } from "@mantine/core";
import { GoogleLogin } from "@react-oauth/google";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { SignupResult, openSignupModal } from "../../SignupModal";
import { login } from "../../authSlice";
import { useSignInWithGoogleMutation } from "../../../../api/api";

const LoginWithGoogleButton = () => {
  const dispatch = useDispatch();
  const [updatePost, signinResult] = useSignInWithGoogleMutation();
  const [credential, setCredential] = useState<string | null>(null);
  const [signupResult, setSignupResult] = useState<SignupResult | null>();
  // autoSelect doesn't seem to work: https://github.com/MomenSherif/react-oauth/issues/210
  // const loggedOutCause = useSelector(selectLoggedOutCause);
  // const autoSelect = loggedOutCause === "invalid-token";

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
    <Box style={{ width: 200 }}>
      <GoogleLogin
        onSuccess={(response) => {
          let { credential } = response;
          if (!credential) {
            return;
          }
          // Get's activated, if the user clicks on the one tap
          setCredential(credential);
          updatePost({ credential });
        }}
        onError={() => {
          console.log("Login Failed");
        }}
        // autoSelect doesn't seem to work: https://github.com/MomenSherif/react-oauth/issues/210
        // auto_select={autoSelect}
        // useOneTap={autoSelect}
      />
    </Box>
  );
};

export default LoginWithGoogleButton;
