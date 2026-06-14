// ============================================================
// Tasks Slice — tasks and reminders state
// ============================================================
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { tasksAPI } from "../../services/api";

const FETCH_TTL_MS = 15 * 1000;

export const fetchTasks = createAsyncThunk(
  "tasks/fetchAll",
  async (options = {}, { rejectWithValue }) => {
    try {
      const res = await tasksAPI.getTasks({ force: Boolean(options.force) });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Failed to load tasks.");
    }
  },
  {
    condition: (options = {}, { getState }) => {
      const state = getState().tasks;
      if (state.isLoading) return false;
      if (options.force) return true;
      if (!state.lastFetchedAt) return true;
      return Date.now() - state.lastFetchedAt > FETCH_TTL_MS;
    },
  }
);

export const createTask = createAsyncThunk(
  "tasks/create",
  async (data, { rejectWithValue }) => {
    try {
      const res = await tasksAPI.createTask(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Failed to create task.");
    }
  }
);

export const toggleTask = createAsyncThunk("tasks/toggle", async (id) => {
  const res = await tasksAPI.toggleTask(id);
  return res.data;
});

export const deleteTask = createAsyncThunk("tasks/delete", async (id) => {
  await tasksAPI.deleteTask(id);
  return id;
});

const taskSlice = createSlice({
  name: "tasks",
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
      .addCase(fetchTasks.pending,   (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.isLoading = false;
        state.list = action.payload;
        state.lastFetchedAt = Date.now();
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.isLoading = false;
        if (action.payload) state.error = action.payload;
      })
      .addCase(createTask.fulfilled, (state, action) => {
        state.list.unshift(action.payload);
        state.lastFetchedAt = Date.now();
      })
      .addCase(createTask.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(toggleTask.fulfilled, (state, action) => {
        const idx = state.list.findIndex((t) => t.id === action.payload.id);
        if (idx !== -1) state.list[idx] = action.payload;
      })
      .addCase(deleteTask.fulfilled, (state, action) => {
        state.list = state.list.filter((t) => t.id !== action.payload);
      });
  },
});

export const { clearError } = taskSlice.actions;
export default taskSlice.reducer;
