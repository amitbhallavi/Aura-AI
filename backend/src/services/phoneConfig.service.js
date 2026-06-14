// ============================================================
// Phone Config Service - encrypted user Twilio credentials
// ============================================================
const crypto = require("crypto");
const twilio = require("twilio");
const PhoneConfig = require("../../models/mongo/PhoneConfig");

const MODES = ["personal", "business"];
const SLOT_BY_MODE = {
  personal: "personalNumber",
  business: "businessNumber",
};
const FIELD_NAMES = ["twilioSid", "twilioToken", "twilioPhone"];

function createHttpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function createDecryptError() {
  return createHttpError(
    409,
    "Saved Twilio credentials cannot be decrypted. This usually means ENCRYPTION_KEY changed. Re-enter and save the Twilio credentials.",
    "PHONE_CONFIG_DECRYPT_FAILED"
  );
}

function isDecryptError(err) {
  return (
    err?.code === "PHONE_CONFIG_DECRYPT_FAILED" ||
    err?.code === "ERR_OSSL_BAD_DECRYPT" ||
    /bad decrypt|unable to authenticate data|Unsupported state/i.test(err?.message || "")
  );
}

function getEncryptionKey() {
  const rawKey = String(process.env.ENCRYPTION_KEY || process.env.PHONE_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();
  if (!rawKey) {
    throw createHttpError(
      500,
      "ENCRYPTION_KEY is required before saving phone credentials.",
      "PHONE_CONFIG_KEY_MISSING"
    );
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) return Buffer.from(rawKey, "hex");

  try {
    const decoded = Buffer.from(rawKey, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}

  return crypto.createHash("sha256").update(rawKey).digest();
}

function encryptValue(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(cleanValue, "utf8"), cipher.final()]);

  return `v2:${iv.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptValue(value) {
  const encryptedValue = String(value || "");
  if (!encryptedValue) return "";
  if (!encryptedValue.startsWith("v1:") && !encryptedValue.startsWith("v2:")) return encryptedValue;

  try {
    if (encryptedValue.startsWith("v2:")) {
      const [, ivRaw, encryptedRaw] = encryptedValue.split(":");
      if (!ivRaw || !encryptedRaw) throw createDecryptError();

      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        getEncryptionKey(),
        Buffer.from(ivRaw, "base64url")
      );

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedRaw, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    }

    const [, ivRaw, tagRaw, encryptedRaw] = encryptedValue.split(":");
    if (!ivRaw || !tagRaw || !encryptedRaw) throw createDecryptError();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    if (isDecryptError(err)) throw createDecryptError();
    throw err;
  }
}

function normalizePhoneMode(mode, fallback = "personal") {
  const cleanMode = String(mode || "").trim().toLowerCase();
  if (MODES.includes(cleanMode)) return cleanMode;
  return fallback;
}

function isMaskedValue(value) {
  return /^[*xX.\s-]+[A-Za-z0-9]{0,6}$/.test(String(value || "").trim());
}

function normalizeSid(value) {
  const sid = String(value || "").trim();
  if (!sid) return "";
  if (!/^AC[a-zA-Z0-9]{20,40}$/.test(sid)) {
    throw createHttpError(400, "Twilio Account SID must start with AC and look like a valid SID.");
  }
  return sid;
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  if (!token) return "";
  if (token.length < 16) {
    throw createHttpError(400, "Twilio Auth Token looks too short.");
  }
  return token;
}

function normalizePhoneNumber(value) {
  const phone = String(value || "").replace(/[()\s-]/g, "").trim();
  if (!phone) return "";
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw createHttpError(400, "Twilio phone number must use E.164 format, for example +14155552671.");
  }
  return phone;
}

function normalizeDestinationNumber(value) {
  const phone = normalizePhoneNumber(value);
  if (!phone) throw createHttpError(400, "Recipient phone number is required.");
  return phone;
}

function decryptSlot(slot = {}) {
  return {
    twilioSid: decryptValue(slot.twilioSid),
    twilioToken: decryptValue(slot.twilioToken),
    twilioPhone: decryptValue(slot.twilioPhone),
  };
}

function emptyPlainSlot() {
  return { twilioSid: "", twilioToken: "", twilioPhone: "" };
}

function tryDecryptSlot(slot = {}) {
  try {
    return { slot: decryptSlot(slot), ok: true };
  } catch (err) {
    if (!isDecryptError(err)) throw err;
    return { slot: emptyPlainSlot(), ok: false, error: err };
  }
}

function getSafeDecryptedSlots(config = {}) {
  const personal = tryDecryptSlot(config.personalNumber);
  const business = tryDecryptSlot(config.businessNumber);
  const credentialErrors = {
    personal: !personal.ok,
    business: !business.ok,
  };
  const hasCredentialError = credentialErrors.personal || credentialErrors.business;

  return {
    decryptedSlots: {
      personalNumber: personal.slot,
      businessNumber: business.slot,
    },
    credentialErrors,
    credentialWarning: hasCredentialError
      ? "Some saved Twilio credentials could not be decrypted. Re-enter and save the affected credentials."
      : "",
  };
}

function encryptSlot(slot = {}) {
  return {
    twilioSid: encryptValue(slot.twilioSid),
    twilioToken: encryptValue(slot.twilioToken),
    twilioPhone: encryptValue(slot.twilioPhone),
  };
}

function isCompleteSlot(slot = {}) {
  return FIELD_NAMES.every((field) => Boolean(String(slot[field] || "").trim()));
}

function maskSecret(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.length <= 4) return "****";
  return `${"*".repeat(Math.min(clean.length - 4, 12))}${clean.slice(-4)}`;
}

function maskPhoneNumber(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const last4 = clean.slice(-4);
  const prefix = clean.startsWith("+") ? clean.slice(0, Math.min(3, clean.length - 4)) : "";
  return `${prefix} ${"X".repeat(6)} ${last4}`.trim();
}

function sanitizeCallerId(item = {}) {
  const number = item.number || "";
  return {
    number,
    numberMasked: number ? maskPhoneNumber(number) : "",
    sid: item.sid || "",
    friendlyName: item.friendlyName || "Personal Number",
    status: item.status || "pending",
    phoneMode: item.phoneMode || "personal",
    twilioAccountSid: item.twilioAccountSid || "",
    validationCode: item.validationCode || "",
    callSid: item.callSid || "",
    verifiedAt: item.verifiedAt || null,
  };
}

function sanitizeSlot(slot = {}) {
  const configured = isCompleteSlot(slot);
  return {
    configured,
    twilioSid: slot.twilioSid ? maskSecret(slot.twilioSid) : "",
    twilioSidMasked: slot.twilioSid ? maskSecret(slot.twilioSid) : "",
    twilioToken: "",
    twilioTokenMasked: slot.twilioToken ? maskSecret(slot.twilioToken) : "",
    twilioPhone: slot.twilioPhone || "",
    twilioPhoneMasked: slot.twilioPhone ? maskPhoneNumber(slot.twilioPhone) : "",
  };
}

function sanitizeConfig(config, decryptedSlots) {
  const activeMode = normalizePhoneMode(config?.activeMode);
  const personalNumber = sanitizeSlot(decryptedSlots?.personalNumber);
  const businessNumber = sanitizeSlot(decryptedSlots?.businessNumber);

  return {
    userId: config?.userId || "",
    activeMode,
    personalNumber,
    businessNumber,
    verifiedCallerIds: (config?.verifiedCallerIds || []).map(sanitizeCallerId),
    activeCallerId: config?.activeCallerId || "",
    activeCallerIdMasked: config?.activeCallerId ? maskPhoneNumber(config.activeCallerId) : "",
    hasAnyConfiguredNumber: personalNumber.configured || businessNumber.configured,
    activeNumber: activeMode === "business" ? businessNumber : personalNumber,
    updatedAt: config?.updatedAt || null,
  };
}

async function loadPhoneConfig(userId) {
  if (!userId) throw createHttpError(401, "Login is required.");
  return PhoneConfig.findOne({ userId });
}

async function getDecryptedPhoneConfig(userId) {
  const config = await loadPhoneConfig(userId);
  const base = config || { userId, activeMode: "personal", personalNumber: {}, businessNumber: {} };
  return {
    config: base,
    decryptedSlots: {
      personalNumber: decryptSlot(base.personalNumber),
      businessNumber: decryptSlot(base.businessNumber),
    },
  };
}

async function getSanitizedPhoneConfig(userId) {
  const config = await loadPhoneConfig(userId);
  const base = config || { userId, activeMode: "personal", personalNumber: {}, businessNumber: {} };
  const safe = getSafeDecryptedSlots(base);
  return {
    ...sanitizeConfig(base, safe.decryptedSlots),
    credentialErrors: safe.credentialErrors,
    credentialWarning: safe.credentialWarning,
  };
}

function mergeSubmittedSlot(existingSlot, submittedSlot = {}) {
  const nextSlot = { ...existingSlot };

  if (submittedSlot.twilioSid !== undefined && submittedSlot.twilioSid !== "" && !isMaskedValue(submittedSlot.twilioSid)) {
    nextSlot.twilioSid = normalizeSid(submittedSlot.twilioSid);
  }
  if (submittedSlot.twilioToken !== undefined && submittedSlot.twilioToken !== "" && !isMaskedValue(submittedSlot.twilioToken)) {
    nextSlot.twilioToken = normalizeToken(submittedSlot.twilioToken);
  }
  if (submittedSlot.twilioPhone !== undefined && submittedSlot.twilioPhone !== "" && !isMaskedValue(submittedSlot.twilioPhone)) {
    nextSlot.twilioPhone = normalizePhoneNumber(submittedSlot.twilioPhone);
  }

  return nextSlot;
}

function getSubmittedSlot(body = {}, mode) {
  const directSlot = body[SLOT_BY_MODE[mode]];
  if (directSlot && typeof directSlot === "object") return directSlot;

  if (normalizePhoneMode(body.mode || body.type, "") === mode) {
    return {
      twilioSid: body.twilioSid,
      twilioToken: body.twilioToken,
      twilioPhone: body.twilioPhone,
    };
  }

  return null;
}

function hasCompleteRawSubmittedSlot(submittedSlot = {}) {
  return FIELD_NAMES.every((field) => {
    const value = String(submittedSlot[field] || "").trim();
    return Boolean(value) && !isMaskedValue(value);
  });
}

async function savePhoneConfigForUser(userId, body = {}) {
  const existing = await loadPhoneConfig(userId);
  const safeExisting = existing
    ? getSafeDecryptedSlots(existing)
    : {
      decryptedSlots: {
        personalNumber: emptyPlainSlot(),
        businessNumber: emptyPlainSlot(),
      },
      credentialErrors: { personal: false, business: false },
      credentialWarning: "",
    };
  const existingPlain = safeExisting.decryptedSlots;

  const activeMode = body.activeMode !== undefined
    ? normalizePhoneMode(body.activeMode)
    : normalizePhoneMode(existing?.activeMode);

  const updates = { activeMode };
  let touchedCredentialSlot = false;

  for (const mode of MODES) {
    const slotName = SLOT_BY_MODE[mode];
    const submittedSlot = getSubmittedSlot(body, mode);
    if (!submittedSlot) continue;

    touchedCredentialSlot = true;
    if (safeExisting.credentialErrors[mode] && !hasCompleteRawSubmittedSlot(submittedSlot)) {
      throw createHttpError(
        409,
        `Saved ${mode} Twilio credentials cannot be decrypted. Re-enter Twilio SID, Auth Token, and phone number, then save again.`,
        "PHONE_CONFIG_DECRYPT_FAILED"
      );
    }

    const baseSlot = safeExisting.credentialErrors[mode] ? emptyPlainSlot() : existingPlain[slotName];
    const nextPlainSlot = mergeSubmittedSlot(baseSlot, submittedSlot);
    if (!isCompleteSlot(nextPlainSlot)) {
      throw createHttpError(400, `Complete Twilio SID, Auth Token, and phone number are required for ${mode} number.`);
    }
    updates[slotName] = encryptSlot(nextPlainSlot);
    existingPlain[slotName] = nextPlainSlot;
  }

  if (!touchedCredentialSlot && body.mode) {
    throw createHttpError(400, "No phone credentials were provided.");
  }

  if (body.activeMode !== undefined && safeExisting.credentialErrors[activeMode]) {
    throw createHttpError(
      409,
      `Saved ${activeMode} Twilio credentials cannot be decrypted. Re-enter and save them before making this mode active.`,
      "PHONE_CONFIG_DECRYPT_FAILED"
    );
  }

  if (body.activeMode !== undefined && !isCompleteSlot(existingPlain[SLOT_BY_MODE[activeMode]])) {
    throw createHttpError(400, `Save the ${activeMode} Twilio credentials before making it active.`);
  }

  const saved = await PhoneConfig.findOneAndUpdate(
    { userId },
    { $set: { userId, ...updates } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const safeSaved = getSafeDecryptedSlots(saved);
  return {
    ...sanitizeConfig(saved, safeSaved.decryptedSlots),
    credentialErrors: safeSaved.credentialErrors,
    credentialWarning: safeSaved.credentialWarning,
  };
}

async function setActiveModeForUser(userId, mode) {
  const selectedMode = normalizePhoneMode(mode, "");
  if (!selectedMode) throw createHttpError(400, "mode must be personal or business.");

  const config = await loadPhoneConfig(userId);
  const safe = getSafeDecryptedSlots(config || {});
  if (safe.credentialErrors[selectedMode]) {
    throw createHttpError(
      409,
      `Saved ${selectedMode} Twilio credentials cannot be decrypted. Re-enter and save them before making this mode active.`,
      "PHONE_CONFIG_DECRYPT_FAILED"
    );
  }

  const { decryptedSlots } = safe;
  if (!isCompleteSlot(decryptedSlots[SLOT_BY_MODE[selectedMode]])) {
    throw createHttpError(400, `Save the ${selectedMode} Twilio credentials before making it active.`);
  }

  const saved = await PhoneConfig.findOneAndUpdate(
    { userId },
    { $set: { userId, activeMode: selectedMode } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const safeSaved = getSafeDecryptedSlots(saved);
  return {
    ...sanitizeConfig(saved, safeSaved.decryptedSlots),
    credentialErrors: safeSaved.credentialErrors,
    credentialWarning: safeSaved.credentialWarning,
  };
}

async function getTwilioCredentialsForUser(userId, mode) {
  const config = await loadPhoneConfig(userId);
  const base = config || { userId, activeMode: "personal", personalNumber: {}, businessNumber: {} };
  const safe = getSafeDecryptedSlots(base);
  const selectedMode = normalizePhoneMode(mode, normalizePhoneMode(base.activeMode));
  const slotName = SLOT_BY_MODE[selectedMode];
  if (safe.credentialErrors[selectedMode]) {
    throw createHttpError(
      409,
      `Saved ${selectedMode} Twilio credentials cannot be decrypted. Re-enter and save them in Phone Config.`,
      "PHONE_CONFIG_DECRYPT_FAILED"
    );
  }

  const slot = safe.decryptedSlots[slotName];

  if (!isCompleteSlot(slot)) {
    throw createHttpError(
      400,
      `Configure your ${selectedMode} Twilio number before using calls, SMS, or WhatsApp.`,
      "PHONE_CONFIG_MISSING"
    );
  }

  return { mode: selectedMode, ...slot };
}

async function getAvailableTwilioCredentials(userId) {
  const config = await loadPhoneConfig(userId);
  const safe = getSafeDecryptedSlots(config || {});
  const { decryptedSlots } = safe;
  const credentials = [];
  const seenAccounts = new Set();

  for (const mode of MODES) {
    if (safe.credentialErrors[mode]) continue;
    const slot = decryptedSlots[SLOT_BY_MODE[mode]];
    if (!isCompleteSlot(slot)) continue;
    if (seenAccounts.has(slot.twilioSid)) continue;
    seenAccounts.add(slot.twilioSid);
    credentials.push({ mode, ...slot });
  }

  return credentials;
}

async function hasConfiguredPhoneConfig(userId) {
  try {
    const { decryptedSlots } = await getDecryptedPhoneConfig(userId);
    return {
      personal: isCompleteSlot(decryptedSlots.personalNumber),
      business: isCompleteSlot(decryptedSlots.businessNumber),
    };
  } catch {
    return { personal: false, business: false };
  }
}

function getTwilioClient(credentials) {
  return twilio(credentials.twilioSid, credentials.twilioToken);
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPhoneTwiml(message) {
  const spokenMessage = String(message || "This is a call from Aura AI.").trim().slice(0, 600);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="en-US">${xmlEscape(spokenMessage)}</Say></Response>`;
}

