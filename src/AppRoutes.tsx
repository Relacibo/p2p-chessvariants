import { Route, Routes } from "react-router-dom";
import LoginWithGoogleView from "./features/auth/LoginWithGoogleView";
import GameListView from "./features/game/GameListView";
import PlaygroundView from "./features/game/PlaygroundView";
import UserProfileView from "./features/users/UserProfileView";
import HomeView from "./features/home/HomeView";
import MatchFail from "./MatchFail";
import EnginePlaygroundView from "./gamelogic/EnginePlaygroundView";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="auth/google/login" element={<LoginWithGoogleView />} />
      <Route path="game" element={<GameListView />}/>
      <Route path="game/playground" element={<EnginePlaygroundView/>} />
      <Route path="view/:id" element={<PlaygroundView />} />
      <Route path="user-profile/*" element={<UserProfileView />} />
      <Route path="" element={<HomeView />} />
      <Route path="*" element={<MatchFail />} />
    </Routes>
  );
};

export default AppRoutes;
