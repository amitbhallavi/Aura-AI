import { createSlice } from "@reduxjs/toolkit";

const STORAGE_KEY = "aura_notifications";
const MAX_NOTIFICATIONS = 30;

function loadStoredNotifications() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.slice(0, MAX_NOTIFICATIONS) : [];
  } catch {
    return [];
  }
}

function persist(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)));
}

function unreadCount(items) {
  return items.filter((item) => !item.read).length;
}

const initialItems = loadStoredNotifications();

const notificationSlice = createSlice({
  name: "notifications",
  initialState: {
    items: initialItems,
    unreadCount: unreadCount(initialItems),
  },
  reducers: {
    addNotification: (state, action) => {
      const notification = {
        id: action.payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: action.payload.type || "info",
        title: action.payload.title || "Notification",
        message: action.payload.message || "",
        data: action.payload.data || {},
        createdAt: action.payload.createdAt || new Date().toISOString(),
        read: false,
      };

      state.items = [notification, ...state.items.filter((item) => item.id !== notification.id)].slice(0, MAX_NOTIFICATIONS);
      state.unreadCount = unreadCount(state.items);
      persist(state.items);
    },
    markAllRead: (state) => {
      state.items = state.items.map((item) => ({ ...item, read: true }));
      state.unreadCount = 0;
      persist(state.items);
    },
    clearNotifications: (state) => {
      state.items = [];
      state.unreadCount = 0;
      persist(state.items);
    },
  },
});

export const { addNotification, markAllRead, clearNotifications } = notificationSlice.actions;
export default notificationSlice.reducer;
