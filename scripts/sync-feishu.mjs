import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseToken = "PTV8bD3VqalscasqrdOc3BEin5c";
const tableId = "tblBtcwA4cc0nK9U";
const writeCompatibleOnly = process.argv.includes("--write-compatible");
const dryRun = process.argv.includes("--dry-run");
const uploadCovers = process.argv.includes("--upload-covers");
const addTravelOption = process.argv.includes("--add-travel-option");
const verifyFields = process.argv.includes("--verify-fields");
const shouldWrite = process.argv.includes("--write") || writeCompatibleOnly || dryRun || uploadCovers || addTravelOption;

const normalizeTitle = value => String(value || "")
  .toLowerCase()
  .replace(/[\s·•:：,，。.!！?？'"“”‘’《》【】\[\]()（）—–\-_/\\]/g, "");

function runLark(args) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const output = execFileSync("lark-cli", args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024
      });
      const response = JSON.parse(output);
      if (response.ok === false) throw new Error(JSON.stringify(response.error));
      return response.data || response;
    } catch (error) {
      const detail = `${error.message || ""}\n${error.stderr || ""}`;
      const retryable = /"type"\s*:\s*"network"|TLS handshake timeout/.test(detail);
      if (!retryable || attempt === 3) throw error;
      console.warn(`lark-cli network retry ${attempt}/3`);
    }
  }
}

