// ============================================================
// Chat Controller — Gemini AI + Google STT/TTS
// ============================================================
const aiService = require("../services/openai.service");
const ChatLog = require("../../models/mongo/ChatLog");
const AIMemory = require("../../models/mongo/AIMemory");

// ---------------------------------------------------------------
// POST /api/chat/message
// ---------------------------------------------------------------
async function sendMessage(req, res) {
  const { message, language } = req.body;
  const userId = req.user.id;

  if (!message?.trim()) {
    return res.status(400).json({ error: "Message cannot be empty." });
  }

  try {
    // Auto-detect language if not provided
    let lang = language || "en";
    if (!language) {
      lang = await aiService.detectLanguage(message.trim()).catch(() => "en");
      if (!["en", "hi"].includes(lang)) lang = "en";
    }

    const aiResponse = await aiService.chat(userId, message.trim(), lang);

    // Save to MongoDB
    await ChatLog.create({
      userId,
      userMessage: message.trim(),
      aiResponse,
      language: lang,
      timestamp: new Date(),
    });

    res.json({ response: aiResponse, detectedLanguage: lang });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "AI service unavailable. Try again." });
  }
}

// ---------------------------------------------------------------
// GET /api/chat/history
// ---------------------------------------------------------------
async function getHistory(req, res) {
  const { limit = 50, skip = 0 } = req.query;
  try {
    const logs = await ChatLog.find({ userId: req.user.id })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select("-__v");
    res.json(logs);
  } catch (err) {
    console.error("History error:", err);
    res.status(500).json({ error: "Failed to fetch chat history." });
  }
}

// ---------------------------------------------------------------
// POST /api/chat/voice — Google STT → Gemini → Google TTS
// ---------------------------------------------------------------
async function voiceChat(req, res) {
  if (!req.file) return res.status(400).json({ error: "Audio file is required." });

  try {
    // Step 1: Google Speech-to-Text
    const transcript = await aiService.speechToText(req.file.buffer, req.file.mimetype);

    // Step 2: Detect language
    const lang = await aiService.detectLanguage(transcript).catch(() => "en");

    // Step 3: Gemini AI response
    const aiText = await aiService.chat(req.user.id, transcript, lang);

    // Step 4: Google Text-to-Speech
    const audioBuffer = await aiService.textToSpeech(aiText, lang);

    // Save to MongoDB
    await ChatLog.create({
      userId: req.user.id,
      userMessage: transcript,
      aiResponse: aiText,
      language: lang,
      timestamp: new Date(),
    }).catch(() => { });

    res.set("Content-Type", "audio/mpeg");
    res.set("X-Transcript", encodeURIComponent(transcript));
    res.set("X-AI-Response", encodeURIComponent(aiText));
    res.set("X-Language", lang);
    res.send(audioBuffer);
  } catch (err) {
    console.error("Voice chat error:", err);
    res.status(500).json({ error: "Voice processing failed." });
  }
}

// ---------------------------------------------------------------
// DELETE /api/chat/memory
// ---------------------------------------------------------------
async function clearMemory(req, res) {
  try {
    await AIMemory.deleteOne({ userId: req.user.id });
    res.json({ message: "AI memory cleared. Fresh start!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear memory." });
  }
}

module.exports = { sendMessage, getHistory, voiceChat, clearMemory };
