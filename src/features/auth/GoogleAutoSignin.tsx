const GoogleAutoSignin = () => {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: `<div
  id="g_id_onload"
  data-client_id=${process.env.REACT_APP_GOOGLE_IDENTITY_CLIENT_ID}
  data-context="signin"
  data-login_uri=${process.env.REACT_APP_API_ENDPOINT}/oauth/google
  data-auto_select="true"
  data-prompt_parent_id="g_id_onload"
  style="position: absolute; bottom: 260px; right: 400px;
      width: 0; height: 0; z-index: 1001;">
</div>`,
      }}
    ></div>
  );
};

export default GoogleAutoSignin;
