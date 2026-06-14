// ============================================================
// Google Calendar Service — Add/View events
// ============================================================
const { google } = require("googleapis");

function getCalendarOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.CALENDAR_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error("Google Calendar OAuth is not configured. Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and CALENDAR_REDIRECT_URI or GOOGLE_REDIRECT_URI.");
    err.code = "CALENDAR_OAUTH_CONFIG_MISSING";
    err.statusCode = 500;
    throw err;
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

function getCalendar(tokens) {
  const auth = getCalendarOAuthClient();
  auth.setCredentials(tokens);
  return google.calendar({ version: "v3", auth });
}

// ---------------------------------------------------------------
// Get Google OAuth login URL
// ---------------------------------------------------------------
function getAuthUrl(userId) {
  const oauth2Client = getCalendarOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state: userId,
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });
}

// ---------------------------------------------------------------
// Exchange code for tokens
// ---------------------------------------------------------------
async function getTokens(code) {
  const oauth2Client = getCalendarOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// ---------------------------------------------------------------
// Add event to Google Calendar
// ---------------------------------------------------------------
async function addCalendarEvent({ tokens, title, description, startTime, endTime, attendees = [], location = "", createMeet = false }) {
  const calendar = getCalendar(tokens);

  const event = {
    summary: title,
    description,
    location,
    start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
    end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
    attendees: attendees.map((email) => ({ email })),
  };

  if (createMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `aura-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
    conferenceDataVersion: createMeet ? 1 : 0,
  });

  return res.data;
}

// ---------------------------------------------------------------
// Get upcoming events
// ---------------------------------------------------------------
async function getUpcomingEvents(tokens, { startDate, endDate, maxResults = 10 } = {}) {
  const calendar = getCalendar(tokens);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startDate || new Date().toISOString(),
    timeMax: endDate,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items;
}

async function updateCalendarEvent({ tokens, eventId, updates }) {
  const calendar = getCalendar(tokens);
  const patch = {};

  if (updates.title) patch.summary = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.startTime) patch.start = { dateTime: updates.startTime, timeZone: "Asia/Kolkata" };
  if (updates.endTime) patch.end = { dateTime: updates.endTime, timeZone: "Asia/Kolkata" };
  if (Array.isArray(updates.attendees)) patch.attendees = updates.attendees.map((email) => ({ email }));

  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    resource: patch,
  });

  return res.data;
}

async function deleteCalendarEvent({ tokens, eventId }) {
  const calendar = getCalendar(tokens);
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
  return { id: eventId, deleted: true };
}

module.exports = {
  getAuthUrl,
  getTokens,
  addCalendarEvent,
  getUpcomingEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
};