function getBaseUrl(req) {
  const configured = process.env.PHONE_CONFIG_PUBLIC_BASE_URL || process.env.API_URL || process.env.PUBLIC_BACKEND_URL;
  const fallback = req ? `${req.protocol}://${req.get("host")}` : "";
  const baseUrl = normalizePublicHttpUrl(configured || fallback, "API_URL").replace(/\/+$/, "");
  if (!baseUrl) {
    throw createHttpError(500, "A public backend URL is required for Twilio call TwiML.");
  }
  return baseUrl;
}

function normalizePublicHttpUrl(value, label) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";

  let parsed;
  try {
    parsed = new URL(cleanValue);
  } catch {
    throw createHttpError(
      500,
      `${label} must be a valid public http(s) URL. Example: https://your-domain.com`,
      "INVALID_PUBLIC_URL"
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createHttpError(
      500,
      `${label} must start with http:// or https://.`,
      "INVALID_PUBLIC_URL"
    );
  }

  return parsed.toString();
}

function buildTwimlUrl({ req, message }) {
  if (process.env.TWIML_URL) return normalizePublicHttpUrl(process.env.TWIML_URL, "TWIML_URL");
  const baseUrl = getBaseUrl(req);
  const url = new URL("/twiml", baseUrl);
  url.searchParams.set("message", String(message || "This is a call from Aura AI.").slice(0, 600));
  return url.toString();
}

