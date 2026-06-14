import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addNotification } from "../features/notifications/notificationSlice";
import { connectNotificationSocket, disconnectNotificationSocket } from "../services/socket";

export default function useSocketNotifications() {
  const dispatch = useDispatch();
  const { token } = useSelector((s) => s.auth);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!token) {
      disconnectNotificationSocket();
      return undefined;
    }

    const socket = connectNotificationSocket(token);

    function handleNotification(notification) {
      dispatch(addNotification(notification));
      setToast(notification);
    }

    socket.on("notification:new", handleNotification);

    return () => {
      socket.off("notification:new", handleNotification);
      disconnectNotificationSocket();
    };
  }, [dispatch, token]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return {
    toast,
    dismissToast: () => setToast(null),
  };
}
