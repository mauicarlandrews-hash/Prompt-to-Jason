import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "missing",
});

export default async function handler(req, res) {
  // Add simple CORS for development/safety if needed, 
  // though typically not required for same-domain Vercel calls.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "missing") {
      return res.status(401).json({ 
        error: "Anthropic API Key is missing. Please add ANTHROPIC_API_KEY to your Vercel Environment Variables." 
      });
    }

    const response = await anthropic.messages.create({
      model: "claude-opus-4-7",
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

    return res.status(200).json({ output });
  } catch (err) {
    console.error("[prompt-to-jason] API error:", err);
    return res
      .status(500)
      .json({ error: "Translation failed. Check server logs and API key." });
  }
}