function buildWebhookUrl({ req, path }) {
  const baseUrl = getBaseUrl(req);
  const url = new URL(path, baseUrl);
  const secret = String(process.env.TWILIO_WEBHOOK_SECRET || "").trim();
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

function toWhatsAppAddress(phone) {
  const clean = String(phone || "").trim();
  if (clean.startsWith("whatsapp:")) return clean;
  return `whatsapp:${normalizeDestinationNumber(clean)}`;
}

async function testTwilioConnection({ userId, mode, credentials: rawCredentials }) {
  let credentials;
  let selectedMode = normalizePhoneMode(mode);

  if (rawCredentials && isCompleteSlot(rawCredentials)) {
    credentials = {
      twilioSid: normalizeSid(rawCredentials.twilioSid),
      twilioToken: normalizeToken(rawCredentials.twilioToken),
      twilioPhone: normalizePhoneNumber(rawCredentials.twilioPhone),
    };
  } else {
    credentials = await getTwilioCredentialsForUser(userId, selectedMode);
    selectedMode = credentials.mode;
  }

  const client = getTwilioClient(credentials);
  const [account, phoneNumbers] = await Promise.all([
    client.api.accounts(credentials.twilioSid).fetch(),
    client.incomingPhoneNumbers.list({ phoneNumber: credentials.twilioPhone, limit: 1 }),
  ]);

  if (phoneNumbers.length === 0) {
    throw createHttpError(400, "Twilio credentials are valid, but this phone number was not found in the account.");
  }

  return {
    ok: true,
    mode: selectedMode,
    accountStatus: account.status,
    phoneNumberFound: phoneNumbers.length > 0,
    twilioPhone: credentials.twilioPhone,
    twilioPhoneMasked: maskPhoneNumber(credentials.twilioPhone),
  };
}

async function makeConfiguredCall({ userId, mode, to, message, req }) {
  const credentials = await getTwilioCredentialsForUser(userId, mode);
  const toNumber = normalizeDestinationNumber(to);
  const twimlUrl = buildTwimlUrl({ req, message });
  let statusCallbackUrl = "";
  try {
    statusCallbackUrl = buildWebhookUrl({ req, path: "/api/webhooks/twilio/call-status" });
  } catch {}
  const phoneConfig = await PhoneConfig.findOne({ userId }).lean();
  const activeCallerId = phoneConfig?.activeCallerId || "";
  const verifiedCallerId = (phoneConfig?.verifiedCallerIds || []).find((item) => (
    item.number === activeCallerId &&
    item.status === "verified" &&
    (!item.twilioAccountSid || item.twilioAccountSid === credentials.twilioSid)
  ));
  const fromNumber = verifiedCallerId?.number || credentials.twilioPhone;
  if (!fromNumber) throw createHttpError(400, "No outbound caller number is configured.");

  const callOptions = {
    to: toNumber,
    from: fromNumber,
    url: twimlUrl,
  };

  if (statusCallbackUrl) {
    callOptions.statusCallback = statusCallbackUrl;
    callOptions.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
    callOptions.statusCallbackMethod = "POST";
  }

  const result = await getTwilioClient(credentials).calls.create(callOptions);

  return {
    sid: result.sid,
    status: result.status,
    mode: credentials.mode,
    from: fromNumber,
    fromMasked: maskPhoneNumber(fromNumber),
    usedVerifiedCallerId: Boolean(verifiedCallerId),
    to: toNumber,
  };
}

function normalizeInboundNumber(value) {
  return normalizePhoneNumber(String(value || "").replace(/^whatsapp:/, ""));
}

async function findUserIdByTwilioPhone(value) {
  let phone;
  try {
    phone = normalizeInboundNumber(value);
  } catch {
    return null;
  }

  const configs = await PhoneConfig.find({}).lean();
  for (const config of configs) {
    const safe = getSafeDecryptedSlots(config);
    if (safe.credentialErrors.personal && safe.credentialErrors.business) continue;

    for (const mode of MODES) {
      if (safe.credentialErrors[mode]) continue;
      const slot = safe.decryptedSlots[SLOT_BY_MODE[mode]];
      if (slot?.twilioPhone === phone) return String(config.userId);
    }
  }

  return null;
}

async function sendConfiguredSMS({ userId, mode, to, body }) {
  const credentials = await getTwilioCredentialsForUser(userId, mode);
  const toNumber = normalizeDestinationNumber(to);
  const messageBody = String(body || "").trim();
  if (!messageBody) throw createHttpError(400, "Message body is required.");

  const result = await getTwilioClient(credentials).messages.create({
    to: toNumber,
    from: credentials.twilioPhone,
    body: messageBody,
  });

  return {
    sid: result.sid,
    status: result.status,
    mode: credentials.mode,
    from: credentials.twilioPhone,
    fromMasked: maskPhoneNumber(credentials.twilioPhone),
    to: toNumber,
  };
}

async function sendConfiguredWhatsApp({ userId, mode, to, body }) {
  const credentials = await getTwilioCredentialsForUser(userId, mode);
  const toNumber = normalizeDestinationNumber(to);
  const messageBody = String(body || "").trim();
  if (!messageBody) throw createHttpError(400, "Message body is required.");

  const result = await getTwilioClient(credentials).messages.create({
    to: toWhatsAppAddress(toNumber),
    from: toWhatsAppAddress(credentials.twilioPhone),
    body: messageBody,
  });

  return {
    sid: result.sid,
    status: result.status,
    mode: credentials.mode,
    from: credentials.twilioPhone,
    fromMasked: maskPhoneNumber(credentials.twilioPhone),
    to: toNumber,
  };
}

module.exports = {
  buildPhoneTwiml,
  createHttpError,
  findUserIdByTwilioPhone,
  getAvailableTwilioCredentials,
  getSanitizedPhoneConfig,
  getTwilioClient,
  getTwilioCredentialsForUser,
  hasConfiguredPhoneConfig,
  makeConfiguredCall,
  maskPhoneNumber,
  normalizeDestinationNumber,
  normalizePhoneMode,
  savePhoneConfigForUser,
  setActiveModeForUser,
  sendConfiguredSMS,
  sendConfiguredWhatsApp,
  testTwilioConnection,
};
