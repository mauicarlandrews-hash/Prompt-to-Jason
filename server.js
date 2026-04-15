import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[prompt-to-jason] ANTHROPIC_API_KEY is not set. API calls will fail until you add it to your environment."
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "missing",
});

app.use(cors());
app.use(express.json());

// Serve the static web app from this folder.
app.use(express.static(__dirname));

app.post("/api/translate", async (req, res) => {
  try {
    const { prompt, format } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing 'prompt' string in body." });
    }

    const targetFormat = format === "xml" ? "XML" : "JSON";

    const system = [
      "You convert natural language app or feature descriptions into structured representations.",
      "When the user asks for JSON, output ONLY valid JSON.",
      "When the user asks for XML, output ONLY valid XML.",
      "Do not explain your reasoning or add prose; return just the structured data.",
    ].join(" ");

    const userContent =
      targetFormat === "XML"
        ? `Convert the following English description into a well-structured XML representation.\n\nEnglish:\n${prompt}`
        : `Convert the following English description into a well-structured JSON representation.\n\nEnglish:\n${prompt}`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    const output = textBlock?.text?.trim() || "";

    return res.json({ output });
  } catch (err) {
    console.error("[prompt-to-jason] /api/translate error:", err);
    return res
      .status(500)
      .json({ error: "Translation failed. Check server logs and API key." });
  }
});

app.listen(port, () => {
  console.log(`[prompt-to-jason] Server listening on http://localhost:${port}`);
});

