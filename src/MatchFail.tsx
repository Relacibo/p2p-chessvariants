import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Navigate } from "react-router-dom";

const MatchFail = () => {
  useEffect(() => {
    toast.error(`This path does not exist!`);
  });
  return <Navigate to="/"></Navigate>;
};

export default MatchFail;