function readBooks() {
  const source = fs.readFileSync(path.join(root, "data.js"), "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.__BOOKS__ = BOOKS;`, context, { filename: "data.js" });
  return context.__BOOKS__;
}

function readImportedBooks(books) {
  const batch = JSON.parse(fs.readFileSync(
    path.join(root, "imports", "2026-08-10-chatgpt-conversations.json"),
    "utf8"
  ));
  const byIsbn = new Map(books.filter(book => book.isbn).map(book => [book.isbn, book]));
  const byTitle = new Map(books.map(book => [normalizeTitle(book.title), book]));

  return batch.candidates
    .filter(candidate => candidate.importStatus === "imported")
    .map(candidate => byIsbn.get(candidate.isbn) || byTitle.get(normalizeTitle(candidate.title)))
    .filter(Boolean);
}

function readExistingRecords() {
  const records = [];
  for (let offset = 0; ; offset += 200) {
    const page = runLark([
      "base", "+record-list",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--field-id", "书名",
      "--field-id", "ISBN",
      "--field-id", "封面",
      "--offset", String(offset),
      "--limit", "200",
      "--format", "json"
    ]);
    page.data.forEach((values, index) => records.push({
      recordId: page.record_id_list[index],
      title: values[0] || "",
      isbn: values[1] || "",
      cover: values[2] || null
    }));
    if (!page.has_more) return records;
  }
}

function readFieldOptions(fieldId) {
  const options = [];
  for (let offset = 0; ; offset += 30) {
    const page = runLark([
      "base", "+field-search-options",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--field-id", fieldId,
      "--offset", String(offset),
      "--limit", "30",
      "--format", "json"
    ]);
    options.push(...page.options);
    if (options.length >= page.total) return options;
  }
}

function readBusinessRecords(fields) {
  const records = [];
  for (let offset = 0; ; offset += 200) {
    const args = [
      "base", "+record-list",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--offset", String(offset),
      "--limit", "200",
      "--format", "json"
    ];
    fields.forEach(field => args.push("--field-id", field));
    const page = runLark(args);
    page.data.forEach((values, index) => records.push({
      recordId: page.record_id_list[index],
      values
    }));
    if (!page.has_more) return records;
  }
}

function asRow(book) {
  return [
    book.title,
    false,
    book.tags,
    book.desc || null,
    book.isbn || null,
    book.cat,
    false,
    book.publisher || null,
    book.translator || null,
    book.year || null,
    null,
    null,
    null,
    null,
    book.author || null
  ];
}

const books = readBooks();
const imported = readImportedBooks(books);
const existing = readExistingRecords();
const existingIsbns = new Set(existing.map(record => record.isbn).filter(Boolean));
const existingTitles = new Set(existing.map(record => normalizeTitle(record.title)));
const websiteIsbns = new Set(books.map(book => book.isbn).filter(Boolean));
const websiteTitles = new Set(books.map(book => normalizeTitle(book.title)));
const websiteMissingInBase = books.filter(book => (
  !(book.isbn && existingIsbns.has(book.isbn))
  && !existingTitles.has(normalizeTitle(book.title))
));
const baseMissingFromWebsite = existing.filter(record => (
  !(record.isbn && websiteIsbns.has(record.isbn))
  && !websiteTitles.has(normalizeTitle(record.title))
));
const pending = imported.filter(book => (
  !(book.isbn && existingIsbns.has(book.isbn))
  && !existingTitles.has(normalizeTitle(book.title))
));
const categoryOptionList = readFieldOptions("fldcnEAAHC");
const tagOptionList = readFieldOptions("fld7XOK96E");
const categoryOptions = new Set(categoryOptionList.map(option => option.name));
const tagOptions = new Set(tagOptionList.map(option => option.name));
const pendingCategories = [...new Set(pending.map(book => book.cat))];
const pendingTags = [...new Set(pending.flatMap(book => book.tags))];
const missingCategoryOptions = pendingCategories.filter(value => !categoryOptions.has(value));
const missingTagOptions = pendingTags.filter(value => !tagOptions.has(value));
const booksWithMissingTagOptions = pending
  .filter(book => book.tags.some(tag => missingTagOptions.includes(tag)))
  .map(book => book.title);
const writable = writeCompatibleOnly
  ? pending.filter(book => book.tags.every(tag => tagOptions.has(tag)))
  : pending;
const coverCandidates = JSON.parse(fs.readFileSync(
  path.join(root, "imports", "2026-08-10-chatgpt-conversations.json"),
  "utf8"
)).candidates.filter(candidate => candidate.coverFile);
const existingByIsbn = new Map(existing.filter(record => record.isbn).map(record => [record.isbn, record]));
const existingByTitle = new Map(existing.map(record => [normalizeTitle(record.title), record]));
const pendingCoverUploads = coverCandidates
  .map(candidate => ({
    candidate,
    record: existingByIsbn.get(candidate.isbn) || existingByTitle.get(normalizeTitle(candidate.title))
  }))
  .filter(item => item.record && !item.record.cover);

const businessFields = [
  "书名",
  "读完",
  "细分标签",
  "简介",
  "ISBN",
  "分类",
  "私密",
  "出版社",
  "译者",
  "出版年份",
  "来源照片",
  "最近阅读",
  "封面参考链接",
  "微信读书ID",
  "作者"
];

console.log(JSON.stringify({
  mode: dryRun ? "dry-run" : (shouldWrite ? "write" : "preview"),
  websiteBooks: books.length,
  importedBooks: imported.length,
  baseRecordsBefore: existing.length,
  websiteMissingInBase: websiteMissingInBase.map(book => book.title),
  baseMissingFromWebsite: baseMissingFromWebsite.map(record => ({
    recordId: record.recordId,
    title: record.title,
    isbn: record.isbn
  })),
  alreadyInBase: imported.length - pending.length,
  pending: pending.length,
  missingCategoryOptions,
  missingTagOptions,
  booksWithMissingTagOptions,
  writable: writable.length,
  pendingCoverUploads: pendingCoverUploads.length,
  expectedBaseRecordsAfter: existing.length + pending.length
}, null, 2));

if (verifyFields) {
  const records = readBusinessRecords(businessFields);
  const byIsbn = new Map();
  const byTitle = new Map();
  records.forEach(record => {
    const [title, , , , isbn] = record.values;
    if (isbn) byIsbn.set(isbn, record);
    byTitle.set(normalizeTitle(title), record);
  });
  const normalizeValue = value => (value === "" || value === undefined ? null : value);
  const mismatches = [];
  imported.forEach(book => {
    const record = byIsbn.get(book.isbn) || byTitle.get(normalizeTitle(book.title));
    if (!record) {
      mismatches.push({ title: book.title, field: "record", expected: "present", actual: "missing" });
      return;
    }
    const expected = asRow(book);
    expected.forEach((value, index) => {
      const rawActual = record.values[index];
      const actual = index === 5 && Array.isArray(rawActual) && rawActual.length === 1
        ? rawActual[0]
        : normalizeValue(rawActual);
      const target = normalizeValue(value);
      if (JSON.stringify(actual) !== JSON.stringify(target)) {
        mismatches.push({
          title: book.title,
          field: businessFields[index],
          expected: target,
          actual
        });
      }
    });
  });
  console.log(JSON.stringify({
    verifiedImportedRecords: imported.length,
    checkedFieldsPerRecord: businessFields.length,
    mismatches
  }, null, 2));
  process.exit(mismatches.length ? 1 : 0);
}

if (!shouldWrite) process.exit(0);
if (addTravelOption) {
  const current = runLark([
    "base", "+field-get",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--field-id", "fld7XOK96E",
    "--format", "json"
  ]).field;
  if (tagOptions.has("旅行与生活")) {
    console.log(JSON.stringify({ option: "旅行与生活", updated: false, reason: "already_exists" }));
    process.exit(0);
  }
  const definition = {
    name: current.name,
    type: current.type,
    multiple: current.multiple,
    options: [
      ...tagOptionList.map(({ name, hue, lightness }) => ({ name, hue, lightness })),
      { name: "旅行与生活", hue: "Wathet", lightness: "Lighter" }
    ]
  };
  const args = [
    "base", "+field-update",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--field-id", "fld7XOK96E",
    "--json", JSON.stringify(definition),
    "--yes",
    "--format", "json"
  ];
  if (dryRun) args.push("--dry-run");
  runLark(args);
  console.log(JSON.stringify({ option: "旅行与生活", updated: !dryRun, dryRun }));
  process.exit(0);
}
if (uploadCovers) {
  for (const { candidate, record } of pendingCoverUploads) {
    const args = [
      "base", "+record-upload-attachment",
      "--base-token", baseToken,
      "--table-id", tableId,
      "--record-id", record.recordId,
      "--field-id", "fldHDTTdzD",
      "--file", `./${candidate.coverFile}`,
      "--format", "json"
    ];
    if (dryRun) args.push("--dry-run");
    runLark(args);
    console.log(JSON.stringify({ title: candidate.title, uploaded: candidate.coverFile }));
  }
  process.exit(0);
}
if (!writable.length) process.exit(0);
if (!writeCompatibleOnly && (missingCategoryOptions.length || missingTagOptions.length)) {
  throw new Error("Base 分类选项与待同步书目不兼容");
}

const fields = businessFields;

for (let start = 0; start < writable.length; start += 200) {
  const chunk = writable.slice(start, start + 200);
  const args = [
    "base", "+record-batch-create",
    "--base-token", baseToken,
    "--table-id", tableId,
    "--json", JSON.stringify({ fields, rows: chunk.map(asRow) }),
    "--format", "json"
  ];
  if (dryRun) args.push("--dry-run");
  const result = runLark(args);
  console.log(JSON.stringify({
    batch: `${start + 1}-${start + chunk.length}`,
    created: result.record_id_list?.length || result.records?.length || chunk.length
  }));
}
