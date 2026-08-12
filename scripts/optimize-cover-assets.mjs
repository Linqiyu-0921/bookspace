import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(projectRoot, "data.js");
const auditPath = path.join(projectRoot, "imports", "2026-08-12-cover-optimization.json");
const shouldWrite = process.argv.includes("--write");
const threshold = 150 * 1024;
const dataSource = fs.readFileSync(dataPath, "utf8");
const context = {};

vm.createContext(context);
vm.runInContext(`${dataSource}\nthis.__BOOKS__ = BOOKS;`, context, { filename: "data.js" });

const byCover = new Map();
context.__BOOKS__.forEach(book => {
  if (!book.cover?.startsWith("covers/")) return;
  if (!byCover.has(book.cover)) byCover.set(book.cover, []);
  byCover.get(book.cover).push(book.title);
});

const candidates = [...byCover].flatMap(([cover, titles]) => {
  const sourcePath = path.join(projectRoot, cover);
  if (!fs.existsSync(sourcePath)) return [];
  const bytesBefore = fs.statSync(sourcePath).size;
  if (bytesBefore <= threshold || cover.endsWith(".webp")) return [];
  const parsed = path.parse(cover);
  return [{
    cover,
    titles,
    sourcePath,
    bytesBefore,
    optimizedCover: path.posix.join(parsed.dir, `opt_${parsed.name}.webp`)
  }];
});

if (!shouldWrite) {
  console.log(JSON.stringify({
    mode: "preview",
    candidates: candidates.length,
    bytesBefore: candidates.reduce((sum, item) => sum + item.bytesBefore, 0)
  }, null, 2));
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookspace-covers-"));
const results = [];
let nextData = dataSource;

try {
  for (const item of candidates) {
    const tempPath = path.join(tempDir, path.basename(item.optimizedCover));
    execFileSync("magick", [
      item.sourcePath,
      "-auto-orient",
      "-resize", "900x900>",
      "-strip",
      "-quality", "78",
      tempPath
    ]);

    const bytesAfter = fs.statSync(tempPath).size;
    const accepted = bytesAfter < item.bytesBefore;
    if (accepted) {
      fs.copyFileSync(tempPath, path.join(projectRoot, item.optimizedCover));
      nextData = nextData.replaceAll(`cover: "${item.cover}"`, `cover: "${item.optimizedCover}"`);
    }
    results.push({
      originalCover: item.cover,
      optimizedCover: accepted ? item.optimizedCover : null,
      titles: item.titles,
      bytesBefore: item.bytesBefore,
      bytesAfter,
      accepted
    });
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

fs.writeFileSync(dataPath, nextData);
fs.writeFileSync(auditPath, `${JSON.stringify({
  source: "local_cover_optimization",
  generatedAt: new Date().toISOString(),
  thresholdBytes: threshold,
  maxDimension: 900,
  format: "webp",
  quality: 78,
  results
}, null, 2)}\n`);

console.log(JSON.stringify({
  mode: "write",
  candidates: candidates.length,
  accepted: results.filter(item => item.accepted).length,
  bytesBefore: results.reduce((sum, item) => sum + item.bytesBefore, 0),
  bytesAfter: results.filter(item => item.accepted).reduce((sum, item) => sum + item.bytesAfter, 0)
}, null, 2));
