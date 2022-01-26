import { useNotifications } from "@mantine/notifications";
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { showError } from "./util/notification";

const MatchFail = () => {
  const notifications = useNotifications();
  useEffect(() => {
    showError(notifications, "This path does not exist!");
  });
  return <Navigate to="/"></Navigate>;
};

export default MatchFail;
