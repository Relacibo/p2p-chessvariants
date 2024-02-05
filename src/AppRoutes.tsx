import { Route, Routes } from "react-router-dom";
import GameListView from "./features/game/GameListView";
import PlaygroundView from "./features/game/PlaygroundView";
import UserProfileView from "./features/users/UserProfileView";
import HomeView from "./features/home/HomeView";
import MatchFail from "./MatchFail";
import EnginePlaygroundView from "./gamelogic/EnginePlaygroundView";
import LoginView from "./features/auth/LoginView";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="auth/login/*" element={<LoginView/>}/>
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
