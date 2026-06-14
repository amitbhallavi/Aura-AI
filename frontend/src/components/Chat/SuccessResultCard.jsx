const successLabels = {
  task_created: "Task added successfully",
  email_scheduled: "Email scheduled successfully",
  email_sent: "Email sent successfully",
  calendar_event_created: "Calendar event created",
  call_scheduled: "Call scheduled successfully",
  message_sent: "Message sent successfully",
  location_saved: "Location saved",
};

export default function SuccessResultCard({ successType, message, createdTask, relatedRecord, onOpenTasks }) {
  const title = successLabels[successType] || "Action completed successfully";
  const scheduledAt = createdTask?.remind_at || createdTask?.scheduledAt || relatedRecord?.scheduledFor || relatedRecord?.scheduled_at;

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-500/10">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white">✓</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-emerald-700">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{message || "Aura completed the requested action."}</p>
          {createdTask?.title && (
            <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-[color:var(--bg-card)] p-3">
              <p className="text-xs font-semibold text-[color:var(--text-primary)]">{createdTask.title}</p>
              <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {createdTask.type || "task"}{scheduledAt ? ` · ${new Date(scheduledAt).toLocaleString("en-IN")}` : ""}
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {createdTask && (
              <button onClick={onOpenTasks} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white">
                Open Tasks
              </button>
            )}
            {createdTask?.id && (
              <span className="rounded-xl border border-emerald-500/20 px-3 py-2 text-xs text-emerald-700">
                Ref #{String(createdTask.id).slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
