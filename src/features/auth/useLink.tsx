import { useLinkProviderMutation } from "../../api/api";
import { LinkPayload, OauthData } from "../../api/types/auth/auth";

const useLinkProvider = () => {
  const [linkProvider] = useLinkProviderMutation();

  const link = async (data: OauthData) => {
    await linkProvider(new LinkPayload(data)).unwrap();
  };

  return [link] as const;
};

export default useLinkProvider;
