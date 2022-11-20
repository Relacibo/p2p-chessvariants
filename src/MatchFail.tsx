import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { showError } from "./util/notification";

const MatchFail = () => {
  useEffect(() => {
    showError("This path does not exist!");
  });
  return <Navigate to="/"></Navigate>;
};

export default MatchFail;
