import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { fetchCalls } from "../features/calls/callSlice";
import { fetchTasks } from "../features/tasks/taskSlice";
import api, { cachedGet, connectionsAPI, getRequestErrorMessage } from "../services/api";

const INDORE_MAP_LINK = "https://www.google.com/maps/search/?api=1&query=Indore%2C%20Madhya%20Pradesh";

function StatCard({ label, value, icon, color }) {
  return (
    <div className="dash-card rounded-2xl p-5 relative overflow-hidden">
      <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="font-display text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value ?? <span style={{ fontSize: 16, color: "var(--text-muted)" }}>—</span>}
      </div>
      <div className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
        style={{ background: `${color}18` }}>{icon}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    scheduled: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "rgba(59,130,246,0.25)" },
    completed: { bg: "rgba(16,217,160,0.08)", color: "#10d9a0", border: "rgba(16,217,160,0.2)" },
    ongoing: { bg: "rgba(16,217,160,0.12)", color: "#10d9a0", border: "rgba(16,217,160,0.25)" },
    failed: { bg: "rgba(248,113,113,0.12)", color: "#f87171", border: "rgba(248,113,113,0.25)" },
    cancelled: { bg: "rgba(156,163,175,0.1)", color: "#9ca3af", border: "rgba(156,163,175,0.2)" },
  };
  const s = colors[status] || colors.cancelled;
  return <span className="text-[10px] px-2 py-0.5 rounded-full border"
    style={{ background: s.bg, color: s.color, borderColor: s.border }}>{status}</span>;
}

