import { useGoogleOneTapLogin } from "@react-oauth/google";
import { QueryStatus } from "@reduxjs/toolkit/dist/query";
import { useSignInWithGoogleMutation } from "../../api/api";
import { useDispatch } from "../../app/hooks";
import { login } from "./authSlice";
const GoogleAutoSignin = () => {
  const dispatch = useDispatch();
  let [updatePost, result] = useSignInWithGoogleMutation();
  if (result.status == QueryStatus.fulfilled) {
    let { token, user } = result.data;
    dispatch(login(token));
  }

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
