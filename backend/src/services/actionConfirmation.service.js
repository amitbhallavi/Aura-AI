// ============================================================
// Action Confirmation Service — shared safe execution layer
// ============================================================
const crypto = require("crypto");
const VoiceCommandSession = require("../../models/mongo/VoiceCommandSession");
const { pgPool } = require("../config/database");
const { sendGmail } = require("./google.service");
const {
  getUserGoogleTokens,
  createScheduledEmail,
  cancelScheduledEmail,
} = require("./scheduledEmail.service");
const {
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require("./calendar.service");
const {
  getTwilioCredentialsForUser,
  normalizePhoneMode,
  sendConfiguredSMS,
  sendConfiguredWhatsApp,
} = require("./phoneConfig.service");
const { preserveMultilineBody } = require("../utils/textFormat");

const ACTION_TTL_MS = 15 * 60 * 1000;

async function upsertActionSession(userId, sessionId, updates = {}) {
  const safeSessionId = sessionId || crypto.randomUUID();
  return VoiceCommandSession.findOneAndUpdate(
    { userId, sessionId: safeSessionId },
    {
      $set: {
        userId,
        sessionId: safeSessionId,
        ...updates,
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();
}

async function getActionSession(userId, sessionId) {
  if (!sessionId) return null;
  return VoiceCommandSession.findOne({ userId, sessionId }).lean();
}

async function attachPendingAction({ userId, sessionId, confirmationPayload }) {
  if (!confirmationPayload) return null;
  const safeSessionId = sessionId || crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const now = Date.now();
  const payload = {
    ...confirmationPayload,
    actionId,
    sessionId: safeSessionId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ACTION_TTL_MS).toISOString(),
  };

  await upsertActionSession(userId, safeSessionId, {
    state: "awaiting_confirmation",
    pendingActionId: actionId,
    pendingActionPayload: payload,
  });

  return payload;
}

async function getCalendarTokens(userId) {
  const result = await pgPool.query("SELECT google_tokens FROM users WHERE id = $1", [userId]);
  const raw = result.rows[0]?.google_tokens;
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function persistGmailTokens(userId, tokens) {
  if (!tokens) return;
  await pgPool.query(
    "UPDATE users SET gmail_tokens = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(tokens), userId]
  );
}

function requireField(data, fieldName) {
  const value = data?.[fieldName];
  if (!String(value || "").trim()) throw new Error(`${fieldName} is required.`);
  return String(value).trim();
}

function requireMultilineField(data, fieldName) {
  const value = data?.[fieldName];
  if (!String(value || "").trim()) throw new Error(`${fieldName} is required.`);
  return preserveMultilineBody(value);
}

function normalizeTaskType(type) {
  if (["call", "message", "ai", "reminder", "general"].includes(type)) return type;
  if (["gmail", "sms", "whatsapp"].includes(type)) return "message";
  if (type === "calendar") return "reminder";
  return "general";
}

async function createRelatedTask(userId, data = {}) {
  try {
    const result = await pgPool.query(
      `INSERT INTO tasks (
        user_id, title, description, type, remind_at, source,
        related_service, related_record_id, metadata, created_by_ai
       )
       VALUES ($1, $2, $3, $4, $5, 'ai', $6, $7, $8::jsonb, TRUE)
       RETURNING *`,
      [
        userId,
        data.title || "Aura AI action",
        data.description || null,
        normalizeTaskType(data.type),
        data.scheduledAt || data.remindAt || null,
        data.relatedService || null,
        data.relatedRecordId || null,
        JSON.stringify(data.metadata || {}),
      ]
    );
    return result.rows[0];
  } catch (err) {
    console.warn("Related task create failed:", err.message);
    return null;
  }
}

async function executeConfirmedAction(userId, payload, editedData = {}) {
  const type = payload?.type;
  const data = { ...(payload?.data || {}), ...(editedData || {}) };

  switch (type) {
    case "gmail_send": {
      const tokens = await getUserGoogleTokens(userId);
      if (!tokens) throw new Error("Gmail is not connected. Connect Gmail first.");
      const result = await sendGmail(tokens, {
        to: requireField(data, "to"),
        subject: requireField(data, "subject"),
        body: requireMultilineField(data, "body"),
      }, {
        onTokens: (nextTokens) => persistGmailTokens(userId, nextTokens),
      });
      return { success: true, type, result: { messageId: result.id } };
    }
    case "gmail_schedule": {
      const scheduledFor = new Date(data.scheduledFor || data.dateTime);
      if (Number.isNaN(scheduledFor.getTime())) throw new Error("Valid scheduledFor date is required.");
      const tokens = await getUserGoogleTokens(userId);
      if (!tokens) throw new Error("Gmail is not connected. Connect Gmail first.");
      const job = await createScheduledEmail(userId, {
        to: requireField(data, "to"),
        subject: requireField(data, "subject"),
        body: requireMultilineField(data, "body"),
        scheduledFor,
        timezone: data.timezone || "Asia/Kolkata",
        recurrence: data.recurrence || "none",
      });
      const task = await createRelatedTask(userId, {
        title: `Scheduled email: ${data.subject}`,
        type: "message",
        scheduledAt: scheduledFor,
        relatedService: "gmail",
        relatedRecordId: String(job._id || ""),
        metadata: { to: data.to, subject: data.subject },
      });
      return { success: true, type, result: job, taskCreated: Boolean(task), task };
    }
    case "gmail_cancel_schedule": {
      const cancelled = await cancelScheduledEmail(userId, requireField(data, "id"));
      if (!cancelled) throw new Error("Pending scheduled email not found.");
      return { success: true, type, result: cancelled };
    }
    case "calendar_create": {
      const tokens = await getCalendarTokens(userId);
      if (!tokens) throw new Error("Calendar access is required for this action. Please connect Google Calendar first.");
      const event = await addCalendarEvent({
        tokens,
        title: requireField(data, "title"),
        startTime: requireField(data, "startTime"),
        endTime: requireField(data, "endTime"),
        description: data.description || "",
        attendees: Array.isArray(data.attendees) ? data.attendees : [],
        location: data.location || "",
      });
      const task = await createRelatedTask(userId, {
        title: `Calendar: ${data.title}`,
        type: "reminder",
        scheduledAt: data.startTime,
        relatedService: "calendar",
        relatedRecordId: event.id,
        metadata: { eventId: event.id, location: data.location },
      });
      return { success: true, type, result: event, taskCreated: Boolean(task), task };
    }
    case "calendar_update": {
      const tokens = await getCalendarTokens(userId);
      if (!tokens) throw new Error("Calendar access is required for this action. Please connect Google Calendar first.");
      const event = await updateCalendarEvent({
        tokens,
        eventId: requireField(data, "eventId"),
        updates: data,
      });
      return { success: true, type, result: event };
    }
    case "calendar_delete": {
      const tokens = await getCalendarTokens(userId);
      if (!tokens) throw new Error("Calendar access is required for this action. Please connect Google Calendar first.");
      const result = await deleteCalendarEvent({
        tokens,
        eventId: requireField(data, "eventId"),
      });
      return { success: true, type, result };
    }
    case "call_schedule": {
      const scheduledAt = new Date(data.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Valid scheduledAt date is required.");
      if (scheduledAt <= new Date()) throw new Error("Scheduled time must be in the future.");
      const selectedPhoneMode = normalizePhoneMode(data.phoneMode || data.activeMode);
      await getTwilioCredentialsForUser(userId, selectedPhoneMode);
      const result = await pgPool.query(
        `INSERT INTO calls (user_id, phone_number, contact_name, purpose, message, scheduled_at, language, phone_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          userId,
          requireField(data, "phoneNumber"),
          data.contactName || null,
          data.purpose || "general",
          data.message || "Hello! This is an automated reminder from AURA.",
          scheduledAt,
          data.language || "en",
          selectedPhoneMode,
        ]
      );
      const call = result.rows[0];
      const task = await createRelatedTask(userId, {
        title: `Scheduled call: ${data.contactName || data.phoneNumber}`,
        type: "call",
        scheduledAt,
        relatedService: "calls",
        relatedRecordId: call.id,
        metadata: { phoneNumber: data.phoneNumber, purpose: data.purpose },
      });
      return { success: true, type, result: call, taskCreated: Boolean(task), task };
    }
    case "call_cancel": {
      const result = await pgPool.query(
        `UPDATE calls SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
         RETURNING *`,
        [requireField(data, "callId"), userId]
      );
      if (!result.rows[0]) throw new Error("Scheduled call not found.");
      return { success: true, type, result: result.rows[0] };
    }
    case "sms_send":
    case "whatsapp_send": {
      const isWhatsApp = type === "whatsapp_send";
      const toNumber = requireField(data, "toNumber");
      const content = requireMultilineField(data, "content");
      const twilioMsg = isWhatsApp
        ? await sendConfiguredWhatsApp({ userId, mode: data.phoneMode || data.activeMode, to: toNumber, body: content })
        : await sendConfiguredSMS({ userId, mode: data.phoneMode || data.activeMode, to: toNumber, body: content });
      const result = await pgPool.query(
        `INSERT INTO messages (user_id, to_number, contact_name, platform, content, twilio_sid)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, toNumber, data.contactName || null, isWhatsApp ? "whatsapp" : "sms", content, twilioMsg.sid]
      );
      const message = result.rows[0];
      const task = await createRelatedTask(userId, {
        title: `${isWhatsApp ? "WhatsApp" : "SMS"} sent: ${data.contactName || toNumber}`,
        type: "message",
        relatedService: isWhatsApp ? "whatsapp" : "sms",
        relatedRecordId: message.id,
        metadata: { toNumber, content },
      });
      return { success: true, type, result: message, taskCreated: Boolean(task), task };
    }
    default:
      throw new Error("Unsupported confirmation action.");
  }
}

function getSuccessText(type) {
  const messages = {
    gmail_send: "Email sent successfully.",
    gmail_schedule: "Email scheduled successfully.",
    gmail_cancel_schedule: "Scheduled email cancelled.",
    calendar_create: "Calendar event created successfully.",
    calendar_update: "Calendar event updated successfully.",
    calendar_delete: "Calendar event deleted successfully.",
    call_schedule: "AI call scheduled successfully.",
    call_cancel: "Scheduled call cancelled.",
    sms_send: "SMS sent successfully.",
    whatsapp_send: "WhatsApp message sent successfully.",
  };
  return messages[type] || "Confirmed action completed successfully.";
}

function getSuccessType(type) {
  const types = {
    gmail_send: "email_sent",
    gmail_schedule: "email_scheduled",
    gmail_cancel_schedule: "email_schedule_cancelled",
    calendar_create: "calendar_event_created",
    calendar_update: "calendar_event_updated",
    calendar_delete: "calendar_event_deleted",
    call_schedule: "call_scheduled",
    call_cancel: "call_cancelled",
    sms_send: "message_sent",
    whatsapp_send: "message_sent",
  };
  return types[type] || "action_completed";
}

async function clearPendingAction(userId, sessionId, updates = {}) {
  await upsertActionSession(userId, sessionId, {
    state: "completed",
    pendingActionId: "",
    pendingActionPayload: null,
    ...updates,
  });
}

async function confirmPendingAction({ userId, sessionId, actionId, decision, editedData }) {
  const session = await getActionSession(userId, sessionId);
  if (!session?.pendingActionId || session.pendingActionId !== actionId) {
    const err = new Error("Pending action was not found or has expired.");
    err.statusCode = 404;
    throw err;
  }

  const payload = session.pendingActionPayload;
  if (payload?.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    await clearPendingAction(userId, sessionId);
    const err = new Error("Pending action expired. Prepare the action again and confirm it.");
    err.statusCode = 410;
    throw err;
  }

  if (decision !== "confirm") {
    await clearPendingAction(userId, sessionId);
    return {
      success: true,
      cancelled: true,
      successType: "action_cancelled",
      successMessage: "Action cancelled.",
      finalText: "Action cancelled. Kuch bhi change nahi kiya gaya.",
      spokenText: "Action cancel kar diya.",
    };
  }

  const result = await executeConfirmedAction(userId, payload, editedData);
  await clearPendingAction(userId, sessionId, { lastToolResult: result });
  const successMessage = getSuccessText(result.type);

  return {
    ...result,
    successType: getSuccessType(result.type),
    successMessage,
    createdTask: result.task || result.createdTask || null,
    relatedRecord: result.result || null,
    finalText: successMessage,
    spokenText: result.type?.startsWith("gmail")
      ? "Email action complete ho gaya."
      : "Action complete ho gaya.",
  };
}

module.exports = {
  attachPendingAction,
  confirmPendingAction,
  executeConfirmedAction,
};
