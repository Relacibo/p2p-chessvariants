import { useGoogleOneTapLogin } from 'react-google-one-tap-login';
const GoogleAutoSignin = () => {

useGoogleOneTapLogin({
  onError: error => console.log(error),
  onSuccess: response => console.log(response),
  googleAccountConfigs: {
    client_id: import.meta.env.VITE_GOOGLE_IDENTITY_CLIENT_ID
  },
});
  return <></>;
};

export default GoogleAutoSignin;
