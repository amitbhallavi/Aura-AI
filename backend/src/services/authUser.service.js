const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pgPool } = require("../config/database");

// Development in-memory user store (fallback when PostgreSQL unavailable)
const devUsers = new Map();

function sanitizeUser(user) {
  const { password_hash, google_tokens, gmail_tokens, ...safeUser } = user;
  return safeUser;
}

/**
 * Find or create OAuth user - with graceful PostgreSQL fallback for development
 */
async function findOrCreateOAuthUser({ name, email }) {
  const normalizedEmail = email.toLowerCase();

  // Try PostgreSQL first
  if (process.env.NODE_ENV !== "development" || process.env.USE_PG_ALWAYS === "true") {
    try {
      const existing = await pgPool.query(
        "SELECT * FROM users WHERE email = $1",
        [normalizedEmail]
      );

      if (existing.rows[0]) {
        if (existing.rows[0].is_active === false) {
          throw new Error("Account is disabled.");
        }
        return sanitizeUser(existing.rows[0]);
      }

      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      const result = await pgPool.query(
        `INSERT INTO users (name, email, password_hash, role, language, plan)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, role, language, plan, created_at`,
        [name || normalizedEmail.split("@")[0], normalizedEmail, passwordHash, "individual", "en", "basic"]
      );

      return result.rows[0];
    } catch (pgErr) {
      // If PostgreSQL fails and we're in development, fall through to in-memory storage
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️  PostgreSQL query failed, using dev fallback: ${pgErr.message}`);
      } else {
        // In production, fail hard
        throw pgErr;
      }
    }
  }

  // Development fallback: in-memory user store
  console.log(`💾 [DEV MODE] Looking up user: ${normalizedEmail}`);
  
  if (devUsers.has(normalizedEmail)) {
    const user = devUsers.get(normalizedEmail);
    console.log(`✅ [DEV MODE] User found in memory`);
    return user;
  }

  // Create new dev user
  const newUser = {
    id: crypto.randomUUID(),
    name: name || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    role: "individual",
    language: "en",
    plan: "basic",
    created_at: new Date(),
  };

  devUsers.set(normalizedEmail, newUser);
  console.log(`✅ [DEV MODE] User created in memory: ${normalizedEmail}`);
  
  return newUser;
}

/**
 * Mock PostgreSQL is ready flag
 */
async function isPostgresReady() {
  try {
    await pgPool.query("SELECT 1");
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  findOrCreateOAuthUser,
  isPostgresReady,
  sanitizeUser,
};
