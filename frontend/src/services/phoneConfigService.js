import api from "./api";

const phoneConfigService = {
  fetchConfig: () => api.get("/phone-config"),
  saveConfig: (data) => api.post("/phone-config/save", data),
  setActiveMode: (mode) => api.post("/phone-config/set-active-mode", { mode }),
  testConnection: (data) => api.post("/phone-config/test", data),
  makeCall: (data) => api.post("/phone-config/call", data),
  sendSMS: (data) => api.post("/phone-config/sms", data),
  sendWhatsApp: (data) => api.post("/phone-config/whatsapp", data),
  addCallerNumber: ({ phoneNumber, friendlyName }) =>
    api.post("/caller-id/add", { phoneNumber, friendlyName }),
  verifyCallerNumber: (phoneNumber) =>
    api.post("/caller-id/verify", { phoneNumber }),
  fetchCallerNumbers: () => api.get("/caller-id/list"),
  removeCallerNumber: (payload) => {
    const data = typeof payload === "string" ? { sid: payload } : payload;
    return api.delete("/caller-id/remove", { data });
  },
  setActiveCallerId: (phoneNumber) =>
    api.post("/caller-id/set-active", { phoneNumber }),
};

export default phoneConfigService;
