// ============================================================
// Task Routes — /api/tasks/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { getTasks, createTask, toggleTask, deleteTask } = require("../controllers/task.controller");

router.use(authMiddleware);

router.get("/", getTasks);               // GET    /api/tasks
router.post("/", createTask);            // POST   /api/tasks
router.patch("/:id/toggle", toggleTask); // PATCH  /api/tasks/:id/toggle
router.delete("/:id", deleteTask);       // DELETE /api/tasks/:id

module.exports = router;
