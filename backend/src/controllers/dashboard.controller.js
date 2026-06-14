const { pgPool } = require("../config/database");
const ChatLog = require("../../models/mongo/ChatLog");
const { getMockStats, isPostgresAvailable } = require("../services/database.service");

async function getDashboardStats(req, res) {
  const userId = req.user.id;
  try {
    // Check if PostgreSQL is available
    let isDbAvailable = true;
    try {
      await pgPool.query("SELECT 1");
    } catch (err) {
      isDbAvailable = false;
    }

    // In development, use mock stats if PostgreSQL is unavailable
    if (!isDbAvailable && process.env.NODE_ENV === "development") {
      console.warn("⚠️  [DEV MODE] PostgreSQL unavailable - using mock stats");
      return res.json(getMockStats());
    }

    // If production and PostgreSQL fails, return error
    if (!isDbAvailable) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    // Safe parallel queries with individual error handling
    const queries = [
      pgPool.query("SELECT COUNT(*) FROM calls WHERE user_id = $1", [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      pgPool.query("SELECT COUNT(*) FROM tasks WHERE user_id = $1", [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      pgPool.query("SELECT COUNT(*) FROM messages WHERE user_id = $1", [userId]).catch(() => ({ rows: [{ count: 0 }] })),
      ChatLog.countDocuments({ userId: String(userId) }).catch(() => 0),
      pgPool.query("SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND is_done = TRUE", [userId]).catch(() => ({ rows: [{ count: 0 }] })),
    ];

    const [calls, tasks, messages, chats, doneTasks] = await Promise.all(queries);

    res.json({
      totalCalls: parseInt(calls.rows[0]?.count || 0),
      totalTasks: parseInt(tasks.rows[0]?.count || 0),
      totalMessages: parseInt(messages.rows[0]?.count || 0),
      totalChats: chats || 0,
      doneTasks: parseInt(doneTasks.rows[0]?.count || 0),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
}

module.exports = { getDashboardStats };
