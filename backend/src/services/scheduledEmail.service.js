// ============================================================
// Scheduled Email Service — MongoDB queue + Gmail sender
// ============================================================
const ScheduledEmail = require("../../models/mongo/ScheduledEmail");
const { pgPool } = require("../config/database");
const { sendGmail } = require("./google.service");

function addRecurrenceDate(date, recurrence) {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  if (recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

async function getUserGoogleTokens(userId) {
  const result = await pgPool.query(
    "SELECT email, gmail_tokens, gmail_connected_email FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0] || {};
  const loginEmail = String(row.email || "").toLowerCase();
  const connectedEmail = String(row.gmail_connected_email || "").toLowerCase();
  if (row.gmail_tokens && connectedEmail && loginEmail && connectedEmail !== loginEmail) {
    const err = new Error(`Connected Gmail ${connectedEmail} does not match Aura login ${loginEmail}. Reconnect Gmail with the same account.`);
    err.code = "GMAIL_ACCOUNT_MISMATCH";
    err.statusCode = 401;
    throw err;
  }
  const raw = row.gmail_tokens;
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function updateUserGmailTokens(userId, tokens) {
  if (!tokens) return;
  await pgPool.query(
    "UPDATE users SET gmail_tokens = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(tokens), userId]
  );
}

async function createScheduledEmail(userId, data) {
  return ScheduledEmail.create({
    userId,
    to: data.to,
    subject: data.subject,
    body: data.body,
    scheduledFor: data.scheduledFor,
    timezone: data.timezone || "Asia/Kolkata",
    recurrence: data.recurrence || "none",
  });
}

async function listScheduledEmails(userId) {
  return ScheduledEmail.find({ userId }).sort({ scheduledFor: 1 }).lean();
}

async function updateScheduledEmail(userId, id, updates) {
  return ScheduledEmail.findOneAndUpdate(
    { _id: id, userId, status: "pending" },
    { ...updates },
    { new: true, runValidators: true }
  ).lean();
}

async function cancelScheduledEmail(userId, id) {
  return ScheduledEmail.findOneAndUpdate(
    { _id: id, userId, status: "pending" },
    { status: "cancelled" },
    { new: true }
  ).lean();
}

async function processDueScheduledEmails() {
  const dueJobs = await ScheduledEmail.find({
    status: "pending",
    scheduledFor: { $lte: new Date() },
  }).limit(20);

  for (const job of dueJobs) {
    try {
      const tokens = await getUserGoogleTokens(job.userId);
      if (!tokens) throw new Error("Google/Gmail account is not connected.");

      await sendGmail(tokens, {
        to: job.to,
        subject: job.subject,
        body: job.body,
      }, {
        onTokens: (nextTokens) => updateUserGmailTokens(job.userId, nextTokens),
      });

      if (job.recurrence && job.recurrence !== "none") {
        job.scheduledFor = addRecurrenceDate(job.scheduledFor, job.recurrence);
        job.attempts = 0;
        job.lastError = "";
        await job.save();
      } else {
        job.status = "sent";
        job.sentAt = new Date();
        job.lastError = "";
        await job.save();
      }
    } catch (err) {
      job.attempts += 1;
      job.lastError = err.message;
      if (job.attempts >= 3) job.status = "failed";
      await job.save();
      console.error("Scheduled email failed:", { id: job.id, userId: job.userId, error: err.message });
    }
  }
}

module.exports = {
  getUserGoogleTokens,
  updateUserGmailTokens,
  createScheduledEmail,
  listScheduledEmails,
  updateScheduledEmail,
  cancelScheduledEmail,
  processDueScheduledEmails,
};
