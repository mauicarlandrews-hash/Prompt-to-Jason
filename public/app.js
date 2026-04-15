const promptInput = document.getElementById("prompt");
const translateBtn = document.getElementById("translateBtn");
const outputEl = document.getElementById("output");
const copyBtn = document.getElementById("copyBtn");
const jsonFormatBtn = document.getElementById("jsonFormatBtn");
const xmlFormatBtn = document.getElementById("xmlFormatBtn");
const outputLabel = document.getElementById("outputLabel");

let currentFormat = "json";

function inferJsonFromPrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "// Enter an English prompt on the left.\n// JSON will appear here.";
  }

  // Extremely simple heuristic examples to make the tool feel useful
  // without any backend or API keys.
  const lower = trimmed.toLowerCase();

  // Detect "create user" style prompts
  if (lower.startsWith("create a user") || lower.startsWith("create user")) {
    return JSON.stringify(
      {
        action: "createUser",
        fields: [
          { name: "name", type: "string", required: true },
          { name: "email", type: "string", required: true },
          { name: "isAdmin", type: "boolean", required: false },
        ],
        description: trimmed,
      },
      null,
      2
    );
  }

  // Fallback: wrap the prompt into a generic JSON envelope
  return JSON.stringify(
    {
      description: "Natural language prompt converted to JSON envelope.",
      originalPrompt: trimmed,
    },
    null,
    2
  );
}

function inferXmlFromPrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "<!-- Enter an English prompt on the left. XML will appear here. -->";
  }

  const escape = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const lines = trimmed.split(/\r?\n/);

  // Infer basic fields for the <application> schema.
  let name = "";
  let descriptionLines = [];

  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;

    const lower = raw.toLowerCase();
    if (!name && (lower.startsWith("name:") || lower.startsWith("app name:") || lower.startsWith("application name:"))) {
      const idx = raw.indexOf(":");
      name = raw.slice(idx + 1).trim();
    } else if (!name && (lower.includes("app") || lower.includes("application")) && raw.length <= 80) {
      // Short first line that looks like an app name.
      name = raw;
    } else {
      descriptionLines.push(raw);
    }
  }

  if (!name) {
    name = "My Application";
  }

  const description = descriptionLines.length ? descriptionLines.join(" ") : trimmed;

  // Try to guess a primary color from common color words.
  let primaryColor = "";
  const colorMatch = description.toLowerCase().match(/\b(blue|red|green|yellow|purple|orange|pink|teal|cyan)\b/);
  if (colorMatch) {
    primaryColor = colorMatch[1];
  }

  // Very simple action inference based on verbs in sentences.
  const actions = [];
  const sentenceCandidates = description.split(/[\.\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const s of sentenceCandidates) {
    const lower = s.toLowerCase();

    if ((lower.includes("remove") || lower.includes("delete")) && lower.includes(".jpg")) {
      actions.push({
        type: "remove",
        fileType: ".jpg",
        raw: s,
      });
    } else if (lower.includes("copy")) {
      actions.push({
        type: "copy",
        raw: s,
      });
    } else if (lower.includes("delete") || lower.includes("remove")) {
      actions.push({
        type: "delete",
        raw: s,
      });
    }
  }

  const xmlParts = [];
  xmlParts.push("<application>");
  xmlParts.push(`  <name>${escape(name)}</name>`);
  xmlParts.push("  <description>");
  xmlParts.push(`        ${escape(description)}`);
  xmlParts.push("  </description>");

  xmlParts.push("  <colorScheme>");
  xmlParts.push(`    <primaryColor>${escape(primaryColor || "default")}</primaryColor>`);
  xmlParts.push("  </colorScheme>");

  xmlParts.push("  <actions>");
  for (const action of actions) {
    if (action.type === "remove" && action.fileType) {
      xmlParts.push('    <action type="remove">');
      xmlParts.push(`      <fileType>${escape(action.fileType)}</fileType>`);
      xmlParts.push("    </action>");
    } else if (action.type === "copy") {
      xmlParts.push('    <action type="copy">');
      xmlParts.push("      <sourceFolder>old_folder_path</sourceFolder>");
      xmlParts.push("      <destinationFolder>new_folder_path</destinationFolder>");
      xmlParts.push("    </action>");
    } else if (action.type === "delete") {
      xmlParts.push('    <action type="delete">');
      xmlParts.push("      <folder>old_folder_path</folder>");
      xmlParts.push("    </action>");
    }
  }
  xmlParts.push("  </actions>");
  xmlParts.push("</application>");

  return xmlParts.join("\n");
}

async function callApi(prompt, format) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return format === "xml"
      ? "<!-- Enter an English prompt on the left. XML will appear here. -->"
      : "// Enter an English prompt on the left.\n// JSON will appear here.";
  }

  const resp = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: trimmed, format }),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.output || "";
}

async function handleTranslate() {
  const prompt = promptInput.value;
  const trimmed = prompt.trim();

  if (!trimmed) {
    outputEl.textContent =
      currentFormat === "xml"
        ? "<!-- Enter an English prompt on the left. XML will appear here. -->"
        : "// Enter an English prompt on the left.\n// JSON will appear here.";
    outputEl.classList.add("empty");
    return;
  }

  outputEl.textContent = "Translating with API…";
  outputEl.classList.remove("empty");

  try {
    const result = await callApi(prompt, currentFormat);
    outputEl.textContent = result || "(no output)";
  } catch (e) {
    // Fallback to local heuristic inference if API fails
    console.warn("API translation failed, falling back to local heuristics:", e);
    
    // Check if we can get a specific error message from the error object
    const errorMessage = e.message && e.message.includes("API Key is missing")
      ? "// ERROR: Anthropic API Key is missing in Vercel settings.\n// Falling back to local heuristics..."
      : null;

    const mockResult = currentFormat === "xml" 
      ? inferXmlFromPrompt(prompt) 
      : inferJsonFromPrompt(prompt);
      
    outputEl.textContent = errorMessage ? `${errorMessage}\n\n${mockResult}` : mockResult;
    
    // Add a temporary notice that this is a mock
    const originalLabel = outputLabel.textContent;
    outputLabel.textContent = `${originalLabel} (Local Heuristic)`;
    setTimeout(() => {
      outputLabel.textContent = originalLabel;
    }, 3000);
  }
}

function handleCopy() {
  const text = outputEl.textContent;
  if (!text || outputEl.classList.contains("empty")) return;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    })
    .catch(() => {
      // Ignore clipboard errors in older browsers.
    });
}

translateBtn.addEventListener("click", () => {
  handleTranslate();
});
copyBtn.addEventListener("click", handleCopy);

jsonFormatBtn.addEventListener("click", () => {
  currentFormat = "json";
  jsonFormatBtn.classList.add("active");
  xmlFormatBtn.classList.remove("active");
  outputLabel.textContent = "JSON output";
  handleTranslate();
});

xmlFormatBtn.addEventListener("click", () => {
  currentFormat = "xml";
  xmlFormatBtn.classList.add("active");
  jsonFormatBtn.classList.remove("active");
  outputLabel.textContent = "XML output";
  handleTranslate();
});

promptInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    handleTranslate();
  }
});

// Initial empty state
outputEl.textContent = "// Enter an English prompt on the left.\n// Output will appear here.";
outputEl.classList.add("empty");

