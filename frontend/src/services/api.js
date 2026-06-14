// ============================================================
// API Service — all backend HTTP calls in one place
// ============================================================
import axios from "axios";

// Create a reusable axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// ---------------------------------------------------------------
// Request interceptor — auto-attach JWT to every request
// ---------------------------------------------------------------
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aura_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------
// Response interceptor — handle token expiry globally
// ---------------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorCode = error.response?.data?.code;
    if (error.response?.status === 401 && errorCode !== "razorpay_auth_failed") {
      // Token expired or invalid — clear storage and redirect to login
      localStorage.removeItem("aura_token");
      localStorage.removeItem("aura_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

const DEFAULT_GET_TTLS = {
  "/connections/status": 30 * 1000,
  "/voice/status": 5 * 60 * 1000,
  "/calls": 15 * 1000,
  "/tasks": 15 * 1000,
  "/dashboard/stats": 15 * 1000,
  "/gmail/scheduled": 15 * 1000,
};

const getCache = new Map();

function stableStringify(value) {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(",")}}`;
}

function getCacheKey(url, config = {}) {
  const token = localStorage.getItem("aura_token") || "anon";
  return `${token}|${url}|${stableStringify(config.params)}`;
}

function storeCachedResponse(key, response, ttl) {
  getCache.set(key, {
    response,
    expiresAt: Date.now() + ttl,
  });
  return response;
}

export function invalidateGetCache(urlPrefix) {
  for (const key of getCache.keys()) {
    if (key.includes(`|${urlPrefix}|`)) getCache.delete(key);
  }
}

export function cachedGet(url, config = {}, options = {}) {
  const ttl = typeof options.ttl === "number" ? options.ttl : DEFAULT_GET_TTLS[url] || 0;
  if (ttl <= 0) return api.get(url, config);

  const key = getCacheKey(url, config);
  const now = Date.now();
  const cached = getCache.get(key);

  if (!options.force && cached?.response && cached.expiresAt > now) {
    return Promise.resolve(cached.response);
  }

  if (!options.force && cached?.promise) return cached.promise;

  const promise = api.get(url, config)
    .then((response) => storeCachedResponse(key, response, ttl))
    .catch((err) => {
      getCache.delete(key);
      throw err;
    });

  getCache.set(key, { promise, expiresAt: now + ttl });
  return promise;
}

export function isRateLimitError(err) {
  return err?.response?.status === 429 || err?.response?.data?.code === "rate_limited";
}

export function getRequestErrorMessage(err, fallback = "Request failed.") {
  if (isRateLimitError(err)) {
    const retryAfter = err.response?.data?.retryAfter;
    return retryAfter
      ? `Too many requests. Please wait ${retryAfter}s and try again.`
      : "Too many requests. Please wait and try again.";
  }

  return err?.response?.data?.error || fallback;
}

function withInvalidation(request, ...urlPrefixes) {
  return request.then((response) => {
    urlPrefixes.forEach(invalidateGetCache);
    return response;
  });
}

// ---------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getProfile: () => api.get("/auth/profile"),
  updateLanguage: (lang) => api.patch("/auth/language", { language: lang }),
};

// ---------------------------------------------------------------
// Chat endpoints
// ---------------------------------------------------------------
export const chatAPI = {
  sendMessage: (message, language) =>
    api.post("/chat/message", { message, language }),

  sendAgentMessage: (data) =>
    api.post("/ai/chat", data),

  sendVoiceCommand: (data) =>
    api.post("/ai/voice-command", data),

  getHistory: (limit = 50) =>
    api.get(`/chat/history?limit=${limit}`),

  sendVoice: (audioBlob, language = "en") => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "voice.webm");
    formData.append("language", language);
    return api.post("/chat/voice", formData, { responseType: "arraybuffer" });
  },

  clearMemory: () => api.delete("/chat/memory"),
};

export const voiceAPI = {
  status: (options) => cachedGet("/voice/status", {}, options),
  transcribe: ({ audioBlob, sessionId, languageMode = "auto", language = "auto" }) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "voice.webm");
    formData.append("sessionId", sessionId);
    formData.append("languageMode", languageMode);
    formData.append("language", language);
    return api.post("/voice/transcribe", formData);
  },
  tts: (data) => api.post("/voice/tts", data, { responseType: "arraybuffer", validateStatus: (status) => status < 500 }),
  getPreferences: () => api.get("/voice/preferences"),
  updatePreferences: (data) => api.put("/voice/preferences", data),
  confirmAction: (data) => api.post("/voice/confirm-action", data),
};

export const connectionsAPI = {
  status: (options) => cachedGet("/connections/status", {}, options),
};

// ---------------------------------------------------------------
// Agent tool endpoints
// ---------------------------------------------------------------
export const mapsAPI = {
  nearby: (data) => api.post("/maps/nearby", data),
  placeDetails: (placeId) => api.get(`/maps/place/${placeId}`),
};

export const gmailAPI = {
  getAuthUrl: () => api.get("/gmail/auth-url"),
  draft: (data) => api.post("/gmail/draft", data),
  send: (data) => api.post("/gmail/send", data),
  schedule: (data) => withInvalidation(api.post("/gmail/schedule", data), "/gmail/scheduled", "/tasks"),
  listScheduled: (options) => cachedGet("/gmail/scheduled", {}, options),
  updateScheduled: (id, data) => withInvalidation(api.put(`/gmail/scheduled/${id}`, data), "/gmail/scheduled"),
  cancelScheduled: (id) => withInvalidation(api.delete(`/gmail/scheduled/${id}`), "/gmail/scheduled"),
};

export const calendarAPI = {
  createEvent: (data) => api.post("/calendar/events", data),
  listEvents: (params) => api.get("/calendar/events", { params }),
  updateEvent: (id, data) => api.put(`/calendar/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/calendar/events/${id}`),
};

// ---------------------------------------------------------------
// Calls endpoints
// ---------------------------------------------------------------
export const callsAPI = {
  scheduleCall: (data) => withInvalidation(api.post("/calls/schedule", data), "/calls", "/tasks"),
  getAllCalls: (params, options) => cachedGet("/calls", { params }, options),
  cancelCall: (id) => withInvalidation(api.patch(`/calls/${id}/cancel`), "/calls"),
};

// ---------------------------------------------------------------
// Messages endpoints
// ---------------------------------------------------------------
export const messagesAPI = {
  sendSMS: (data) => api.post("/messages/sms", data),
  sendWhatsApp: (data) => api.post("/messages/whatsapp", data),
  getHistory: (params) => api.get("/messages", { params }),
  generateMessage: (data) => api.post("/ai/generate-message", data),
};

// ---------------------------------------------------------------
// Tasks endpoints
// ---------------------------------------------------------------
export const tasksAPI = {
  getTasks: (options) => cachedGet("/tasks", {}, options),
  createTask: (data) => withInvalidation(api.post("/tasks", data), "/tasks"),
  toggleTask: (id) => withInvalidation(api.patch(`/tasks/${id}/toggle`), "/tasks"),
  deleteTask: (id) => withInvalidation(api.delete(`/tasks/${id}`), "/tasks"),
};
export default api;
