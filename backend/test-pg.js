const { Pool } = require("pg");

const pgPool = new Pool({
  connectionString: `postgresql://${process.env.PG_USER}:${encodeURIComponent(process.env.PG_PASSWORD)}@${process.env.PG_HOST}:${process.env.PG_PORT || 5432}/${process.env.PG_DATABASE || 'postgres'}`,
  ssl: false,
  connectionTimeoutMillis: 5000,
});

(async () => {
  try {
    console.log("🔗 Attempting PostgreSQL connection...");
    console.log("   Host:", process.env.PG_HOST);
    console.log("   User:", process.env.PG_USER);
    
    const result = await pgPool.query("SELECT 1");
    console.log("✅ PostgreSQL connected successfully!");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:");
    console.error("   Error:", err.message);
    console.error("   Code:", err.code);
    
    if (err.code === "ENOTFOUND") {
      console.error("\n🚨 Host not resolvable. Possible causes:");
      console.error("   1. Supabase project is suspended or deleted");
      console.error("   2. Host URL is incorrect");
      console.error("   3. No internet connectivity");
    }
  }
  process.exit(0);
})();
