// ============================================================
// Caller ID Service - Twilio verified outbound caller IDs
// ============================================================
const PhoneConfig = require("../../models/mongo/PhoneConfig");
const {
  createHttpError,
  getAvailableTwilioCredentials,
  getTwilioClient,
  getTwilioCredentialsForUser,
  maskPhoneNumber,
  normalizeDestinationNumber,
} = require("./phoneConfig.service");

function normalizeCallerSid(value) {
  const sid = String(value || "").trim();
  if (!sid) return "";
  if (!/^PN[a-zA-Z0-9]{20,40}$/.test(sid)) {
    throw createHttpError(400, "Caller ID SID must look like PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.");
  }
  return sid;
}

function sanitizeNumber(item = {}) {
  const number = item.number || item.phoneNumber || "";
  return {
    number,
    numberMasked: maskPhoneNumber(number),
    sid: item.sid || "",
    friendlyName: item.friendlyName || item.friendly_name || "Personal Number",
    status: item.status || "verified",
    phoneMode: item.phoneMode || "personal",
    twilioAccountSid: item.twilioAccountSid || item.accountSid || item.account_sid || "",
    verifiedAt: item.verifiedAt || null,
  };
}

function toPlainItem(item) {
  return item?.toObject ? item.toObject() : item;
}

function sanitizeConfig(config) {
  const verifiedNumbers = (config?.verifiedCallerIds || []).map(sanitizeNumber);
  const activeCallerId = config?.activeCallerId || "";
  return {
    activeCallerId,
    activeCallerIdMasked: activeCallerId ? maskPhoneNumber(activeCallerId) : "",
    verifiedCallerIds: verifiedNumbers,
    verifiedNumbers,
  };
}

