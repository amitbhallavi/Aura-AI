// ============================================================
// Scheduler Service — Cron jobs for auto-calls and reminders
// ============================================================
const cron = require("node-cron");
const { pgPool } = require("../config/database");
const { makeConfiguredCall } = require("./phoneConfig.service");
const { processDueScheduledEmails } = require("./scheduledEmail.service");
const { emitNotification } = require("./socket.service");

// ---------------------------------------------------------------
// Every minute: check for scheduled calls that are due
// ---------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    // Find all calls scheduled for now or earlier (not yet made)
    const result = await pgPool.query(
      `SELECT * FROM calls
       WHERE status = 'scheduled'
       AND scheduled_at <= $1`,
      [now]
    );

    for (const call of result.rows) {
      console.log(`📞 Auto-dialing: ${call.contact_name || call.phone_number}`);

      try {
        // Make the actual Twilio call
        const twilioCall = await makeConfiguredCall({
          userId: call.user_id,
          mode: call.phone_mode || "personal",
          to: call.phone_number,
          message: call.message || "Hello! Yeh AURA AI assistant ka reminder hai.",
        });

        // Save Twilio SID. Twilio status callback marks completion.
        await pgPool.query(
          "UPDATE calls SET status = 'ongoing', twilio_sid = $1, updated_at = NOW() WHERE id = $2",
          [twilioCall.sid, call.id]
        );
      } catch (err) {
        // Mark as failed if Twilio call throws
        await pgPool.query(
          "UPDATE calls SET status = 'failed', updated_at = NOW() WHERE id = $1",
          [call.id]
        );
        console.error(`Call failed for ${call.phone_number}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Scheduler (calls) error:", err.message);
  }
});

// ---------------------------------------------------------------
// Every minute: check for task reminders due
// ---------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    // Find tasks with reminders due in the last minute
    const result = await pgPool.query(
      `SELECT t.*, u.email FROM tasks t
       JOIN users u ON t.user_id = u.id
       WHERE t.remind_at BETWEEN $1 AND $2
       AND t.is_done = FALSE`,
      [oneMinuteAgo, now]
    );

    for (const task of result.rows) {
      console.log(`⏰ Reminder due: "${task.title}" for user ${task.email}`);
      emitNotification(task.user_id, {
        type: "task_due",
        title: "Task due",
        message: task.title,
        data: { taskId: task.id, remindAt: task.remind_at },
      });
    }
  } catch (err) {
    console.error("Scheduler (reminders) error:", err.message);
  }
});

// ---------------------------------------------------------------
// Every day at 9 AM: send morning briefing SMS
// ---------------------------------------------------------------
cron.schedule("0 9 * * *", async () => {
  console.log("🌅 Generating morning briefings...");
  try {
    // Get all pro/enterprise users
    const result = await pgPool.query(
      "SELECT id, name, email FROM users WHERE plan IN ('pro', 'enterprise') AND is_active = TRUE"
    );

    for (const user of result.rows) {
      // Count today's tasks and calls for the user
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const callCount = await pgPool.query(
        "SELECT COUNT(*) FROM calls WHERE user_id = $1 AND scheduled_at >= $2 AND status = 'scheduled'",
        [user.id, todayStart]
      );
      const taskCount = await pgPool.query(
        "SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND is_done = FALSE",
        [user.id]
      );

      console.log(
        `📋 ${user.name}: ${callCount.rows[0].count} calls, ${taskCount.rows[0].count} tasks today`
      );
      // TODO: Send briefing via preferred channel (SMS/WhatsApp/email)
    }
  } catch (err) {
    console.error("Morning briefing error:", err.message);
  }
});

// ---------------------------------------------------------------
// Every minute: send scheduled Gmail emails that are due
// ---------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  try {
    await processDueScheduledEmails();
  } catch (err) {
    console.error("Scheduler (scheduled emails) error:", err.message);
  }
});

console.log("⏰ AURA Scheduler started — monitoring calls and reminders");
