
require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

if (!process.env.OPENAI_API_KEY) {
    console.error("Missing API Key!");
    process.exit(1);
}

const ai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/chat", rateLimit({
    windowMs: 60 * 1000,
    limit: 15
}));

app.post("/api/chat", async (req, res) => {

    try {

        const messages = req.body.messages;

        if (
            !Array.isArray(messages) ||
            messages.length < 1 ||
            messages.length > 20
        ) {
            return res.status(400).json({
                error: "Invalid messages"
            });
        }

        const input = [];

        for (const msg of messages) {

            if (
                !msg ||
                !["user", "assistant"].includes(msg.role) ||
                typeof msg.content !== "string" ||
                msg.content.length > 4000
            ) {
                return res.status(400).json({
                    error: "Invalid message format"
                });
            }

            input.push({
                role: msg.role,
                content: msg.content
            });
        }

        const stream = await ai.responses.create({

            model: "gpt-5.5",

            instructions:
                "You are CheatGPT, a helpful AI assistant. " +
                "Reply in the language used by the user. " +
                "Be accurate, clear and friendly.",

            input: input,

            stream: true
        });

        res.setHeader(
            "Content-Type",
            "text/event-stream"
        );

        res.setHeader(
            "Cache-Control",
            "no-cache"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );

        for await (const event of stream) {

            if (event.type === "response.output_text.delta") {

                res.write(
                    "data: " +
                    JSON.stringify({
                        text: event.delta
                    }) +
                    "\n\n"
                );
            }

            if (event.type === "response.completed") {
                res.write("data: [DONE]\n\n");
            }

            if (event.type === "response.failed") {
                throw new Error("AI response failed");
            }
        }

        res.end();

    } catch (error) {

        console.error("AI Error:", error.message);

        if (!res.headersSent) {
            res.status(500).json({
                error: "AI service unavailable"
            });
        } else {
            res.write(
                "data: " +
                JSON.stringify({
                    error: "AI service unavailable"
                }) +
                "\n\n"
            );
            res.end();
        }
    }

});

app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        app: "CheatGPT"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "127.0.0.1", () => {

    console.log(
        "CheatGPT running on http://localhost:" + PORT
    );

});
