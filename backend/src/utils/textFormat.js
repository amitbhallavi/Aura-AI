function normalizeLineEndings(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function safeTrimSingleLine(text) {
  return normalizeLineEndings(text).replace(/\s+/g, " ").trim();
}

function preserveMultilineBody(text) {
  return normalizeLineEndings(text).replace(/[ \t]+\n/g, "\n");
}

function preserveDraftText(text) {
  return preserveMultilineBody(text);
}

function formatForDisplay(text) {
  return preserveMultilineBody(text);
}

module.exports = {
  normalizeLineEndings,
  safeTrimSingleLine,
  preserveMultilineBody,
  preserveDraftText,
  formatForDisplay,
};
