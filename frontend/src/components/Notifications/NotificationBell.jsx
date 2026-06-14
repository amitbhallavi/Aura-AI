import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearNotifications, markAllRead } from "../../features/notifications/notificationSlice";

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function notificationTone(type) {
  if (type === "call_completed") return "#10d9a0";
  if (type === "message_received") return "#60a5fa";
  if (type === "task_due") return "#f59e0b";
  return "var(--accent)";
}

export default function NotificationBell() {
  const dispatch = useDispatch();
  const { items, unreadCount } = useSelector((s) => s.notifications);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: "#ef4444" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl shadow-2xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Notifications</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{unreadCount} unread</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => dispatch(markAllRead())} className="text-xs" style={{ color: "var(--accent)" }}>
                Mark read
              </button>
              <button type="button" onClick={() => dispatch(clearNotifications())} className="text-xs" style={{ color: "var(--text-muted)" }}>
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No notifications yet.</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: notificationTone(item.type) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                      <div className="flex-shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>{formatTime(item.createdAt)}</div>
                    </div>
                    {item.message && <div className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.message}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
