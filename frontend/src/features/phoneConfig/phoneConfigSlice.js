import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import phoneConfigService from "../../services/phoneConfigService";

function getErrorMessage(err, fallback) {
  return err.response?.data?.error || fallback;
}

function emptyNumberSlot() {
  return {
    configured: false,
    twilioSid: "",
    twilioSidMasked: "",
    twilioToken: "",
    twilioTokenMasked: "",
    twilioPhone: "",
    twilioPhoneMasked: "",
  };
}

function normalizeConfig(config = {}) {
  return {
    personalNumber: { ...emptyNumberSlot(), ...(config.personalNumber || {}) },
    businessNumber: { ...emptyNumberSlot(), ...(config.businessNumber || {}) },
    activeMode: config.activeMode || "personal",
    activeNumber: config.activeNumber || emptyNumberSlot(),
    hasAnyConfiguredNumber: Boolean(config.hasAnyConfiguredNumber),
    verifiedCallerIds: config.verifiedCallerIds || config.verifiedNumbers || [],
    activeCallerId: config.activeCallerId || null,
    activeCallerIdMasked: config.activeCallerIdMasked || "",
    credentialWarning: config.credentialWarning || "",
    credentialErrors: config.credentialErrors || { personal: false, business: false },
  };
}

export const fetchConfig = createAsyncThunk(
  "phoneConfig/fetch",
  async (_, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.fetchConfig();
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to load phone configuration."));
    }
  }
);

export const saveConfig = createAsyncThunk(
  "phoneConfig/save",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.saveConfig(payload);
      return res.data.config || res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to save phone configuration."));
    }
  }
);

export const setActiveMode = createAsyncThunk(
  "phoneConfig/setActiveMode",
  async (mode, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.setActiveMode(mode);
      return res.data.config || res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to switch active number."));
    }
  }
);

export const testConnection = createAsyncThunk(
  "phoneConfig/testConnection",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.testConnection(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Twilio connection test failed."));
    }
  }
);

export const makeCall = createAsyncThunk(
  "phoneConfig/makeCall",
  async (payload, { rejectWithValue }) => {
    try {
      const data = typeof payload === "string" ? { to: payload } : payload;
      const res = await phoneConfigService.makeCall(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to initiate call."));
    }
  }
);

export const sendSMS = createAsyncThunk(
  "phoneConfig/sendSMS",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.sendSMS(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to send SMS."));
    }
  }
);

export const sendWhatsApp = createAsyncThunk(
  "phoneConfig/sendWhatsApp",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.sendWhatsApp(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to send WhatsApp message."));
    }
  }
);

export const addCallerNumber = createAsyncThunk(
  "phoneConfig/addCallerNumber",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.addCallerNumber(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to start caller ID verification."));
    }
  }
);

export const checkVerificationStatus = createAsyncThunk(
  "phoneConfig/checkVerificationStatus",
  async (phoneNumber, { rejectWithValue }) => {
    try {
      const res = phoneNumber
        ? await phoneConfigService.verifyCallerNumber(phoneNumber)
        : await phoneConfigService.fetchCallerNumbers();
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to check caller ID verification."));
    }
  }
);

export const removeCallerNumber = createAsyncThunk(
  "phoneConfig/removeCallerNumber",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.removeCallerNumber(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to remove caller ID."));
    }
  }
);

export const setActiveCallerId = createAsyncThunk(
  "phoneConfig/setActiveCallerId",
  async (phoneNumber, { rejectWithValue }) => {
    try {
      const res = await phoneConfigService.setActiveCallerId(phoneNumber);
      return res.data;
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, "Failed to set active caller ID."));
    }
  }
);