async function getOrCreateConfig(userId) {
  if (!userId) throw createHttpError(401, "Login is required.");
  return PhoneConfig.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, verifiedCallerIds: [], activeCallerId: "" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function upsertNumberEntry(config, entry) {
  const numbers = Array.isArray(config.verifiedCallerIds) ? [...config.verifiedCallerIds] : [];
  const index = numbers.findIndex((item) => item.number === entry.number && item.twilioAccountSid === entry.twilioAccountSid);
  if (index >= 0) {
    numbers[index] = { ...toPlainItem(numbers[index]), ...entry };
  } else {
    numbers.push(entry);
  }
  return numbers;
}

function mergeTwilioNumbers(existingNumbers, twilioNumbers, credentials) {
  let merged = [...existingNumbers];

  for (const item of twilioNumbers) {
    const number = item.phoneNumber;
    const entry = {
      number,
      sid: item.sid,
      friendlyName: item.friendlyName || "Personal Number",
      status: "verified",
      phoneMode: credentials.mode,
      twilioAccountSid: credentials.twilioSid,
      validationCode: "",
      callSid: "",
      verifiedAt: new Date(),
    };
    const index = merged.findIndex((saved) => saved.number === number && saved.twilioAccountSid === credentials.twilioSid);
    if (index >= 0) merged[index] = { ...merged[index], ...entry };
    else merged.push(entry);
  }

  return merged;
}

async function addCallerId(userId, phoneNumber, friendlyName = "Personal Number", mode) {
  const normalizedNumber = normalizeDestinationNumber(phoneNumber);
  const credentials = await getTwilioCredentialsForUser(userId, mode);
  const client = getTwilioClient(credentials);
  const config = await getOrCreateConfig(userId);

  const validationRequest = await client.validationRequests.create({
    phoneNumber: normalizedNumber,
    friendlyName: String(friendlyName || "Personal Number").slice(0, 64),
  });

  const entry = {
    number: normalizedNumber,
    sid: "",
    friendlyName: validationRequest.friendlyName || friendlyName || "Personal Number",
    status: "pending",
    phoneMode: credentials.mode,
    twilioAccountSid: credentials.twilioSid,
    validationCode: validationRequest.validationCode || "",
    callSid: validationRequest.callSid || "",
    verifiedAt: null,
  };

  config.verifiedCallerIds = upsertNumberEntry(config, entry);
  await config.save();

  return {
    ...sanitizeConfig(config),
    pendingNumber: {
      ...sanitizeNumber(entry),
      validationCode: entry.validationCode,
      callSid: entry.callSid,
    },
  };
}

async function verifyCallerId(userId, phoneNumber) {
  const normalizedNumber = normalizeDestinationNumber(phoneNumber);
  const config = await getOrCreateConfig(userId);
  const pending = [...(config.verifiedCallerIds || [])]
    .reverse()
    .find((item) => item.number === normalizedNumber);

  if (!pending) {
    throw createHttpError(404, "Caller ID request not found for this number.");
  }

  const credentials = await getTwilioCredentialsForUser(userId, pending.phoneMode);
  const callerIds = await getTwilioClient(credentials).outgoingCallerIds.list({
    phoneNumber: pending.number,
    limit: 20,
  });
  const verified = callerIds.find((item) => item.phoneNumber === pending.number);

  if (!verified) {
    throw createHttpError(
      409,
      "Twilio has not verified this number yet. Enter the validation code during the Twilio call, then try again.",
      "CALLER_ID_STILL_PENDING"
    );
  }

  const numbers = (config.verifiedCallerIds || []).map((item) => {
    if (item.number !== pending.number || item.twilioAccountSid !== credentials.twilioSid) return item;
    return {
      ...toPlainItem(item),
      sid: verified.sid,
      friendlyName: verified.friendlyName || item.friendlyName || "Personal Number",
      status: "verified",
      validationCode: "",
      verifiedAt: new Date(),
    };
  });

  config.verifiedCallerIds = numbers;
  await config.save();
  return sanitizeConfig(config);
}

async function listCallerIds(userId) {
  const config = await getOrCreateConfig(userId);
  const credentialsList = await getAvailableTwilioCredentials(userId);

  let numbers = Array.isArray(config.verifiedCallerIds)
    ? config.verifiedCallerIds.map(toPlainItem)
    : [];

  for (const credentials of credentialsList) {
    const callerIds = await getTwilioClient(credentials).outgoingCallerIds.list({ limit: 100 });
    numbers = mergeTwilioNumbers(numbers, callerIds, credentials);
  }

  config.verifiedCallerIds = numbers;
  if (config.activeCallerId && !numbers.some((item) => item.number === config.activeCallerId && item.status === "verified")) {
    config.activeCallerId = "";
  }
  await config.save();

  return sanitizeConfig(config);
}

async function removeCallerId(userId, callerIdSid, phoneNumber) {
  const sid = callerIdSid ? normalizeCallerSid(callerIdSid) : "";
  const normalizedNumber = phoneNumber ? normalizeDestinationNumber(phoneNumber) : "";
  if (!sid && !normalizedNumber) {
    throw createHttpError(400, "callerIdSid or phoneNumber is required.");
  }

  const config = await getOrCreateConfig(userId);
  const existing = (config.verifiedCallerIds || []).find((item) => {
    if (sid && item.sid === sid) return true;
    if (normalizedNumber && item.number === normalizedNumber) return true;
    return false;
  });

  if (sid) {
    const credentials = existing?.phoneMode
      ? await getTwilioCredentialsForUser(userId, existing.phoneMode)
      : await getTwilioCredentialsForUser(userId);
    await getTwilioClient(credentials).outgoingCallerIds(sid).remove();
  }

  config.verifiedCallerIds = (config.verifiedCallerIds || []).filter((item) => {
    if (sid && item.sid === sid) return false;
    if (normalizedNumber && item.number === normalizedNumber) return false;
    return true;
  });

  if (existing?.number && config.activeCallerId === existing.number) {
    config.activeCallerId = "";
  }
  if (normalizedNumber && config.activeCallerId === normalizedNumber) {
    config.activeCallerId = "";
  }

  await config.save();
  return sanitizeConfig(config);
}

async function setActiveCallerId(userId, phoneNumber) {
  const normalizedNumber = normalizeDestinationNumber(phoneNumber);
  const config = await getOrCreateConfig(userId);
  let record = (config.verifiedCallerIds || []).find((item) => item.number === normalizedNumber);

  if (!record || record.status !== "verified") {
    await listCallerIds(userId);
    const refreshed = await getOrCreateConfig(userId);
    record = (refreshed.verifiedCallerIds || []).find((item) => item.number === normalizedNumber);
    config.verifiedCallerIds = refreshed.verifiedCallerIds;
  }

  if (!record || record.status !== "verified") {
    throw createHttpError(400, "Verify this number first before setting active.", "CALLER_ID_NOT_VERIFIED");
  }

  config.activeCallerId = normalizedNumber;
  await config.save();
  return sanitizeConfig(config);
}

async function getActiveCallerIdForUser(userId, credentials) {
  if (!userId) return "";
  const config = await PhoneConfig.findOne({ userId }).lean();
  const activeCallerId = config?.activeCallerId;
  if (!activeCallerId) return "";

  const verified = (config.verifiedCallerIds || []).find((item) => (
    item.number === activeCallerId &&
    item.status === "verified" &&
    (!item.twilioAccountSid || !credentials?.twilioSid || item.twilioAccountSid === credentials.twilioSid)
  ));

  return verified ? activeCallerId : "";
}

module.exports = {
  addCallerId,
  getActiveCallerIdForUser,
  listCallerIds,
  removeCallerId,
  setActiveCallerId,
  verifyCallerId,
};
