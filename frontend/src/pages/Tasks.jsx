import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchTasks, createTask, toggleTask, deleteTask } from "../features/tasks/taskSlice";
import AIMessageWriter from "../components/AIMessageWriter";

export default function Tasks() {
  const dispatch = useDispatch();
  const { list, isLoading, error } = useSelector((s) => s.tasks);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "general", remindAt: "" });

  useEffect(() => { dispatch(fetchTasks()); }, []);
  useEffect(() => {
    const raw = localStorage.getItem("aura_pending_form_fill");
    if (!raw) return;
    try {
      const fill = JSON.parse(raw);
      if (fill.page !== "/tasks") return;
      setShowForm(true);
      setForm((current) => ({
        ...current,
        title: fill.fields.title || current.title,
        description: fill.fields.description || fill.fields.notes || current.description,
        type: fill.fields.type || current.type,
        remindAt: fill.fields.remindAt?.slice?.(0, 16) || current.remindAt,
      }));
      localStorage.removeItem("aura_pending_form_fill");
    } catch {}
  }, []);
  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  async function handleSubmit(e) {
    e.preventDefault(); setSubmitting(true);
    const result = await dispatch(createTask(form));
    setSubmitting(false);
    if (createTask.fulfilled.match(result)) {
      setShowForm(false);
      setForm({ title: "", description: "", type: "general", remindAt: "" });
    }
  }

  function useAiTaskDescription(generatedText) {
    const lines = String(generatedText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    setForm((current) => ({
      ...current,
      title: lines[0] || current.title,
      description: generatedText,
    }));
  }

  const filtered = list.filter((t) => filter === "pending" ? !t.is_done : filter === "done" ? t.is_done : true);
  const doneCount = list.filter((t) => t.is_done).length;
  const pendingCount = list.filter((t) => !t.is_done).length;

  const typeBadge = (type) => {
    const map = {
      general:  { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--border)" },
      call:     { bg: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "rgba(59,130,246,0.2)" },
      message:  { bg: "rgba(236,72,153,0.1)", color: "#f472b6", border: "rgba(236,72,153,0.2)" },
      ai:       { bg: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "rgba(167,139,250,0.2)" },
      reminder: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "rgba(251,191,36,0.2)" },
    };
    return map[type] || map.general;
  };

  return (
    <>
      <style>{`
        .tasks-card { background: var(--bg-card); border: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .tasks-input { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 12px; padding: 10px 16px; font-size: 14px; width: 100%; outline: none; transition: border-color 0.15s; }
        .tasks-input::placeholder { color: var(--text-muted); }
        .tasks-input:focus { border-color: var(--accent); }
        .tasks-tab-wrap { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 4px; display: inline-flex; }
        .tasks-tab-active { background: var(--accent); color: white; }
        .tasks-tab-inactive { color: var(--text-muted); }
        .tasks-tab-inactive:hover { color: var(--text-secondary); }
        .tasks-row { transition: background 0.15s; }
        .tasks-row:hover { background: var(--bg-elevated); }
      `}</style>

      <div className="p-4 md:p-6 space-y-5" style={{ background: "var(--bg-base)", minHeight: "100%" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Tasks & Reminders</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{pendingCount} pending · {doneCount} done</p>
          </div>
          <button onClick={() => setShowForm(p => !p)} className="text-white text-sm px-4 py-2.5 rounded-xl transition-colors" style={{ background: "var(--accent)" }}>
            + Add Task
          </button>
        </div>

        {showForm && (
          <div className="tasks-card rounded-2xl p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-xs" style={{ color: "var(--text-muted)" }}>Task Title *</label>
                  <AIMessageWriter
                    context="task"
                    initialTopic={form.title}
                    onUse={useAiTaskDescription}
                  />
                </div>
                <input className="tasks-input" type="text" name="title" value={form.title} onChange={handleChange} placeholder="e.g. Follow up with Rahul after call" required autoFocus />
              </div>
              {form.description ? (
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Task Notes</label>
                  <textarea className="tasks-input" name="description" value={form.description} onChange={handleChange} rows={5} style={{ resize: "none" }} />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Type</label>
                  <select className="tasks-input" name="type" value={form.type} onChange={handleChange}>
                    <option value="general">General</option><option value="call">Call</option><option value="message">Message</option><option value="ai">AI</option><option value="reminder">Reminder</option>
                  </select>
                </div>
                <div><label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Remind At (optional)</label>
                  <input className="tasks-input" type="datetime-local" name="remindAt" value={form.remindAt} onChange={handleChange} />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>Cancel</button>
                <button type="submit" disabled={submitting} className="text-white text-sm px-5 py-2 rounded-xl" style={{ background: "var(--accent)", opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? "Adding..." : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="tasks-tab-wrap">
          {[{ id: "all", label: `All (${list.length})` }, { id: "pending", label: `Pending (${pendingCount})` }, { id: "done", label: `Done (${doneCount})` }].map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f.id ? "tasks-tab-active" : "tasks-tab-inactive"}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="tasks-card rounded-2xl overflow-hidden">
          {isLoading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading tasks...</div>
            : filtered.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>{filter === "all" ? "No tasks yet. Add one above!" : `No ${filter} tasks.`}</div>
            : <div>{filtered.map((task, idx) => {
              const tb = typeBadge(task.type);
              return (
                <div key={task.id} className="tasks-row flex items-center gap-4 px-5 py-4 group"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border)" }}>
                  <button onClick={() => dispatch(toggleTask(task.id))}
                    className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs transition-all"
                    style={{ background: task.is_done ? "var(--online)" : "transparent", borderColor: task.is_done ? "var(--online)" : "var(--border-hover)", color: "white" }}>
                    {task.is_done && "✓"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm" style={{ color: task.is_done ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: task.is_done ? "line-through" : "none" }}>
                      {task.title}
                    </div>
                    {task.description ? (
                      <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs" style={{ color: "var(--text-muted)" }}>
                        {task.description}
                      </div>
                    ) : null}
                  </div>
                  {task.remind_at && <span className="text-[10px] hidden sm:block" style={{ color: "var(--text-muted)" }}>⏰ {new Date(task.remind_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>}
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full border" style={{ background: tb.bg, color: tb.color, borderColor: tb.border }}>{task.type}</span>
                  <button onClick={() => dispatch(deleteTask(task.id))} className="text-xs opacity-0 group-hover:opacity-100 transition-all"
                    style={{ color: "var(--text-muted)" }} onMouseEnter={e => e.target.style.color = "#f87171"} onMouseLeave={e => e.target.style.color = "var(--text-muted)"}>✕</button>
                </div>
              );
            })}</div>}
        </div>
      </div>
    </>
  );
}