function ConnectionCard({ item, onConnect }) {
  const ready = item.connected;
  return (
    <div className="dash-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</div>
          <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.explanation || item.status}</div>
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-medium"
          style={{
            background: ready ? "rgba(16,217,160,0.1)" : "rgba(251,191,36,0.12)",
            color: ready ? "#059669" : "#d97706",
            border: `1px solid ${ready ? "rgba(16,217,160,0.25)" : "rgba(251,191,36,0.25)"}`,
          }}>
          {ready ? "Connected" : item.status || "Setup needed"}
        </span>
      </div>
      {item.connectUrl && !ready && (
        <button onClick={() => onConnect(item)} className="mt-3 rounded-xl px-3 py-2 text-xs font-medium"
          style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
          Connect
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const { list: calls } = useSelector((s) => s.calls);
  const { list: tasks } = useSelector((s) => s.tasks);
  const { user } = useSelector((s) => s.auth);
  const [stats, setStats] = useState(null);
  const [calConnected, setCalConnected] = useState(false);
  const [connectingCal, setConnectingCal] = useState(false);
  const [toast, setToast] = useState("");
  const [connections, setConnections] = useState(null);
  const [testingConnections, setTestingConnections] = useState(false);

  useEffect(() => {
    dispatch(fetchCalls());
    dispatch(fetchTasks());
    cachedGet("/dashboard/stats")
      .then((r) => setStats(r.data))
      .catch((err) => showToast(`❌ ${getRequestErrorMessage(err, "Failed to load dashboard stats.")}`));
    refreshConnections();

    // Check if Google Calendar already connected
    if (user?.google_tokens) setCalConnected(true);
    if (window.location.search.includes("calendar=connected")) {
      setCalConnected(true);
      showToast("✅ Google Calendar connected!");
      window.history.replaceState({}, "", "/dashboard");
    }
    if (window.location.search.includes("calendar=error")) {
      const reason = new URLSearchParams(window.location.search).get("reason");
      showToast(`❌ ${reason || "Calendar connection failed. Try again."}`);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function connectCalendar() {
    setConnectingCal(true);
    try {
      const res = await api.get("/calendar/auth-url");
      window.location.href = res.data.url;
    } catch {
      showToast("❌ Failed to get auth URL");
      setConnectingCal(false);
    }
  }

  async function refreshConnections(options = {}) {
    setTestingConnections(true);
    try {
      const res = await connectionsAPI.status(options);
      setConnections(res.data);
      setCalConnected(Boolean(res.data?.calendar?.connected));
    } catch (err) {
      showToast(`❌ ${getRequestErrorMessage(err, "Failed to check service connections.")}`);
    } finally {
      setTestingConnections(false);
    }
  }

  async function connectService(item) {
    if (!item.connectUrl) return;
    try {
      const res = await api.get(item.connectUrl.replace(/^\/api/, ""));
      if (res.data?.url) window.location.href = res.data.url;
    } catch {
      showToast("❌ Failed to start connection.");
    }
  }

  const doneTasks = tasks.filter((t) => t.is_done).length;
  const totalTasks = tasks.length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <>
      <style>{`
        .dash-card { background: var(--bg-card); border: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .dash-card:hover { border-color: var(--border-hover); }
        .dash-action { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; align-items: center; gap: 12px; transition: all 0.2s; text-decoration: none; }
        .dash-action:hover { background: var(--bg-elevated); border-color: var(--border-hover); }
        .dash-action .label { font-size: 14px; color: var(--text-secondary); transition: color 0.15s; }
        .dash-action:hover .label { color: var(--text-primary); }
        .dash-divider { border-color: var(--border); }
        .dash-lang-active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
        .dash-lang-inactive { border-color: var(--border); color: var(--text-muted); }
        .dash-avatar { background: var(--bg-elevated); }
        .google-btn { display: flex; align-items: center; gap: 8px; background: var(--accent); color: white; border: none; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
        .google-btn:hover { opacity: 0.9; }
        .google-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .connected-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16,217,160,0.1); border: 1px solid rgba(16,217,160,0.25); color: #10d9a0; border-radius: 20px; padding: 4px 12px; font-size: 12px; }
        .map-preview { position: relative; min-height: 160px; overflow: hidden; border-radius: 12px; border: 1px solid var(--border); background: linear-gradient(135deg, rgba(108,99,255,0.14), rgba(16,217,160,0.12)); }
        .map-preview::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(145,150,181,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(145,150,181,0.18) 1px, transparent 1px); background-size: 28px 28px; opacity: 0.55; }
        .map-preview::after { content: ""; position: absolute; width: 160px; height: 160px; border-radius: 999px; right: -50px; bottom: -60px; background: rgba(108,99,255,0.16); }
        .map-route { position: absolute; left: 26px; right: 52px; top: 76px; height: 2px; background: linear-gradient(90deg, var(--accent), #10d9a0); transform: rotate(-8deg); box-shadow: 0 0 0 4px rgba(255,255,255,0.28); }
        .map-pin { position: absolute; left: 48%; top: 48%; transform: translate(-50%, -50%); width: 36px; height: 36px; border-radius: 14px 14px 14px 4px; rotate: -45deg; background: var(--accent); box-shadow: 0 12px 28px rgba(108,99,255,0.25); }
        .map-pin span { position: absolute; inset: 8px; border-radius: 999px; background: white; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, padding: "12px 20px", borderRadius: 12, background: toast.includes("✅") ? "rgba(16,217,160,0.15)" : "rgba(248,113,113,0.15)", border: `1px solid ${toast.includes("✅") ? "rgba(16,217,160,0.3)" : "rgba(248,113,113,0.3)"}`, color: toast.includes("✅") ? "#10d9a0" : "#f87171", fontSize: 13, fontWeight: 500 }}>
          {toast}
        </div>
      )}

      <div className="p-4 md:p-6 space-y-5" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="AI Conversations" value={stats?.totalChats} icon="💬" color="#6c63ff" />
          <StatCard label="Calls Made" value={stats?.totalCalls} icon="📞" color="#10d9a0" />
          <StatCard label="Messages Sent" value={stats?.totalMessages} icon="📱" color="#f59e0b" />
          <StatCard label="Tasks Done" value={`${pct}%`} icon="✅" color="#60a5fa" />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { to: "/chat", label: "New Chat", icon: "💬" },
            { to: "/calls", label: "Schedule Call", icon: "📞" },
            { to: "/messages", label: "Send Message", icon: "📱" },
            { to: "/tasks", label: "Add Task", icon: "✅" },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="dash-action">
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span className="label">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="dash-card rounded-2xl p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>Subscription</div>
              <h2 className="mt-2 text-lg font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{user?.plan || "free"} plan</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Your active plan controls call, message, AI, and support limits.
              </p>
            </div>
            <Link to="/pricing" className="w-fit rounded-xl px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
              Manage plan
            </Link>
          </div>
        </div>

        <div className="dash-card rounded-2xl p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Connected Services</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Aura can only automate services that are connected or configured.</p>
            </div>
            <button onClick={() => refreshConnections({ force: true })} disabled={testingConnections} className="rounded-xl px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              {testingConnections ? "Testing..." : "Test All Connections"}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {connections ? Object.entries(connections).map(([key, item]) => (
              <ConnectionCard key={key} item={{ key, ...item }} onConnect={connectService} />
            )) : (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading service status...</div>
            )}
          </div>
        </div>

        {/* Calls + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Calls */}
          <div className="dash-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Recent Calls</h2>
              <Link to="/calls" className="text-xs" style={{ color: "var(--accent)" }}>View all →</Link>
            </div>
            {calls.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                No calls yet. <Link to="/calls" style={{ color: "var(--accent)" }}>Schedule one →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {calls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center gap-3 py-2.5 border-b dash-divider last:border-0">
                    <div className="dash-avatar w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0">👤</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                        {call.contact_name || call.phone_number}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {call.purpose} · {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </div>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="dash-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Tasks <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{doneTasks}/{totalTasks}</span>
              </h2>
              <Link to="/tasks" className="text-xs" style={{ color: "var(--accent)" }}>View all →</Link>
            </div>
            {totalTasks > 0 && (
              <div className="mb-4 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--online)" }} />
              </div>
            )}
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                No tasks yet. <Link to="/tasks" style={{ color: "var(--accent)" }}>Add one →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 py-2 border-b dash-divider last:border-0">
                    <div className="w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[10px]"
                      style={{ background: task.is_done ? "var(--online)" : "transparent", borderColor: task.is_done ? "var(--online)" : "var(--border-hover)", color: "white" }}>
                      {task.is_done && "✓"}
                    </div>
                    <span className="text-sm flex-1 truncate"
                      style={{ color: task.is_done ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: task.is_done ? "line-through" : "none" }}>
                      {task.title}
                    </span>
                    <span className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{task.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Google Services Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Google Calendar */}
          <div className="dash-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span style={{ fontSize: 24 }}>📅</span>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Google Calendar</h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Auto-add calls and reminders</p>
              </div>
              {calConnected && <span className="connected-badge ml-auto">● Connected</span>}
            </div>
            {calConnected ? (
              <div style={{ padding: "10px 14px", background: "rgba(16,217,160,0.07)", border: "1px solid rgba(16,217,160,0.2)", borderRadius: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                ✅ Calendar synced — calls and tasks auto-added to your Google Calendar!
              </div>
            ) : (
              <button className="google-btn" onClick={connectCalendar} disabled={connectingCal}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                {connectingCal ? "Connecting..." : "Connect Google Calendar"}
              </button>
            )}
          </div>

          {/* Google Maps */}
          <div className="dash-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <span style={{ fontSize: 24 }}>🗺️</span>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Google Maps</h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Your location — Indore, MP</p>
              </div>
            </div>
            <div className="map-preview">
              <div className="map-route" />
              <div className="map-pin"><span /></div>
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{ background: "rgba(255,255,255,0.76)", border: "1px solid rgba(255,255,255,0.7)", backdropFilter: "blur(10px)" }}>
                <div>
                  <div className="text-xs font-semibold" style={{ color: "#1f2437" }}>Indore, Madhya Pradesh</div>
                  <div className="text-[11px]" style={{ color: "#68708f" }}>Static preview. Opens Google Maps only when clicked.</div>
                </div>
                <a
                  href={INDORE_MAP_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Open Maps
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Language Support */}
        <div className="dash-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 18 }}>🌐</span>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Language Support</h2>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(16,217,160,0.1)", border: "1px solid rgba(16,217,160,0.2)", color: "#10d9a0", marginLeft: "auto" }}>Google Translate</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { code: "en", label: "English", flag: "🇬🇧" },
              { code: "hi", label: "Hindi", flag: "🇮🇳" },
              { code: "mr", label: "Marathi", flag: "🇮🇳" },
              { code: "ta", label: "Tamil", flag: "🇮🇳" },
              { code: "te", label: "Telugu", flag: "🇮🇳" },
              { code: "gu", label: "Gujarati", flag: "🇮🇳" },
              { code: "bn", label: "Bengali", flag: "🇮🇳" },
            ].map((lang) => (
              <span key={lang.code}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${user?.language === lang.code ? "dash-lang-active" : "dash-lang-inactive"}`}>
                {lang.flag} {lang.label}{user?.language === lang.code && " ✓"}
              </span>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
