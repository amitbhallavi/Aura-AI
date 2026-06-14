import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../features/auth/authSlice";
import { connectionsAPI } from "../../services/api";
import useSocketNotifications from "../../hooks/useSocketNotifications";
import NotificationBell from "../Notifications/NotificationBell";
import NotificationToast from "../Notifications/NotificationToast";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "⊞" },
  { to: "/chat", label: "AI Chat", icon: "💬" },
  { to: "/calls", label: "AI Calls", icon: "📞" },
  { to: "/messages", label: "Messaging", icon: "📱" },
  { to: "/tasks", label: "Tasks", icon: "✅" },
  { to: "/settings/phone-config", label: "Phone Config", icon: "☎️" },
  { to: "/pricing", label: "Pricing", icon: "💎" },
];

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("aura_theme") || "dark");
  const [aiHealth, setAiHealth] = useState({ label: "AI Online", ok: true });
  const { toast: notificationToast, dismissToast } = useSocketNotifications();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("aura_theme", theme);
  }, [theme]);

  useEffect(() => {
    connectionsAPI.status()
      .then((res) => {
        const geminiReady = Boolean(res.data?.gemini?.connected);
        const voiceReady = Boolean(res.data?.voice?.connected);
        setAiHealth({
          ok: geminiReady && voiceReady,
          label: geminiReady && voiceReady ? "AI Online" : "Setup Needed",
        });
      })
      .catch(() => setAiHealth({ label: "Status Unknown", ok: false }));
  }, []);

  function toggleTheme() { setTheme((t) => (t === "dark" ? "light" : "dark")); }
  function handleLogout() { dispatch(logout()); navigate("/login"); }

  return (
    <>
      <style>{`
        :root[data-theme="dark"] {
          --bg-base: #0d0f14;
          --bg-surface: #13151c;
          --bg-elevated: #1a1d27;
          --bg-card: #1e2130;
          --border: rgba(255,255,255,0.07);
          --border-hover: rgba(255,255,255,0.15);
          --text-primary: rgba(255,255,255,0.92);
          --text-secondary: rgba(255,255,255,0.55);
          --text-muted: rgba(255,255,255,0.28);
          --accent: #6c63ff;
          --accent-hover: #7c74ff;
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
          --accent-hover: #4a42d8;
          --accent-bg: rgba(91,82,240,0.08);
          --accent-border: rgba(91,82,240,0.22);
          --online: #059669;
          --nav-inactive: #6b7094;
          --scrollbar: rgba(0,0,0,0.08);
        }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        .t-layout { background: var(--bg-base); color: var(--text-primary); transition: background 0.25s, color 0.25s; }
        .t-sidebar { background: var(--bg-surface); border-right: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .t-header { background: var(--bg-surface); border-bottom: 1px solid var(--border); transition: background 0.25s, border-color 0.25s; }
        .t-nav-active { background: var(--accent-bg) !important; border: 1px solid var(--accent-border) !important; color: var(--text-primary) !important; }
        .t-nav-item { color: var(--nav-inactive); border: 1px solid transparent; transition: all 0.15s; }
        .t-nav-item:hover { color: var(--text-primary); background: var(--bg-elevated); }
        .t-user-card { background: var(--bg-elevated); border: 1px solid var(--border); }
        .t-badge { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-muted); }
        .t-theme-btn { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; transition: all 0.15s; border-radius: 10px; padding: 5px 12px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
        .t-theme-btn:hover { border-color: var(--border-hover); color: var(--text-primary); background: var(--bg-card); }
        .t-hamburger { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-secondary); border-radius: 8px; padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .t-hamburger:hover { color: var(--text-primary); border-color: var(--border-hover); }
        .t-section-label { color: var(--text-muted); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; padding: 0 8px; margin-bottom: 6px; }
        .t-logo-text { color: var(--accent); font-weight: 700; font-size: 20px; }
        .t-logo-sub { color: var(--text-muted); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; }
        .t-online { color: var(--online); }
        .t-online-dot { background: var(--online); }
        .t-user-dot { background: var(--online); box-shadow: 0 0 0 2px var(--bg-surface); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 4px; }
      `}</style>

      <div className="t-layout flex h-screen overflow-hidden">
        <NotificationToast notification={notificationToast} onClose={dismissToast} />

        {sidebarOpen && (
          <div className="fixed inset-0 z-20 lg:hidden" style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`t-sidebar fixed lg:static inset-y-0 left-0 z-30 w-56 flex-shrink-0 flex flex-col transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

          <div className="px-5 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="t-logo-text">AURA</div>
              <div className="t-logo-sub">AI Assistant</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden t-hamburger" style={{ border: "none", background: "none", fontSize: 16 }}>✕</button>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            <div className="t-section-label mt-1 mb-2">Main</div>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive ? "t-nav-active" : "t-nav-item"}`}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="t-user-card flex items-center gap-2.5 rounded-xl p-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #6c63ff 0%, #f472b6 100%)" }}>
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{user?.name || "User"}</div>
                <div className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{user?.plan || "free"} plan</div>
              </div>
              <div className="t-user-dot w-2 h-2 rounded-full flex-shrink-0" />
            </div>
            <button onClick={handleLogout} className="w-full mt-2 text-xs py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Header */}
          <header className="t-header flex items-center justify-between px-4 md:px-6 py-3.5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="t-hamburger lg:hidden">
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="4.5" x2="15" y2="4.5" />
                  <line x1="2" y1="9" x2="15" y2="9" />
                  <line x1="2" y1="13.5" x2="15" y2="13.5" />
                </svg>
              </button>
              <div>
                <div className="text-sm md:text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Good day, {user?.name?.split(" ")[0] || "there"} 👋
                </div>
                <div className="text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: aiHealth.ok ? "var(--online)" : "#d97706" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: aiHealth.ok ? "var(--online)" : "#d97706" }} />
                <span className="hidden sm:inline">{aiHealth.label}</span>
              </div>

              <NotificationBell />

              <button className="t-theme-btn" onClick={toggleTheme}>
                {theme === "dark" ? "☀️" : "🌙"}
                <span className="hidden sm:inline text-xs">{theme === "dark" ? "Light" : "Dark"}</span>
              </button>

              <div className="t-badge rounded-xl px-2.5 py-1.5 text-xs">
                {user?.language === "hi" ? "🇮🇳 Hi" : "🇬🇧 En"}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
