// ============================================================
// Auth Slice — login, register, profile state
// ============================================================
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authAPI } from "../../services/api";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("aura_user")) || null;
  } catch {
    localStorage.removeItem("aura_user");
    return null;
  }
}

function saveUser(user) {
  if (user) localStorage.setItem("aura_user", JSON.stringify(user));
}

// ---------------------------------------------------------------
// Async: Register
// ---------------------------------------------------------------
export const register = createAsyncThunk(
  "auth/register",
  async (data, { rejectWithValue }) => {
    try {
      const res = await authAPI.register(data);
      // Save token and user to localStorage so they persist on refresh
      localStorage.setItem("aura_token", res.data.token);
      localStorage.setItem("aura_user", JSON.stringify(res.data.user));
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Registration failed.");
    }
  }
);

// ---------------------------------------------------------------
// Async: Login
// ---------------------------------------------------------------
export const login = createAsyncThunk(
  "auth/login",
  async (data, { rejectWithValue }) => {
    try {
      const res = await authAPI.login(data);
      localStorage.setItem("aura_token", res.data.token);
      localStorage.setItem("aura_user", JSON.stringify(res.data.user));
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Login failed.");
    }
  }
);

// ---------------------------------------------------------------
// Async: Load profile on app start
// ---------------------------------------------------------------
export const loadProfile = createAsyncThunk("auth/loadProfile", async () => {
  const res = await authAPI.getProfile();
  return res.data;
});

// ---------------------------------------------------------------
// Slice
// ---------------------------------------------------------------
const authSlice = createSlice({
  name: "auth",
  initialState: {
    user:      getStoredUser(),
    token:     localStorage.getItem("aura_token") || null,
    isLoading: false,
    error:     null,
  },
  reducers: {
    // Logout: clear everything
    logout: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem("aura_token");
      localStorage.removeItem("aura_user");
    },
    // Update language preference locally
    setLanguage: (state, action) => {
      if (state.user) {
        state.user.language = action.payload;
        saveUser(state.user);
      }
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      // Register
      .addCase(register.pending,   (state) => { state.isLoading = true; state.error = null; })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        saveUser(action.payload.user);
      })
      .addCase(register.rejected,  (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Login
      .addCase(login.pending,   (state) => { state.isLoading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        saveUser(action.payload.user);
      })
      .addCase(login.rejected,  (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Load profile
      .addCase(loadProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        saveUser(action.payload);
      });
  },
});

export const { logout, setLanguage, clearError } = authSlice.actions;
export default authSlice.reducer;
