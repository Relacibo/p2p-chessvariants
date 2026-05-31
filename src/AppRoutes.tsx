import { Route, Routes, Navigate } from "react-router-dom";
import UserProfileView from "./features/users/UserProfileView";
import MatchFail from "./MatchFail";
import LoginView from "./features/auth/LoginView";
import PlayView from "./features/home/PlayView";
import CommunityView from "./features/users/CommunityView";
import SettingsView from "./features/settings/SettingsView";
import LobbyView from "./features/lobby/LobbyView";
import DevBoardView from "./features/dev-board/DevBoardView";
import { useSelector } from "react-redux";
import { selectIsGuest } from "./features/auth/authSlice";

const AppRoutes = () => {
  const isGuest = useSelector(selectIsGuest);
  return (
    <Routes>
      <Route path="auth/login/*" element={<LoginView/>}/>
      <Route path="auth/link/*" element={<div />} />

      <Route path="user-profile/*" element={isGuest ? <Navigate to="/" replace /> : <UserProfileView />} />
      <Route path="community/*" element={<CommunityView />} />
      <Route path="settings" element={isGuest ? <Navigate to="/" replace /> : <SettingsView />} />
      <Route path="settings/:tab" element={isGuest ? <Navigate to="/" replace /> : <SettingsView />} />
      <Route path="lobby/:lobbyId" element={<LobbyView />} />
      <Route path="lobby/by-peer-id/:peerId" element={<LobbyView />} />
      <Route path="dev/:scriptUrl?" element={<DevBoardView />} />
      <Route path="" element={<PlayView />} />
      <Route path="*" element={<MatchFail />} />
    </Routes>
  );
};

export default AppRoutes;
