require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Render runs behind a proxy. Trust one proxy hop for client IP handling.
app.set("trust proxy", 1);

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait one minute." }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "online", app: "CheatGPT" });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const messages = req.body && req.body.messages;

    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
      return res.status(400).json({ error: "Send between 1 and 20 messages." });
    }

    const input = [];

    for (const message of messages) {
      if (
        !message ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.trim().length === 0 ||
        message.content.length > 4000
      ) {
        return res.status(400).json({ error: "Invalid message format." });
      }

      input.push({
        role: message.role,
        content: message.content
      });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const stream = await openai.responses.create({
      model: MODEL,
      instructions:
        "You are CheatGPT, a helpful and safe AI assistant. " +
        "Reply in the same language as the user. Be clear, accurate, and friendly.",
      input,
      stream: true
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        res.write("data: " + JSON.stringify({ text: event.delta }) + "\n\n");
      } else if (event.type === "response.failed" || event.type === "error") {
        res.write("data: " + JSON.stringify({ error: "The AI response failed. Please try again." }) + "\n\n");
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Chat API error:", error.message);

    if (!res.headersSent) {
      res.status(500).json({
        error: "CheatGPT could not get a response. Check the server configuration."
      });
    } else {
      if (!res.writableEnded) {
        res.write("data: " + JSON.stringify({
          error: "The AI service is temporarily unavailable."
        }) + "\n\n");
        res.end();
      }
    }
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found." });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CheatGPT is running on port ${PORT}`);
});
