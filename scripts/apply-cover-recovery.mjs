import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceArg = process.argv[process.argv.indexOf("--source") + 1];
const shouldWrite = process.argv.includes("--write");

if (!sourceArg || sourceArg.startsWith("--")) {
  throw new Error("用法：node scripts/apply-cover-recovery.mjs --source <results.json> [--write]");
}

const input = JSON.parse(fs.readFileSync(path.resolve(sourceArg), "utf8"));
const candidates = input.map(item => ({
  ...item,
  matched: Boolean(
    item.isbnVerified
    && item.coverUrl
    && !item.coverUrl.includes("book-default")
  )
}));

console.log(JSON.stringify({
  mode: shouldWrite ? "write" : "preview",
  checked: candidates.length,
  exactMatches: candidates.filter(item => item.matched).length,
  unresolved: candidates.filter(item => !item.matched).length
}, null, 2));

if (!shouldWrite) process.exit(0);

const downloaded = [];
for (const item of candidates.filter(candidate => candidate.matched)) {
  const relativeCover = `covers/isbn_${item.isbn}.webp`;
  const finalPath = path.join(root, relativeCover);
  const tempPath = `/tmp/bookspace_cover_${item.isbn}.image`;

  try {
    if (!fs.existsSync(finalPath)) {
      execFileSync("curl", [
        "-L",
        "--fail",
        "--silent",
        "--show-error",
        "--max-time", "30",
        "--retry", "2",
        "--retry-all-errors",
        "-A", "Mozilla/5.0",
        "-e", "https://book.douban.com/",
        "-o", tempPath,
        item.coverUrl
      ], { stdio: "pipe" });
      execFileSync("magick", [
        tempPath,
        "-auto-orient",
        "-strip",
        "-resize", "900x900>",
        "-quality", "80",
        finalPath
      ], { stdio: "pipe" });
    }

    if (fs.statSync(finalPath).size < 1_000) throw new Error("生成图片异常小");
    item.coverFile = relativeCover;
    item.downloadStatus = "downloaded";
    downloaded.push(item);
  } catch (error) {
    item.downloadStatus = "download_failed";
    item.error = String(error.message || error);
  }
}

for (const item of candidates.filter(candidate => !candidate.matched)) {
  item.downloadStatus = item.isbnVerified ? "no_real_cover" : "isbn_not_found";
}

const dataPath = path.join(root, "data.js");
let dataSource = fs.readFileSync(dataPath, "utf8");
const objectPattern = /\n  \{[\s\S]*?\n  \}(?=,?\n)/g;
const edits = [];

for (const match of dataSource.matchAll(objectPattern)) {
  let book;
  try {
    book = vm.runInNewContext(`(${match[0].trim()})`);
  } catch {
    continue;
  }
  if (book.cover) continue;
  const recovered = downloaded.find(item => item.isbn === book.isbn && item.title === book.title);
  if (!recovered) continue;

  const snippet = match[0];
  const isbnPattern = new RegExp(`(\\n(\\s*)("?)isbn\\3:\\s*"${recovered.isbn}",)`);
  const isbnMatch = snippet.match(isbnPattern);
  if (!isbnMatch) throw new Error(`无法定位 ISBN 字段：${recovered.title}`);
  const quote = isbnMatch[3];
  const insertion = `${isbnMatch[1]}\n${isbnMatch[2]}${quote}cover${quote}: "${recovered.coverFile}",`;
  const nextSnippet = snippet.replace(isbnPattern, insertion);
  edits.push({ start: match.index, end: match.index + snippet.length, value: nextSnippet });
}

for (const edit of edits.sort((a, b) => b.start - a.start)) {
  dataSource = dataSource.slice(0, edit.start) + edit.value + dataSource.slice(edit.end);
}

if (edits.length !== downloaded.length) {
  throw new Error(`下载 ${downloaded.length} 张，但只定位到 ${edits.length} 条 data.js 记录`);
}

fs.writeFileSync(dataPath, dataSource);
fs.writeFileSync(
  path.join(root, "imports", "2026-08-12-cover-recovery.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-08-12",
    source: "douban_isbn_page",
    matchingRule: "页面明确回显同一 ISBN，且封面不是站点默认占位图",
    stats: {
      checked: candidates.length,
      downloaded: downloaded.length,
      unresolved: candidates.length - downloaded.length
    },
    candidates
  }, null, 2)}\n`
);

console.log(JSON.stringify({ downloaded: downloaded.length, dataUpdates: edits.length }, null, 2));
