import { useLinkProviderMutation } from "../../api/api";
import { LinkPayload, OauthData } from "../../api/types/auth/auth";

const useLinkProvider = () => {
  const [linkProvider] = useLinkProviderMutation();

  const link = async (data: OauthData) => {
    await linkProvider({ oauthData: data }).unwrap();
  };

  return [link] as const;
};

export default useLinkProvider;
