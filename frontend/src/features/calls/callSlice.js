// ============================================================
// Calls Slice — scheduled calls state
// ============================================================
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { callsAPI } from "../../services/api";

const FETCH_TTL_MS = 15 * 1000;

export const fetchCalls = createAsyncThunk(
  "calls/fetchAll",
  async (options = {}, { rejectWithValue }) => {
    try {
      const res = await callsAPI.getAllCalls(options.params, { force: Boolean(options.force) });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Failed to load calls.");
    }
  },
  {
    condition: (options = {}, { getState }) => {
      const state = getState().calls;
      if (state.isLoading) return false;
      if (options.force) return true;
      if (!state.lastFetchedAt) return true;
      return Date.now() - state.lastFetchedAt > FETCH_TTL_MS;
    },
  }
);

export const scheduleCall = createAsyncThunk(
  "calls/schedule",
  async (data, { rejectWithValue }) => {
    try {
      const res = await callsAPI.scheduleCall(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Failed to schedule call.");
    }
  }
);

export const cancelCall = createAsyncThunk("calls/cancel", async (id) => {
  await callsAPI.cancelCall(id);
  return id;
});

const callSlice = createSlice({
  name: "calls",
  initialState: {
    list:      [],
    isLoading: false,
    error:     null,
    lastFetchedAt: null,
  },
  reducers: {
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCalls.pending,   (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchCalls.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchCalls.rejected, (state, action) => {
        state.isLoading = false;
        if (action.payload) state.error = action.payload;
      })
      .addCase(scheduleCall.fulfilled, (state, action) => {
        state.list.unshift(action.payload); // Add new call to top of list
        state.lastFetchedAt = Date.now();
      })
      .addCase(scheduleCall.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(cancelCall.fulfilled, (state, action) => {
        // Update status to cancelled in local state
        const call = state.list.find((c) => c.id === action.payload);
        if (call) call.status = "cancelled";
      });
  },
});

export const { clearError } = callSlice.actions;
export default callSlice.reducer;
