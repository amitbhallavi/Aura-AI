// ============================================================
// Task Controller — CRUD for tasks and reminders
// ============================================================
const { pgPool } = require("../config/database");
const { getMockTasks } = require("../services/database.service");

// ---------------------------------------------------------------
// GET /api/tasks
// ---------------------------------------------------------------
async function getTasks(req, res) {
  try {
    const result = await pgPool.query(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    // In development, return mock data; in production, return error
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  [DEV MODE] PostgreSQL failed for tasks, using mock data:", err.message);
      return res.json(getMockTasks(req.user.id));
    }
    console.error("Task fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch tasks." });
  }
}

// ---------------------------------------------------------------
// POST /api/tasks
// Body: { title, description?, type?, remindAt?, source?, relatedService?, relatedRecordId?, metadata?, createdByAI? }
// ---------------------------------------------------------------
async function createTask(req, res) {
  const {
    title,
    description,
    type,
    remindAt,
    source,
    relatedService,
    relatedRecordId,
    metadata,
    createdByAI,
  } = req.body;

  if (!title) return res.status(400).json({ error: "Task title is required." });

  try {
    const result = await pgPool.query(
      `INSERT INTO tasks (
        user_id, title, description, type, remind_at, source,
        related_service, related_record_id, metadata, created_by_ai
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING *`,
      [
        req.user.id,
        title,
        description || null,
        type || "general",
        remindAt || null,
        source || "manual",
        relatedService || null,
        relatedRecordId || null,
        JSON.stringify(metadata || {}),
        Boolean(createdByAI),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create task error:", err.message);
    res.status(500).json({ error: "Failed to create task." });
  }
}

// ---------------------------------------------------------------
// PATCH /api/tasks/:id/toggle  — mark done / undone
// ---------------------------------------------------------------
async function toggleTask(req, res) {
  try {
    const result = await pgPool.query(
      `UPDATE tasks SET is_done = NOT is_done, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle task." });
  }
}

// ---------------------------------------------------------------
// DELETE /api/tasks/:id
// ---------------------------------------------------------------
async function deleteTask(req, res) {
  try {
    const result = await pgPool.query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found." });
    }
    res.json({ message: "Task deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete task." });
  }
}

module.exports = { getTasks, createTask, toggleTask, deleteTask };
