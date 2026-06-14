// ============================================================
// AI Tool Registry — Gemini function declarations + safe execution
// ============================================================
const { SchemaType } = require("@google/generative-ai");
const {
  searchNearbyPlaces,
  searchPlacesByText,
  getPlaceDetails,
  draftGmailEmail,
} = require("./google.service");
const { chat: fallbackChat } = require("./openai.service");
const {
  listScheduledEmails,
} = require("./scheduledEmail.service");
const {
  getUpcomingEvents,
} = require("./calendar.service");
const { pgPool } = require("../config/database");
const { getConnectionStatus, getConnectInstruction } = require("./connection.service");
const { preserveMultilineBody, safeTrimSingleLine } = require("../utils/textFormat");

const TASK_TYPES = new Set(["general", "call", "message", "ai", "reminder"]);

async function getUserCalendarTokens(userId) {
  const result = await pgPool.query("SELECT google_tokens FROM users WHERE id = $1", [userId]);
  const raw = result.rows[0]?.google_tokens;
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function stringProperty(description) {
  return { type: SchemaType.STRING, description };
}

function numberProperty(description) {
  return { type: SchemaType.NUMBER, description };
}

function arrayOfStrings(description) {
  return {
    type: SchemaType.ARRAY,
    description,
    items: { type: SchemaType.STRING },
  };
}

function requireString(value, fieldName) {
  if (!String(value || "").trim()) throw new Error(`${fieldName} is required.`);
  return String(value).trim();
}

function requireMultiline(value, fieldName) {
  if (!String(value || "").trim()) throw new Error(`${fieldName} is required.`);
  return preserveMultilineBody(value);
}

function requireEmail(value, fieldName = "Recipient email") {
  const email = requireString(value, fieldName);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${fieldName} is invalid.`);
  return email;
}

function normalizeAttendees(attendees) {
  if (!Array.isArray(attendees)) return [];
  return attendees.filter(Boolean).map((email) => String(email).trim()).filter(Boolean);
}

function normalizeTaskType(type) {
  const normalized = String(type || "general").toLowerCase();
  if (normalized === "email" || normalized === "sms" || normalized === "whatsapp") return "message";
  if (normalized === "calendar") return "reminder";
  return TASK_TYPES.has(normalized) ? normalized : "general";
}

function requirePhone(value, fieldName = "Phone number") {
  const phone = requireString(value, fieldName);
  if (!/^\+?[0-9][0-9\s\-()]{7,20}$/.test(phone)) throw new Error(`${fieldName} is invalid.`);
  return phone.replace(/[()\s-]/g, "");
}

function fallbackPlan(userMessage) {
  const text = String(userMessage || "").toLowerCase();
  const plan = ["Understand the request", "Check required information"];
  if (/nearby|aas paas|gym|shop|cafe|hospital|restaurant/.test(text)) plan.push("Search nearby places");
  if (/email|mail/.test(text)) plan.push("Draft or prepare email action");
  if (/calendar|meeting|reminder|event/.test(text)) plan.push("Prepare calendar action");
  plan.push("Ask confirmation before sensitive changes");
  plan.push("Give final result and next step");
  return plan;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

const functionDeclarations = [
  {
    name: "getConnectionStatus",
    description: "Check connected/disconnected status for AI provider, Gmail, Calendar, Maps, Twilio SMS, WhatsApp, AI Calls, STT and TTS.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "connectService",
    description: "Prepare a UI action for connecting a service such as Gmail or Google Calendar, or explain env setup for API-key based services.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        serviceName: stringProperty("Service name such as gmail, calendar, maps, sms, whatsapp, calls, voice."),
      },
      required: ["serviceName"],
    },
  },
  {
    name: "explainDisconnectedService",
    description: "Explain why a disconnected service is unavailable and what setup is required.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        serviceName: stringProperty("Service name such as gmail, calendar, maps, sms, whatsapp, calls, voice."),
      },
      required: ["serviceName"],
    },
  },
  {
    name: "searchNearbyPlaces",
    description: "Search nearby places using Google Places when the user asks for gyms, shops, cafes, hospitals, restaurants or other places near them.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: stringProperty("Place category or search query, for example gym, cafe, hospital, restaurant."),
        latitude: numberProperty("User latitude."),
        longitude: numberProperty("User longitude."),
        radius: numberProperty("Search radius in meters. Default 3000."),
        locationText: stringProperty("Manual city or area if browser latitude/longitude is unavailable."),
      },
      required: ["query"],
    },
  },
  {
    name: "getPlaceDetails",
    description: "Get full details for a Google Place by placeId.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { placeId: stringProperty("Google Place ID.") },
      required: ["placeId"],
    },
  },
  {
    name: "createCalendarEvent",
    description: "Prepare a Google Calendar event. Confirmation is required before the event is actually created.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: stringProperty("Event title."),
        startTime: stringProperty("Event start time as ISO date string."),
        endTime: stringProperty("Event end time as ISO date string."),
        description: stringProperty("Event description."),
        attendees: arrayOfStrings("Attendee email addresses."),
        location: stringProperty("Optional event location."),
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "listCalendarEvents",
    description: "List Google Calendar events for a date range.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: stringProperty("Start date/time as ISO string."),
        endDate: stringProperty("End date/time as ISO string."),
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "updateCalendarEvent",
    description: "Prepare a Google Calendar event update. Confirmation is required before update.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        eventId: stringProperty("Google Calendar event ID."),
        title: stringProperty("Updated title."),
        startTime: stringProperty("Updated start time as ISO string."),
        endTime: stringProperty("Updated end time as ISO string."),
        description: stringProperty("Updated description."),
        attendees: arrayOfStrings("Updated attendee email addresses."),
      },
      required: ["eventId"],
    },
  },
  {
    name: "deleteCalendarEvent",
    description: "Prepare deletion of a Google Calendar event. Confirmation is required before delete.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { eventId: stringProperty("Google Calendar event ID.") },
      required: ["eventId"],
    },
  },
  {
    name: "draftGmailEmail",
    description: "Draft an email from the user's request. Does not send email.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: stringProperty("Recipient email address."),
        subject: stringProperty("Email subject."),
        body: stringProperty("Email body."),
        tone: stringProperty("Email tone such as professional, friendly, concise or formal."),
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "sendGmailEmail",
    description: "Prepare Gmail send action. Confirmation is required before the email is actually sent.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: stringProperty("Recipient email address."),
        subject: stringProperty("Email subject."),
        body: stringProperty("Email body."),
        tone: stringProperty("Email tone such as professional, friendly, concise or formal."),
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "scheduleGmailEmail",
    description: "Prepare a scheduled email job. Confirmation is required before scheduling.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        to: stringProperty("Recipient email address."),
        subject: stringProperty("Email subject."),
        body: stringProperty("Email body."),
        dateTime: stringProperty("Scheduled send date/time as ISO string."),
        timezone: stringProperty("IANA timezone, for example Asia/Kolkata."),
        recurrence: stringProperty("none, daily, weekly or monthly."),
      },
      required: ["to", "subject", "body", "dateTime"],
    },
  },
  {
    name: "listScheduledEmails",
    description: "List the user's scheduled email jobs.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "cancelScheduledEmail",
    description: "Prepare cancellation of a scheduled email job. Confirmation is required before cancellation.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { id: stringProperty("Scheduled email job ID.") },
      required: ["id"],
    },
  },
  {
    name: "explainStepByStep",
    description: "Explain a topic with examples, why it matters, and common mistakes to avoid.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        topic: stringProperty("Topic or concept to explain."),
        mode: stringProperty("Optional explanation mode such as normal or deep."),
      },
      required: ["topic"],
    },
  },
  {
    name: "createTaskPlan",
    description: "Create a safe multi-step plan for the user's request.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userMessage: stringProperty("The user's original request."),
      },
      required: ["userMessage"],
    },
  },
  {
    name: "summarizeToolResult",
    description: "Summarize a tool result into a short user-friendly summary.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        toolResult: stringProperty("The raw tool output or JSON string."),
      },
      required: ["toolResult"],
    },
  },
  {
    name: "createTask",
    description: "Create a task/reminder in Aura Tasks. Use for task section commands and records related to AI actions.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: stringProperty("Task title."),
        type: stringProperty("general, call, message, ai, reminder."),
        remindAt: stringProperty("Optional reminder date/time as ISO string."),
        relatedService: stringProperty("Optional related service such as gmail, calendar, sms, whatsapp, calls, maps."),
      },
      required: ["title"],
    },
  },
  {
    name: "listTasks",
    description: "List Aura tasks/reminders.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filter: stringProperty("all, pending or done."),
      },
    },
  },
  {
    name: "completeTask",
    description: "Mark a task complete by ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        taskId: stringProperty("Task ID."),
      },
      required: ["taskId"],
    },
  },
  {
    name: "scheduleAICall",
    description: "Prepare scheduling an AI call. Confirmation is required before creating the call.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phoneNumber: stringProperty("Phone number with country code."),
        contactName: stringProperty("Contact name."),
        purpose: stringProperty("general, sales, support, reminder, follow_up."),
        scheduledAt: stringProperty("Scheduled date/time as ISO string."),
        message: stringProperty("Message AI will read."),
      },
      required: ["phoneNumber", "scheduledAt"],
    },
  },
  {
    name: "listScheduledCalls",
    description: "List scheduled AI calls.",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "cancelScheduledCall",
    description: "Prepare cancellation of a scheduled AI call. Confirmation is required before cancelling.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { callId: stringProperty("Call ID.") },
      required: ["callId"],
    },
  },
  {
    name: "sendSMS",
    description: "Prepare sending an SMS. Confirmation is required before sending.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phoneNumber: stringProperty("Phone number with country code."),
        message: stringProperty("SMS content."),
        contactName: stringProperty("Contact name."),
      },
      required: ["phoneNumber", "message"],
    },
  },
  {
    name: "sendWhatsApp",
    description: "Prepare sending a WhatsApp message through Twilio. Confirmation is required before sending.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phoneNumber: stringProperty("Phone number with country code."),
        message: stringProperty("WhatsApp message content."),
        contactName: stringProperty("Contact name."),
      },
      required: ["phoneNumber", "message"],
    },
  },
  {
    name: "generatePrompt",
    description: "Generate a professional prompt for Codex, ChatGPT, Gemini, Cursor, Bolt or another AI tool.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userGoal: stringProperty("What the user wants the prompt to achieve."),
        targetTool: stringProperty("Target AI tool, for example Codex, ChatGPT, Gemini, Cursor or Bolt."),
        tone: stringProperty("Tone such as professional, direct, detailed, concise."),
        constraints: stringProperty("Constraints to include in the prompt."),
      },
      required: ["userGoal"],
    },
  },
  {
    name: "fillCurrentPageForm",
    description: "Prepare safe UI form fill for the current page. The frontend applies allowed fields only and does not submit automatically.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        page: stringProperty("Current page path, for example /calls, /messages, /tasks, /chat, /pricing."),
        fields: stringProperty("JSON object string of form fields and values to fill."),
      },
      required: ["page", "fields"],
    },
  },
];

function confirmation(type, title, data) {
  const routes = {
    gmail_send: { method: "POST", path: "/gmail/send" },
    gmail_schedule: { method: "POST", path: "/gmail/schedule" },
    gmail_cancel_schedule: { method: "DELETE", path: `/gmail/scheduled/${data.id}` },
    calendar_create: { method: "POST", path: "/calendar/events" },
    calendar_update: { method: "PUT", path: `/calendar/events/${data.eventId}` },
    calendar_delete: { method: "DELETE", path: `/calendar/events/${data.eventId}` },
    call_schedule: { method: "POST", path: "/calls/schedule" },
    call_cancel: { method: "PATCH", path: `/calls/${data.callId}/cancel` },
    sms_send: { method: "POST", path: "/messages/sms" },
    whatsapp_send: { method: "POST", path: "/messages/whatsapp" },
    plan_change: { method: "POST", path: "/payments/create-order" },
  };

  return {
    actionRequired: true,
    confirmationPayload: {
      type,
      title,
      method: routes[type].method,
      path: routes[type].path,
      data,
    },
    result: { status: "confirmation_required", type, data },
  };
}

async function executeTool({ name, args = {}, userId }) {
  switch (name) {
    case "getConnectionStatus": {
      const status = await getConnectionStatus(userId);
      return {
        result: { services: status },
        cards: { type: "connections", items: Object.entries(status).map(([key, value]) => ({ key, ...value })) },
      };
    }
    case "connectService": {
      const serviceName = requireString(args.serviceName, "Service name");
      const instruction = getConnectInstruction(serviceName);
      return {
        result: {
          serviceName,
          message: instruction.text,
          uiAction: instruction.uiAction,
        },
        uiAction: instruction.uiAction || { type: "show_toast", message: instruction.text, level: "info" },
        cards: { type: "connections", items: [{ key: serviceName, label: serviceName, status: "connect_requested", explanation: instruction.text }] },
      };
    }
    case "explainDisconnectedService": {
      const serviceName = requireString(args.serviceName, "Service name");
      const instruction = getConnectInstruction(serviceName);
      return {
        result: { serviceName, explanation: instruction.text },
        cards: { type: "connections", items: [{ key: serviceName, label: serviceName, status: "setup_needed", explanation: instruction.text }] },
      };
    }
    case "searchNearbyPlaces": {
      requireString(args.query, "Search query");
      const places = args.latitude != null && args.longitude != null
        ? await searchNearbyPlaces(args)
        : await searchPlacesByText({ query: args.query, locationText: args.locationText });
      const locationLabel = args.locationText || (args.latitude != null && args.longitude != null ? "your current location" : "");
      return {
        result: {
          type: "location_results",
          query: args.query,
          locationLabel,
          places,
          summary: `${places.length} places found for ${args.query}${locationLabel ? ` near ${locationLabel}` : ""}.`,
          suggestedActions: ["Add reminder", "Show directions", "Save first place", "Search open now"],
        },
        cards: { type: "location_results", query: args.query, locationLabel, items: places },
      };
    }
    case "getPlaceDetails": {
      requireString(args.placeId, "Place ID");
      const place = await getPlaceDetails(args.placeId);
      return {
        result: place,
        cards: { type: "places", items: [place] },
      };
    }
    case "listCalendarEvents": {
      const tokens = await getUserCalendarTokens(userId);
      if (!tokens) throw new Error("Google Calendar is not connected.");
      const events = await getUpcomingEvents(tokens, args);
      return {
        result: { events },
        cards: { type: "calendar", items: events },
      };
    }
    case "createCalendarEvent":
      return confirmation("calendar_create", "Create calendar event?", {
        title: requireString(args.title, "Event title"),
        startTime: requireString(args.startTime, "Event start time"),
        endTime: requireString(args.endTime, "Event end time"),
        description: args.description || "",
        attendees: normalizeAttendees(args.attendees),
        location: args.location || "",
        source: "ai",
        createdByAI: true,
      });
    case "updateCalendarEvent":
      return confirmation("calendar_update", "Update calendar event?", {
        eventId: requireString(args.eventId, "Calendar event ID"),
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime,
        description: args.description,
        attendees: normalizeAttendees(args.attendees),
      });
    case "deleteCalendarEvent":
      return confirmation("calendar_delete", "Delete calendar event?", { eventId: requireString(args.eventId, "Calendar event ID") });
    case "draftGmailEmail": {
      const draft = draftGmailEmail({
        to: requireEmail(args.to),
        subject: safeTrimSingleLine(requireString(args.subject, "Email subject")),
        body: requireMultiline(args.body, "Email body"),
        tone: safeTrimSingleLine(args.tone || "professional"),
      });
      return {
        result: draft,
        cards: { type: "emailDraft", items: [draft.preview] },
      };
    }
    case "sendGmailEmail":
      return confirmation("gmail_send", "Send this email?", {
        to: requireEmail(args.to),
        subject: safeTrimSingleLine(requireString(args.subject, "Email subject")),
        body: requireMultiline(args.body, "Email body"),
        source: "ai",
        createdByAI: true,
      });
    case "scheduleGmailEmail":
      return confirmation("gmail_schedule", "Schedule this email?", {
        to: requireEmail(args.to),
        subject: safeTrimSingleLine(requireString(args.subject, "Email subject")),
        body: requireMultiline(args.body, "Email body"),
        scheduledFor: requireString(args.dateTime, "Scheduled date/time"),
        timezone: args.timezone || "Asia/Kolkata",
        recurrence: args.recurrence || "none",
        source: "ai",
        createdByAI: true,
      });
    case "listScheduledEmails": {
      const emails = await listScheduledEmails(userId);
      return {
        result: { scheduledEmails: emails },
        cards: { type: "scheduledEmails", items: emails },
      };
    }
    case "cancelScheduledEmail":
      return confirmation("gmail_cancel_schedule", "Cancel scheduled email?", { id: requireString(args.id, "Scheduled email ID") });
    case "explainStepByStep": {
      const prompt = `Explain this topic step by step with examples, why it matters, common mistakes, and next actions. Keep it useful but under 900 words:\n\n${args.topic}${args.mode ? `\n\nMode: ${args.mode}` : ""}`;
      let explanation;
      try {
        explanation = await withTimeout(fallbackChat(userId, prompt), 12000, "Explanation fallback AI");
      } catch {
        explanation = `Summary: ${args.topic}\n\n1. Start with the basic idea.\n2. Look at a simple example.\n3. Connect it to a real use case.\n4. Avoid common mistakes.\n\nNext step: Share the exact context or code where you want to use it.`;
      }
      return {
        result: { explanation },
        cards: { type: "explanation", items: [{ topic: args.topic, explanation }] },
      };
    }
    case "createTaskPlan": {
      const prompt = `Create a clear multi-step task plan for this request. Keep the steps short, actionable, and ordered:\n\n${args.userMessage}`;
      let planText;
      try {
        planText = await withTimeout(fallbackChat(userId, prompt), 12000, "Task plan fallback AI");
      } catch {
        planText = fallbackPlan(args.userMessage).join("\n");
      }
      const plan = String(planText || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line)
        .map((line) => line.replace(/^\d+[\).\-]?\s*/, ""));
      return {
        result: { plan },
        cards: { type: "taskPlan", items: plan.map((step) => ({ step })) },
      };
    }
    case "summarizeToolResult": {
      const prompt = `Summarize this tool result in a user-friendly paragraph with a final recommendation:\n\n${typeof args.toolResult === "string" ? args.toolResult : JSON.stringify(args.toolResult)}`;
      let summary;
      try {
        summary = await withTimeout(fallbackChat(userId, prompt), 12000, "Summary fallback AI");
      } catch {
        summary = "Tool result received. Review the result cards and choose the next action.";
      }
      return {
        result: { summary },
        cards: { type: "summary", items: [{ summary }] },
      };
    }
    case "createTask": {
      const result = await pgPool.query(
        `INSERT INTO tasks (
          user_id, title, type, remind_at, source, related_service, metadata, created_by_ai
         )
         VALUES ($1, $2, $3, $4, 'ai', $5, $6::jsonb, TRUE) RETURNING *`,
        [
          userId,
          requireString(args.title, "Task title"),
          normalizeTaskType(args.type),
          args.remindAt || null,
          args.relatedService || null,
          JSON.stringify({ sourceTool: "createTask", ...(args.metadata || {}) }),
        ]
      );
      return {
        result: { task: result.rows[0], taskCreated: true },
        cards: { type: "tasks", items: result.rows },
      };
    }
    case "listTasks": {
      const filter = String(args.filter || "all").toLowerCase();
      let query = "SELECT * FROM tasks WHERE user_id = $1";
      const params = [userId];
      if (filter === "pending") query += " AND is_done = FALSE";
      if (filter === "done") query += " AND is_done = TRUE";
      query += " ORDER BY created_at DESC LIMIT 20";
      const result = await pgPool.query(query, params);
      return {
        result: { tasks: result.rows },
        cards: { type: "tasks", items: result.rows },
      };
    }
    case "completeTask": {
      const taskId = requireString(args.taskId, "Task ID");
      const result = await pgPool.query(
        "UPDATE tasks SET is_done = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
        [taskId, userId]
      );
      if (!result.rows[0]) throw new Error("Task not found.");
      return {
        result: { task: result.rows[0] },
        cards: { type: "tasks", items: result.rows },
      };
    }
    case "scheduleAICall":
      return confirmation("call_schedule", "Schedule this AI call?", {
        phoneNumber: requirePhone(args.phoneNumber),
        contactName: args.contactName || "",
        purpose: args.purpose || "general",
        scheduledAt: requireString(args.scheduledAt, "Scheduled date/time"),
        message: args.message || "Hello! This is an automated reminder from AURA.",
        language: args.language || "en",
        source: "ai",
        createdByAI: true,
      });
    case "listScheduledCalls": {
      const result = await pgPool.query(
        "SELECT * FROM calls WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT 20",
        [userId]
      );
      return {
        result: { calls: result.rows },
        cards: { type: "calls", items: result.rows },
      };
    }
    case "cancelScheduledCall":
      return confirmation("call_cancel", "Cancel this scheduled call?", { callId: requireString(args.callId, "Call ID") });
    case "sendSMS":
      return confirmation("sms_send", "Send this SMS?", {
        toNumber: requirePhone(args.phoneNumber),
        contactName: args.contactName || "",
        content: requireMultiline(args.message, "Message"),
        source: "ai",
        createdByAI: true,
      });
    case "sendWhatsApp":
      return confirmation("whatsapp_send", "Send this WhatsApp message?", {
        toNumber: requirePhone(args.phoneNumber),
        contactName: args.contactName || "",
        content: requireMultiline(args.message, "Message"),
        source: "ai",
        createdByAI: true,
      });
    case "generatePrompt": {
      const prompt = [
        `You are using ${args.targetTool || "an AI tool"}.`,
        `Goal: ${requireString(args.userGoal, "User goal")}`,
        args.tone ? `Tone: ${args.tone}` : "Tone: clear, direct, production-ready.",
        args.constraints ? `Constraints: ${args.constraints}` : "Constraints: ask only necessary questions, produce actionable output, avoid vague advice.",
        "Output format: clear steps, exact files/actions if coding, testing checklist, known limits.",
      ].join("\n");
      return {
        result: { prompt },
        uiAction: { type: "fill_chat_input", value: prompt },
        cards: { type: "prompt", items: [{ prompt, targetTool: args.targetTool || "AI tool" }] },
      };
    }
    case "fillCurrentPageForm":
      {
        let fields = args.fields || {};
        if (typeof fields === "string") {
          try {
            fields = JSON.parse(fields);
          } catch {
            fields = {};
          }
        }
        return {
          result: {
            page: args.page,
            fields,
            message: "Form fill prepared. Review before submitting.",
          },
          formFill: {
            page: args.page,
            fields,
          },
        };
      }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = {
  functionDeclarations,
  executeTool,
};
