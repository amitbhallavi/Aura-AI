const { Pool } = require("pg");
const mongoose = require("mongoose");

const pgPool = new Pool({
  connectionString: `postgresql://${process.env.PG_USER}:${encodeURIComponent(process.env.PG_PASSWORD)}@${process.env.PG_HOST}:${process.env.PG_PORT || 5432}/${process.env.PG_DATABASE || 'postgres'}`,
  // ⚠️ IMPORTANT: In production with Supabase/Railway/Render, use proper SSL validation
  ssl: process.env.NODE_ENV === "production" 
    ? { rejectUnauthorized: true }  // Strict validation in production
    : false,  // Development can use unencrypted (if localhost)
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

pgPool.on("error", (err) => {
  console.warn("PG pool error (ignored):", err.message);
});

async function ensureUserOAuthColumns() {
  await pgPool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_tokens TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_tokens TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_connected_email TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_service VARCHAR(40);
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_record_id TEXT;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN DEFAULT FALSE;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS phone_mode VARCHAR(20) DEFAULT 'personal';
    ALTER TABLE calls ADD COLUMN IF NOT EXISTS from_number VARCHAR(20);
  `);
}

async function connectPostgres() {
  try {
    await pgPool.query("SELECT 1");
    await ensureUserOAuthColumns();
    console.log("✅ PostgreSQL connected");
  } catch (err) {
    console.warn("⚠️  PostgreSQL not connected:", err.message);
    console.warn("   → Add PG_HOST, PG_USER, PG_PASSWORD, PG_DATABASE to .env");
  }
}

async function connectMongo() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/aura_ai"
    );
    console.log("✅ MongoDB connected to", mongoose.connection.name);
  } catch (err) {
    console.warn("⚠️  MongoDB not connected:", err.message);
    console.warn("   → Add MONGO_URI to .env");
  }
}

module.exports = { pgPool, connectPostgres, connectMongo, ensureUserOAuthColumns };
