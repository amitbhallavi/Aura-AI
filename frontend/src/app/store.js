// ============================================================
// Redux Store — central state for the entire app
// ============================================================
import { configureStore } from "@reduxjs/toolkit";
import authReducer  from "../features/auth/authSlice";
import chatReducer  from "../features/chat/chatSlice";
import callReducer  from "../features/calls/callSlice";
import taskReducer  from "../features/tasks/taskSlice";
import phoneConfigReducer from "../features/phoneConfig/phoneConfigSlice";
import notificationReducer from "../features/notifications/notificationSlice";

export const store = configureStore({
  reducer: {
    auth:  authReducer,   // Login state, user profile
    chat:  chatReducer,   // AI chat messages, typing state
    calls: callReducer,   // Scheduled calls list
    tasks: taskReducer,   // Tasks and reminders
    phoneConfig: phoneConfigReducer, // User Twilio phone numbers
    notifications: notificationReducer,
  },
});
