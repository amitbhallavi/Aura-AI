const labels = {
  previous_draft: "Using previous draft",
  previous_location: "Using location results",
  previous_task: "Using previous task",
  previous_message: "Using chat memory",
  tool_result: "Using tool memory",
  pending_action: "Using pending action",
};

export default function MemoryReferencePill({ reference }) {
  return (
    <span title={reference?.summary || ""} className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-600">
      {labels[reference?.type] || "Using memory"}
    </span>
  );
}
