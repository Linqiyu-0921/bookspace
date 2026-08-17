import fs from "node:fs";

const sessionPath = process.argv[process.argv.indexOf("--session") + 1];
const outputPath = process.argv[process.argv.indexOf("--output") + 1];
if (!sessionPath || sessionPath.startsWith("--")) {
  throw new Error("用法：node scripts/extract-bookfair-thread.mjs --session <rollout.jsonl>");
}

const targetMessageIds = new Set([
  "8e9eedc2-9f8a-4475-932b-d737b81e60fe",
  "9ead6421-a071-4988-bbe4-da423b183801",
  "a5640d47-7b1f-4c0b-96c1-9e6e38c392be",
  "41e7575f-8a31-4f2d-b3c8-7a42647a0f05",
  "bcd14099-b8c9-4ba2-82cf-164b7ae2c5ed",
  "c712eee6-34e1-4d0a-b8f4-2cd5ead6a401"
]);

function nestedThread(text) {
  const marker = "Output:\n";
  const start = text.indexOf(marker);
  const payload = start < 0 ? text : text.slice(start + marker.length);
  try {
    const decoded = JSON.parse(payload);
    return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
  } catch {
    return null;
  }
}

const messages = new Map();
for (const line of fs.readFileSync(sessionPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let event;
  try { event = JSON.parse(line); } catch { continue; }
  if (!["custom_tool_call_output", "function_call_output"].includes(event.payload?.type)) continue;
  const rawOutput = event.payload.output || [];
  const text = Array.isArray(rawOutput)
    ? rawOutput.map(item => item.text || "").join("")
    : String(rawOutput);
  const thread = nestedThread(text);
  if (!thread) continue;
  for (const turn of thread.turns || []) {
    for (const item of turn.items || []) {
      if (item.type === "agentMessage" && targetMessageIds.has(item.id)) {
        if ((messages.get(item.id)?.length || 0) < item.text.length) messages.set(item.id, item.text);
      }
    }
  }
}

function field(block, names) {
  const label = names.join("|");
  return block.match(new RegExp(`\\*\\*(?:${label})：\\*\\*\\s*([^\\n｜]+)`))?.[1]
    ?.replace(/\\s{2,}$/, "").trim() || "";
}

function clean(value) {
  return value.replace(/\*\*/g, "").replace(/[^]+/g, "").trim();
}

function splitAuthor(value) {
  const origin = value.match(/^\[([^\]]+)\]\s*/)?.[1] || "";
  return { origin, author: clean(value.replace(/^\[[^\]]+\]\s*/, "")) };
}

function candidate(no, title, block) {
  const authorRaw = field(block, ["作者(?:/脚本|/绘者)?", "作者/编著", "主编"]);
  const { origin, author } = splitAuthor(authorRaw);
  const version = clean(field(block, ["版本", "版本说明", "照片版"]));
  const isbn = block.match(/\b97[89]\d{10}\b/)?.[0] || "";
  const descriptionSource = block.replace(/[^]+/g, "");
  const descriptionBody = descriptionSource.match(/\*\*(?:封面\/书目页|封面\/书目|封面|书目)：\*\*[^\n]*\n+([\s\S]*)/)?.[1] || "";
  const description = clean(descriptionBody.split(/\n\s*\n/)[0] || "");
  return {
    sourceNo: no,
    title: clean(title),
    sub: "",
    author,
    origin,
    translator: clean(field(block, ["译者", "照片版译者"])).replace(/^(无|—).*$/, ""),
    publisher: clean(field(block, ["出版社", "大陆版出版社"])),
    year: version.match(/20\d{2}/)?.[0] || "",
    isbn,
    description,
    coverReference: "",
    verificationStatus: isbn ? "source_verified" : "metadata_incomplete",
    sourceRefs: [{
      conversationId: "6a8016c6-3c38-83e8-a744-21953c576752",
      message: "记书籍信息",
      sourceRow: clean(block.slice(0, 500))
    }]
  };
}

function detailedCandidates() {
  const first = messages.get("8e9eedc2-9f8a-4475-932b-d737b81e60fe") || "";
  const later = messages.get("9ead6421-a071-4988-bbe4-da423b183801") || "";
  const results = [];
  const firstPattern = /###\s+(\d+)\.\s+《([^》]+)》([\s\S]*?)(?=\n###\s+\d+\.|$)/g;
  for (const match of first.matchAll(firstPattern)) results.push(candidate(Number(match[1]), match[2], match[3]));
  const laterPattern = /\d+\.\s+\*\*(\d+)｜《([^》]+)》\*\*([\s\S]*?)(?=\n\d+\.\s+\*\*\d+｜|$)/g;
  for (const match of later.matchAll(laterPattern)) results.push(candidate(Number(match[1]), match[2], match[3]));
  return results;
}

function quickTitles() {
  const ids = [
    "a5640d47-7b1f-4c0b-96c1-9e6e38c392be",
    "41e7575f-8a31-4f2d-b3c8-7a42647a0f05",
    "bcd14099-b8c9-4ba2-82cf-164b7ae2c5ed",
    "c712eee6-34e1-4d0a-b8f4-2cd5ead6a401"
  ];
  return ids.flatMap(id => [...(messages.get(id) || "").matchAll(/《([^》]+)》/g)].map(match => clean(match[1])));
}

const verified = detailedCandidates();
const normalize = value => value.toLowerCase().replace(/[\s·•:：,，。.!！?？'"“”‘’《》【】\[\]()（）—–\-_/\\]/g, "");
const known = new Set(verified.map(item => normalize(item.title)));
const pending = [...new Set(quickTitles())]
  .filter(title => ![...known].some(key => key.includes(normalize(title)) || normalize(title).includes(key)))
  .map(title => ({
    sourceNo: null,
    title,
    sub: "",
    author: "",
    origin: "",
    translator: "",
    publisher: "",
    year: "",
    isbn: "",
    description: "",
    coverReference: "",
    verificationStatus: "metadata_incomplete",
    sourceRefs: [{ conversationId: "6a8016c6-3c38-83e8-a744-21953c576752", message: "记书籍信息", sourceRow: `快速识别：《${title}》` }]
  }));

const candidates = [...verified, ...pending].map(item => ({
  ...item,
  matchStatus: "unchecked",
  importStatus: "pending",
  collections: ["shanghai-book-fair-2026"]
}));

if (process.argv.includes("--debug")) {
  console.error(JSON.stringify({
    messages: Object.fromEntries([...messages].map(([id, value]) => [id, value.length])),
    detailed: verified.length,
    quick: quickTitles().length,
    pending: pending.length
  }, null, 2));
}

const output = `${JSON.stringify({
  schemaVersion: 1,
  batchId: "2026-08-17-shanghai-book-fair",
  source: "chatgpt_conversation",
  sourceTaskId: "6a8016c6-3c38-83e8-a744-21953c576752",
  collection: "shanghai-book-fair-2026",
  generatedAt: new Date().toISOString(),
  candidates
}, null, 2)}\n`;
if (outputPath && !outputPath.startsWith("--")) fs.writeFileSync(outputPath, output);
else process.stdout.write(output);
