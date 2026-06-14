/**
 * Database Query Wrapper with Graceful Fallback
 * - Tries PostgreSQL
 * - Falls back to mock data in development if PostgreSQL fails
 */

const { pgPool } = require("../config/database");

class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.originalError = originalError;
    this.isPostgresError = true;
  }
}

/**
 * Safe PostgreSQL query wrapper
 * Returns null if query fails in development mode
 */
async function safeQuery(sql, params = [], options = {}) {
  const { fallbackData = null, skipFallback = false } = options;

  try {
    if (!sql || sql.trim() === "") {
      throw new Error("SQL query is empty");
    }

    const result = await pgPool.query(sql, params);
    return result;
  } catch (err) {
    const errorMsg = err?.message || "Unknown database error";

    // In development, log and return fallback
    if (process.env.NODE_ENV === "development" && !skipFallback) {
      console.warn(`⚠️  [DEV FALLBACK] PostgreSQL query failed: ${errorMsg.substring(0, 100)}`);
      
      if (fallbackData !== null) {
        console.warn(`   → Using fallback data`);
        return fallbackData;
      }
      
      console.warn(`   → Query will return null/empty results`);
      return { rows: [] };
    }

    // In production, throw error
    console.error("❌ PostgreSQL query failed:", errorMsg);
    throw new DatabaseError("Database query failed", err);
  }
}

/**
 * Check if PostgreSQL is available
 */
async function isPostgresAvailable() {
  try {
    await pgPool.query("SELECT 1");
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get mock stats for development
 */
function getMockStats() {
  return {
    totalCalls: 5,
    totalTasks: 12,
    totalMessages: 42,
    totalChats: 8,
    doneTasks: 6,
  };
}

/**
 * Get mock tasks for development
 */
function getMockTasks(userId) {
  return [
    {
      id: "mock-1",
      user_id: userId,
      title: "Setup Google Calendar",
      description: "Connect Google Calendar to Aura AI",
      type: "integration",
      is_done: false,
      created_at: new Date(),
    },
    {
      id: "mock-2",
      user_id: userId,
      title: "Test Email Functionality",
      description: "Verify SendGrid integration",
      type: "testing",
      is_done: true,
      created_at: new Date(),
    },
  ];
}

module.exports = {
  safeQuery,
  isPostgresAvailable,
  getMockStats,
  getMockTasks,
  DatabaseError,
};
