# AGENTS.md

## Project
Aura AI is an existing AI assistant platform using React/JSX, Tailwind CSS, Node.js, Express, MongoDB, PostgreSQL auth data, Gemini, Google Maps API, Google Calendar API, and Gmail API integration.
Voice Commander AI is layered on top of the existing Gemini agent/tool-calling route and must not replace the normal text chat flow.

## Code Rules
- Use JavaScript only.
- Do not use TypeScript.
- Use JSX for React components.
- Use Tailwind CSS only.
- Do not add unnecessary custom CSS.
- Follow the existing folder structure.
- Do not expose API keys in frontend.
- Store all secrets in backend environment variables.
- Keep changes focused.
- Do not rewrite the whole app unless required.
- Add confirmation before sending emails or changing calendar data.
- Sensitive actions require confirmation before execution.
- Use backend tool/function calling for real-world AI actions.
- Add safe fallback behavior when external AI/API providers fail.
- Do not store raw voice audio by default.
- Voice commands that change Gmail, Calendar, or automation data require confirmation.
- Run build/lint/test commands if available before final response.

## Expected Final Summary
After finishing, summarize:
- Files changed
- Features added
- Env variables required
- Commands run
- How to test
- Known limitations
