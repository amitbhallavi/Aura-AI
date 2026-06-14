export function normalizeLineEndings(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function safeTrimSingleLine(text) {
  return normalizeLineEndings(text).replace(/\s+/g, " ").trim();
}

export function preserveMultilineBody(text) {
  return normalizeLineEndings(text).replace(/[ \t]+\n/g, "\n");
}

export function preserveDraftText(text) {
  return preserveMultilineBody(text);
}

export function formatForDisplay(text) {
  return preserveMultilineBody(text);
}
