import { Route, Routes } from "react-router-dom";
import PlaygroundView from "./features/game/PlaygroundView";
import UserProfileView from "./features/users/UserProfileView";
import MatchFail from "./MatchFail";
import LoginView from "./features/auth/LoginView";
import PlayView from "./features/home/PlayView";
import CommunityView from "./features/users/CommunityView";
import SettingsView from "./features/settings/SettingsView";
import LobbyView from "./features/lobby/LobbyView";
import JoinLobbyView from "./features/lobby/JoinLobbyView";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="auth/login/*" element={<LoginView/>}/>
      <Route path="auth/link/*" element={<div />} />
      <Route path="view/:id" element={<PlaygroundView />} />
      <Route path="user-profile/*" element={<UserProfileView />} />
      <Route path="community/*" element={<CommunityView />} />
      <Route path="settings" element={<SettingsView />} />
      <Route path="settings/:tab" element={<SettingsView />} />
      <Route path="lobby/:lobbyId" element={<LobbyView />} />
      <Route path="lobby/:lobbyId/join" element={<JoinLobbyView />} />
      <Route path="lobby/by-peer-id/:peerId" element={<LobbyView />} />
      <Route path="lobby/by-peer-id/:peerId/join" element={<JoinLobbyView />} />
      <Route path="" element={<PlayView />} />
      <Route path="*" element={<MatchFail />} />
    </Routes>
  );
};

export default AppRoutes;
