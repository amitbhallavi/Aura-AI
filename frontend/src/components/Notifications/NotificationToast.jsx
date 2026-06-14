function tone(type) {
  if (type === "call_completed") return { border: "rgba(16,217,160,0.35)", bg: "rgba(16,217,160,0.12)", dot: "#10d9a0" };
  if (type === "message_received") return { border: "rgba(96,165,250,0.35)", bg: "rgba(96,165,250,0.12)", dot: "#60a5fa" };
  if (type === "task_due") return { border: "rgba(245,158,11,0.35)", bg: "rgba(245,158,11,0.12)", dot: "#f59e0b" };
  return { border: "var(--accent-border)", bg: "var(--accent-bg)", dot: "var(--accent)" };
}

export default function NotificationToast({ notification, onClose }) {
  if (!notification) return null;
  const colors = tone(notification.type);

  return (
    <div
      className="fixed right-4 top-20 z-[80] flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl p-4 shadow-2xl"
      style={{ background: "var(--bg-card)", border: `1px solid ${colors.border}` }}
      role="status"
    >
      <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: colors.dot }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{notification.title}</div>
        {notification.message && <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{notification.message}</div>}
      </div>
      <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs" style={{ background: colors.bg, color: "var(--text-secondary)" }}>
        Close
      </button>
    </div>
  );
}
