import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function StatCard({ label, value, icon, color }) {
  return (
    <div className="dash-card rounded-2xl p-5 relative overflow-hidden">
      <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-display text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</div>
      <div className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${color}18` }}>{icon}</div>
    </div>
  );
}

function Badge({ label, color }) {
  const colors = {
    green: { bg: "rgba(16,217,160,0.1)", color: "#10d9a0", border: "rgba(16,217,160,0.25)" },
    red: { bg: "rgba(248,113,113,0.1)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
    blue: { bg: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "rgba(96,165,250,0.25)" },
    amber: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "rgba(251,191,36,0.25)" },
    purple: { bg: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "rgba(167,139,250,0.25)" },
    gray: { bg: "var(--bg-elevated)", color: "var(--text-muted)", border: "var(--border)" },
  };
  const s = colors[color] || colors.gray;
  return <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: s.bg, color: s.color, borderColor: s.border }}>{label}</span>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [calls, setCalls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("aura_theme") || "dark");

  // Sync with Layout theme
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.getAttribute("data-theme") || "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aura_theme", next);
    setTheme(next);
  }

  useEffect(() => { if (user && user.role !== "admin") navigate("/dashboard"); }, [user]);
  useEffect(() => { fetchStats(); }, []);
  useEffect(() => {
    if (tab === "users") fetchUsers();
    if (tab === "chats") fetchChats();
    if (tab === "calls") fetchCalls();
    if (tab === "messages") fetchMessages();
    if (tab === "tasks") fetchTasks();
  }, [tab]);

  async function fetchStats() { try { const res = await api.get("/admin/stats"); setStats(res.data); } catch (e) { } }
  async function fetchUsers() { setLoading(true); try { const res = await api.get("/admin/users"); setUsers(res.data); } catch (e) { } finally { setLoading(false); } }
  async function fetchChats() { setLoading(true); try { const res = await api.get("/admin/chats"); setChats(res.data); } catch (e) { } finally { setLoading(false); } }
  async function fetchCalls() { setLoading(true); try { const res = await api.get("/admin/calls"); setCalls(res.data); } catch (e) { } finally { setLoading(false); } }
  async function fetchMessages() { setLoading(true); try { const res = await api.get("/admin/messages"); setMessages(res.data); } catch (e) { } finally { setLoading(false); } }
  async function fetchTasks() { setLoading(true); try { const res = await api.get("/admin/tasks"); setTasks(res.data); } catch (e) { } finally { setLoading(false); } }

  async function handlePlanChange(userId, plan) {
    try { await api.patch(`/admin/users/${userId}/plan`, { plan }); fetchUsers(); } catch (e) { }
  }
  async function handleBanToggle(userId) {
    if (!confirm("Toggle ban?")) return;
    try { await api.patch(`/admin/users/${userId}/ban`); fetchUsers(); } catch (e) { }
  }

  const integrations = [
    { name: "Groq AI", icon: "🤖", key: "groq" },
    { name: "PostgreSQL", icon: "🗄️", key: "postgres" },
    { name: "MongoDB", icon: "🍃", key: "mongodb" },
    { name: "Twilio", icon: "📞", key: "twilio" },
    { name: "WhatsApp", icon: "💬", key: "whatsapp" },
    { name: "Stripe", icon: "💳", key: "stripe" },
    { name: "Razorpay", icon: "💰", key: "razorpay" },
    { name: "Google Cal", status: "connected", icon: "📅" },
  ];

  return (
    <>
      <style>{`
        :root[data-theme="dark"] {
          --bg-base: #111318;
          --bg-surface: #191c24;
          --bg-elevated: #21253a;
          --bg-card: #1e2130;
          --border: rgba(255,255,255,0.08);
          --border-hover: rgba(255,255,255,0.15);
          --text-primary: rgba(255,255,255,0.92);
          --text-secondary: rgba(255,255,255,0.60);
          --text-muted: rgba(255,255,255,0.30);
          --accent: #6c63ff;
          --accent-bg: rgba(108,99,255,0.14);
          --accent-border: rgba(108,99,255,0.28);
          --online: #10d9a0;
          --nav-inactive: rgba(255,255,255,0.38);
          --scrollbar: rgba(255,255,255,0.08);
        }
        :root[data-theme="light"] {
          --bg-base: #f4f6fb;
          --bg-surface: #ffffff;
          --bg-elevated: #eef0f8;
          --bg-card: #ffffff;
          --border: rgba(99,102,145,0.12);
          --border-hover: rgba(99,102,145,0.25);
          --text-primary: #1c1e2e;
          --text-secondary: #4a4e6b;
          --text-muted: #9196b5;
          --accent: #5b52f0;
          --accent-bg: rgba(91,82,240,0.08);
          --accent-border: rgba(91,82,240,0.22);
          --online: #059669;
          --nav-inactive: #6b7094;
          --scrollbar: rgba(0,0,0,0.08);
        }
        .dash-card { background: var(--bg-card); border: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .admin-input { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 8px; padding: 4px 8px; font-size: 12px; outline: none; }
        .admin-th { font-size: 11px; color: var(--text-muted); padding: 10px 20px; text-align: left; border-bottom: 1px solid var(--border); background: var(--bg-elevated); }
        .admin-td { font-size: 13px; padding: 12px 20px; border-bottom: 1px solid var(--border); color: var(--text-secondary); }
        .admin-row:hover { background: var(--bg-elevated); }
        .admin-tab-wrap { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 4px; display: flex; flex-wrap: wrap; gap: 2px; }
        .admin-tab-active { background: var(--accent); color: white; border-radius: 10px; }
        .admin-tab-inactive { color: var(--text-muted); border-radius: 10px; }
        .admin-tab-inactive:hover { color: var(--text-secondary); background: var(--bg-card); }
        .admin-integration { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; align-items: center; gap: 10px; transition: background 0.25s; }
        .admin-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); border-radius: 10px; padding: 5px 12px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .admin-btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", transition: "background 0.25s" }}>

        {/* Header */}
        <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.25s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="font-display gradient-text" style={{ fontSize: 20, fontWeight: 700 }}>AURA</div>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>Admin Panel</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="admin-btn" onClick={toggleTheme}>
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button className="admin-btn" onClick={() => navigate("/dashboard")}>← Back</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👤 {user?.name}</span>
          </div>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Tabs */}
          <div className="admin-tab-wrap">
            {[
              { id: "overview", label: "📊 Overview" },
              { id: "users", label: "👥 Users" },
              { id: "chats", label: "💬 Chats" },
              { id: "calls", label: "📞 Calls" },
              { id: "messages", label: "📱 Messages" },
              { id: "tasks", label: "✅ Tasks" },
              { id: "payments", label: "💳 Payments" },
            ].map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-medium transition-all ${tab === t.id ? "admin-tab-active" : "admin-tab-inactive"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={stats?.totalUsers} icon="👥" color="#6c63ff" />
                <StatCard label="Pro Users" value={stats?.proUsers} icon="⭐" color="#f59e0b" />
                <StatCard label="AI Chats" value={stats?.totalChats} icon="💬" color="#10d9a0" />
                <StatCard label="Total Calls" value={stats?.totalCalls} icon="📞" color="#60a5fa" />
                <StatCard label="Messages" value={stats?.totalMessages} icon="📱" color="#f472b6" />
                <StatCard label="Tasks" value={stats?.totalTasks} icon="✅" color="#a78bfa" />
                <StatCard label="Completed Calls" value={stats?.completedCalls} icon="✔️" color="#10d9a0" />
                <StatCard label="Banned Users" value={stats?.bannedUsers} icon="🚫" color="#f87171" />
              </div>
              <div className="dash-card rounded-2xl p-5">
                <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Platform Integrations</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {integrations.map((item) => {
                    const isConnected = item.key ? stats?.integrations?.[item.key] === true : item.status === "connected"; 
                    return (
                      <div key={item.name} className="admin-integration">
                        <span style={{ fontSize: 20 }}>{item.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: isConnected ? "var(--online)" : "var(--text-muted)" }}>
                            {isConnected ? "● Connected" : "○ Not connected"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Users */}
          {tab === "users" && (
            <div className="dash-card rounded-2xl overflow-hidden">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Users ({users.length})</h2>
              </div>
              {loading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Name", "Email", "Role", "Plan", "Status", "Joined", "Actions"].map(h => <th key={h} className="admin-th">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="admin-row">
                          <td className="admin-td" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{u.name}</td>
                          <td className="admin-td">{u.email}</td>
                          <td className="admin-td"><Badge label={u.role} color={u.role === "admin" ? "red" : "gray"} /></td>
                          <td className="admin-td">
                            <select value={u.plan} onChange={(e) => handlePlanChange(u.id, e.target.value)} className="admin-input">
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                          </td>
                          <td className="admin-td"><Badge label={u.is_active ? "Active" : "Banned"} color={u.is_active ? "green" : "red"} /></td>
                          <td className="admin-td" style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                          <td className="admin-td">
                            {u.role !== "admin" && (
                              <button onClick={() => handleBanToggle(u.id)}
                                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer", background: u.is_active ? "rgba(248,113,113,0.1)" : "rgba(16,217,160,0.1)", border: `1px solid ${u.is_active ? "rgba(248,113,113,0.3)" : "rgba(16,217,160,0.3)"}`, color: u.is_active ? "#f87171" : "#10d9a0" }}>
                                {u.is_active ? "Ban" : "Unban"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Chats */}
          {tab === "chats" && (
            <div className="dash-card rounded-2xl overflow-hidden">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Chats ({chats.length})</h2>
              </div>
              {loading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
                : chats.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No chats yet.</div>
                  : <div>{chats.map((chat, i) => (
                    <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(chat.timestamp).toLocaleString("en-IN")}</span>
                        <Badge label={chat.language === "hi" ? "Hindi" : "English"} color="blue" />
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontSize: 10, color: "var(--accent)", display: "block", marginBottom: 4 }}>USER</span>{chat.userMessage}
                      </div>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)" }}>
                        <span style={{ fontSize: 10, color: "var(--online)", display: "block", marginBottom: 4 }}>AURA</span>{chat.aiResponse}
                      </div>
                    </div>
                  ))}</div>}
            </div>
          )}

          {/* Calls */}
          {tab === "calls" && (
            <div className="dash-card rounded-2xl overflow-hidden">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Calls ({calls.length})</h2>
              </div>
              {loading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
                : calls.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No calls yet.</div>
                  : <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr>{["User", "Phone", "Purpose", "Status", "Scheduled"].map(h => <th key={h} className="admin-th">{h}</th>)}</tr></thead>
                      <tbody>{calls.map((c) => (
                        <tr key={c.id} className="admin-row">
                          <td className="admin-td" style={{ color: "var(--text-primary)", fontWeight: 500 }}>{c.user_name}</td>
                          <td className="admin-td">{c.phone_number}</td>
                          <td className="admin-td"><Badge label={c.purpose} color="blue" /></td>
                          <td className="admin-td"><Badge label={c.status} color={c.status === "completed" ? "green" : c.status === "failed" ? "red" : "amber"} /></td>
                          <td className="admin-td" style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString("en-IN") : "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>}
            </div>
          )}

          {/* Messages */}
          {tab === "messages" && (
            <div className="dash-card rounded-2xl overflow-hidden">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Messages ({messages.length})</h2>
              </div>
              {loading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
                : messages.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No messages yet.</div>
                  : <div>{messages.map((m) => (
                    <div key={m.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                      <Badge label={m.platform} color={m.platform === "whatsapp" ? "green" : "blue"} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{m.user_name} → {m.to_number}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content}</div>
                      </div>
                      <Badge label={m.status || "sent"} color={m.status === "delivered" ? "green" : m.status === "failed" ? "red" : "amber"} />
                      <div style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{new Date(m.sent_at).toLocaleString("en-IN")}</div>
                    </div>
                  ))}</div>}
            </div>
          )}

          {/* Tasks */}
          {tab === "tasks" && (
            <div className="dash-card rounded-2xl overflow-hidden">
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>All Tasks ({tasks.length})</h2>
              </div>
              {loading ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
                : tasks.length === 0 ? <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>No tasks yet.</div>
                  : <div>{tasks.map((t, i) => (
                    <div key={t.id} style={{ padding: "12px 20px", borderBottom: i === tasks.length - 1 ? "none" : "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${t.is_done ? "var(--online)" : "var(--border-hover)"}`, background: t.is_done ? "var(--online)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", flexShrink: 0 }}>
                        {t.is_done && "✓"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: t.is_done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: t.is_done ? "line-through" : "none" }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.user_name} · {t.user_email}</div>
                      </div>
                      <Badge label={t.type} color="purple" />
                    </div>
                  ))}</div>}
            </div>
          )}

          {/* Payments */}
          {tab === "payments" && (
            <div className="dash-card rounded-2xl p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Payment Methods</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { name: "Razorpay", icon: "💰", key: "razorpay" },
                  { name: "Stripe", icon: "💳", key: "stripe" },
                  { name: "PayU", icon: "🏦", key: "payu" },
                  { name: "Cashfree", icon: "💸", key: "cashfree" },
                  { name: "PhonePe", icon: "📲", key: "phonepe" },
                  { name: "Paytm", icon: "🔵", key: "paytm" },
                ].map((p) => (
                  <div key={p.name} className="admin-integration" style={{ justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{p.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: stats?.integrations?.[p.key] ? "var(--online)" : "var(--text-muted)" }}>
                          {stats?.integrations?.[p.key] ? "● Connected" : "○ Not connected"}
                        </div>
                      </div>
                    </div>
                    <button style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer", background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>Setup</button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, marginTop: 16, color: "var(--text-muted)" }}>Payment integrations coming soon.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}