const phoneConfigSlice = createSlice({
  name: "phoneConfig",
  initialState: {
    personalNumber: emptyNumberSlot(),
    businessNumber: emptyNumberSlot(),
    activeMode: "personal",
    activeNumber: emptyNumberSlot(),
    hasAnyConfiguredNumber: false,
    verifiedCallerIds: [],
    activeCallerId: null,
    activeCallerIdMasked: "",
    loading: false,
    testing: false,
    sending: false,
    error: null,
    notice: "",
    pendingNumber: null,
    lastTestResult: null,
    lastActionResult: null,
    credentialWarning: "",
    credentialErrors: { personal: false, business: false },
  },
  reducers: {
    clearPhoneConfigError: (state) => {
      state.error = null;
    },
    clearPhoneConfigStatus: (state) => {
      state.error = null;
      state.notice = "";
      state.lastTestResult = null;
      state.lastActionResult = null;
    },
  },
  extraReducers: (builder) => {
    function applyConfig(state, payload = {}) {
      const config = normalizeConfig(payload);
      if (payload.personalNumber) state.personalNumber = config.personalNumber;
      if (payload.businessNumber) state.businessNumber = config.businessNumber;
      if (payload.activeMode) state.activeMode = config.activeMode;
      if (payload.activeNumber) state.activeNumber = config.activeNumber;
      if (payload.hasAnyConfiguredNumber !== undefined) state.hasAnyConfiguredNumber = config.hasAnyConfiguredNumber;
      if (payload.verifiedCallerIds || payload.verifiedNumbers) state.verifiedCallerIds = config.verifiedCallerIds;
      if (payload.activeCallerId !== undefined) state.activeCallerId = config.activeCallerId;
      if (payload.activeCallerIdMasked !== undefined) state.activeCallerIdMasked = config.activeCallerIdMasked;
      if (payload.credentialWarning !== undefined) state.credentialWarning = config.credentialWarning;
      if (payload.credentialErrors !== undefined) state.credentialErrors = config.credentialErrors;
      if (payload.pendingNumber) state.pendingNumber = payload.pendingNumber;
    }

    function pending(state) {
      state.loading = true;
      state.error = null;
      state.notice = "";
    }

    function rejected(state, action) {
      state.loading = false;
      state.testing = false;
      state.sending = false;
      state.error = action.payload;
    }

    builder
      .addCase(fetchConfig.pending, pending)
      .addCase(fetchConfig.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
      })
      .addCase(fetchConfig.rejected, rejected)
      .addCase(saveConfig.pending, pending)
      .addCase(saveConfig.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        state.notice = "Phone configuration saved.";
      })
      .addCase(saveConfig.rejected, rejected)
      .addCase(setActiveMode.pending, pending)
      .addCase(setActiveMode.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        state.notice = "Active number updated.";
      })
      .addCase(setActiveMode.rejected, rejected)
      .addCase(testConnection.pending, (state) => {
        state.testing = true;
        state.error = null;
        state.notice = "";
        state.lastTestResult = null;
      })
      .addCase(testConnection.fulfilled, (state, action) => {
        state.testing = false;
        state.lastTestResult = action.payload;
        state.notice = "Twilio connection verified.";
      })
      .addCase(testConnection.rejected, rejected)
      .addCase(makeCall.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(makeCall.fulfilled, (state, action) => {
        state.sending = false;
        state.lastActionResult = action.payload;
      })
      .addCase(makeCall.rejected, rejected)
      .addCase(sendSMS.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(sendSMS.fulfilled, (state, action) => {
        state.sending = false;
        state.lastActionResult = action.payload;
      })
      .addCase(sendSMS.rejected, rejected)
      .addCase(sendWhatsApp.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(sendWhatsApp.fulfilled, (state, action) => {
        state.sending = false;
        state.lastActionResult = action.payload;
      })
      .addCase(sendWhatsApp.rejected, rejected)
      .addCase(addCallerNumber.pending, pending)
      .addCase(addCallerNumber.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        state.notice = "Caller ID verification started.";
      })
      .addCase(addCallerNumber.rejected, rejected)
      .addCase(checkVerificationStatus.pending, pending)
      .addCase(checkVerificationStatus.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        if (
          state.pendingNumber &&
          (action.payload.verifiedCallerIds || action.payload.verifiedNumbers || [])
            .some((item) => item.number === state.pendingNumber.number && item.status === "verified")
        ) {
          state.pendingNumber = null;
        }
        state.notice = "Caller ID status refreshed.";
      })
      .addCase(checkVerificationStatus.rejected, rejected)
      .addCase(removeCallerNumber.pending, pending)
      .addCase(removeCallerNumber.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        state.notice = "Caller ID removed.";
      })
      .addCase(removeCallerNumber.rejected, rejected)
      .addCase(setActiveCallerId.pending, pending)
      .addCase(setActiveCallerId.fulfilled, (state, action) => {
        state.loading = false;
        applyConfig(state, action.payload);
        state.notice = "Active caller ID updated.";
      })
      .addCase(setActiveCallerId.rejected, rejected);
  },
});

export const { clearPhoneConfigError, clearPhoneConfigStatus } = phoneConfigSlice.actions;
export default phoneConfigSlice.reducer;
