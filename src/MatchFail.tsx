import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { handleError } from "./util/notification";

const MatchFail = () => {
  useEffect(() => {
    handleError("This path does not exist!");
  });
  return <Navigate to="/"></Navigate>;
};

export default MatchFail;
