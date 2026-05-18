import { Route, Routes } from "react-router-dom";
import PlaygroundView from "./features/game/PlaygroundView";
import UserProfileView from "./features/users/UserProfileView";
import MatchFail from "./MatchFail";
import LoginView from "./features/auth/LoginView";
import PlayView from "./features/home/PlayView";
import CommunityView from "./features/users/CommunityView";
import ConnectionsView from "./features/account/ConnectionsView";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="auth/login/*" element={<LoginView/>}/>
      <Route path="view/:id" element={<PlaygroundView />} />
      <Route path="user-profile/*" element={<UserProfileView />} />
      <Route path="community/*" element={<CommunityView />} />
      <Route path="account/connections" element={<ConnectionsView />} />
      <Route path="" element={<PlayView />} />
      <Route path="*" element={<MatchFail />} />
    </Routes>
  );
};

export default AppRoutes;
