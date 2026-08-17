import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function duplicateGroups(items, keyOf) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index: index + 1, title: item.title });
  });
  return [...groups].filter(([, entries]) => entries.length > 1);
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[\s·•:：,，。.!！?？'"“”‘’《》【】\[\]()（）—–\-_/\\]/g, "");
}

function hasValidIsbn13Checksum(isbn) {
  if (!/^\d{13}$/.test(isbn)) return false;
  const total = [...isbn].slice(0, 12).reduce((sum, digit, index) => (
    sum + Number(digit) * (index % 2 === 0 ? 1 : 3)
  ), 0);
  return (10 - (total % 10)) % 10 === Number(isbn[12]);
}

const context = {};
vm.createContext(context);
vm.runInContext(`${read("data.js")}\nthis.__BOOKSPACE__ = { BOOKS, CATEGORY_ORDER, CATEGORY_GROUPS, SPECIAL_COLLECTIONS };`, context, {
  filename: "data.js"
});

const { BOOKS, CATEGORY_ORDER, CATEGORY_GROUPS, SPECIAL_COLLECTIONS } = context.__BOOKSPACE__;
const categorySet = new Set(CATEGORY_ORDER);
const collectionSet = new Set(Object.keys(SPECIAL_COLLECTIONS));
const declaredLevel2 = new Map();

if (CATEGORY_ORDER.length !== 13 || categorySet.size !== 13) {
  errors.push("CATEGORY_ORDER 必须包含 13 个不重复的一级分类");
}
if (Object.keys(CATEGORY_GROUPS).length !== CATEGORY_ORDER.length) {
  errors.push("CATEGORY_GROUPS 必须与 CATEGORY_ORDER 的一级分类完全对齐");
}
CATEGORY_ORDER.forEach(category => {
  const tags = CATEGORY_GROUPS[category];
  if (!Array.isArray(tags) || !tags.length) {
    errors.push(`CATEGORY_GROUPS 缺少有效映射：${category}`);
    return;
  }
  tags.forEach(tag => {
    if (declaredLevel2.has(tag)) {
      errors.push(`二级分类在 CATEGORY_GROUPS 中重复：${tag}`);
    }
    declaredLevel2.set(tag, category);
  });
});

BOOKS.forEach((book, index) => {
  const label = `#${index + 1} ${book.title || "<无书名>"}`;
  if (!book.title) errors.push(`${label}：缺少 title`);
  if (!categorySet.has(book.cat)) errors.push(`${label}：未知一级分类 ${book.cat || "<空>"}`);
  if (!Array.isArray(book.tags) || book.tags.length !== 1) {
    errors.push(`${label}：tags 必须是只含一个二级分类的数组`);
  } else if (declaredLevel2.get(book.tags[0]) !== book.cat) {
    errors.push(`${label}：二级分类 ${book.tags[0]} 不属于 ${book.cat}`);
  }
  if (!Array.isArray(book.tag3)) errors.push(`${label}：tag3 必须是数组`);
  if (book.collections && !Array.isArray(book.collections)) {
    errors.push(`${label}：collections 必须是数组`);
  } else {
    (book.collections || []).forEach(collection => {
      if (!collectionSet.has(collection)) errors.push(`${label}：未知专题 ${collection}`);
    });
  }
  if (book.isbn && !/^\d{13}$/.test(String(book.isbn))) {
    errors.push(`${label}：ISBN 必须是 13 位数字`);
  }
  if (book.isbn && !hasValidIsbn13Checksum(String(book.isbn))) {
    errors.push(`${label}：ISBN-13 校验位错误 ${book.isbn}`);
  }
  if (/ISBN|出版社/.test(book.translator || "")) {
    errors.push(`${label}：translator 疑似混入出版信息`);
  }
  if (book.cover && !fs.existsSync(path.join(projectRoot, book.cover))) {
    errors.push(`${label}：封面文件不存在 ${book.cover}`);
  }
  if (book.source === "weread" && !book.wrId) warnings.push(`${label}：微信读书条目缺少 wrId`);
  if (!book.author) warnings.push(`${label}：缺少作者`);
});

const dataCategories = new Set(BOOKS.map(book => book.cat));
CATEGORY_ORDER.forEach(category => {
  if (!dataCategories.has(category)) errors.push(`一级分类没有书籍：${category}`);
});

const level2Parents = new Map();
BOOKS.forEach(book => {
  (book.tags || []).forEach(tag => {
    if (!level2Parents.has(tag)) level2Parents.set(tag, new Set());
    level2Parents.get(tag).add(book.cat);
  });
});
level2Parents.forEach((parents, tag) => {
  if (parents.size !== 1) errors.push(`二级分类跨越多个一级分类：${tag}`);
});
declaredLevel2.forEach((category, tag) => {
  if (!level2Parents.has(tag)) warnings.push(`已定义但无书籍使用的二级分类：${category} / ${tag}`);
});

duplicateGroups(BOOKS, book => book.isbn).forEach(([isbn, entries]) => {
  warnings.push(`重复 ISBN ${isbn}：${entries.map(entry => entry.title).join(" / ")}`);
});
duplicateGroups(BOOKS, book => normalizeTitle(book.title)).forEach(([titleKey, entries]) => {
  warnings.push(`同名版本 ${titleKey}：${entries.map(entry => entry.title).join(" / ")}`);
});

for (const script of ["search.js", "app.js", "overview.js"]) {
  new vm.Script(read(script), { filename: script });
}

const stats = {
  books: BOOKS.length,
  physical: BOOKS.filter(book => book.source !== "weread").length,
  weread: BOOKS.filter(book => book.source === "weread").length,
  categories: CATEGORY_ORDER.length,
  level2: declaredLevel2.size,
  level3: new Set(BOOKS.flatMap(book => book.tag3 || [])).size,
  covers: BOOKS.filter(book => book.cover).length,
  fallbackCovers: BOOKS.filter(book => !book.cover).length
};
const dataTitleKeys = new Set(BOOKS.map(book => normalizeTitle(book.title)));
const dataIsbns = new Set(BOOKS.map(book => book.isbn).filter(Boolean));

const importsDir = path.join(projectRoot, "imports");
const importStats = [];
if (fs.existsSync(importsDir)) {
  fs.readdirSync(importsDir)
    .filter(file => file.endsWith(".json"))
    .sort()
    .forEach(file => {
      const relativePath = path.join("imports", file);
      const batch = JSON.parse(read(relativePath));
      if (batch.source === "local_cover_optimization" && Array.isArray(batch.results)) {
        batch.results.forEach((result, index) => {
          const label = `${relativePath}#${index + 1}`;
          if (!result.originalCover || !Array.isArray(result.titles) || !result.titles.length) {
            errors.push(`${label}：封面优化记录缺少原文件或书名`);
          }
          if (result.accepted && (!result.optimizedCover || !fs.existsSync(path.join(projectRoot, result.optimizedCover)))) {
            errors.push(`${label}：优化文件不存在 ${result.optimizedCover || "<空>"}`);
          }
          if (result.accepted && result.bytesAfter >= result.bytesBefore) {
            errors.push(`${label}：优化文件未减小体积`);
          }
        });
        importStats.push({ file, candidates: batch.results.length });
        return;
      }
      if (batch.schemaVersion !== 1 || !Array.isArray(batch.candidates)) {
        errors.push(`${relativePath}：不符合导入批次 schemaVersion 1`);
        return;
      }
      const isCoverRecovery = batch.source === "douban_isbn_page";
      const isbnKeys = new Set();
      const titleKeys = new Set();
      batch.candidates.forEach((candidate, index) => {
        const label = `${relativePath}#${index + 1}`;
        if (!candidate.title) errors.push(`${label}：缺少 title`);
        if (isCoverRecovery) {
          if (!/^\d{13}$/.test(String(candidate.isbn || ""))) {
            errors.push(`${label}：封面恢复记录必须有 13 位 ISBN`);
          }
          if (!['downloaded', 'no_real_cover', 'isbn_not_found', 'download_failed'].includes(candidate.downloadStatus)) {
            errors.push(`${label}：未知 downloadStatus ${candidate.downloadStatus || '<空>'}`);
          }
          if (candidate.downloadStatus === 'downloaded' && !candidate.coverFile) {
            errors.push(`${label}：已下载封面缺少 coverFile`);
          }
        } else {
          if (!Array.isArray(candidate.sourceRefs) || !candidate.sourceRefs.length) {
            errors.push(`${label}：缺少 sourceRefs`);
          }
          if (!['new_candidate', 'already_in_data'].includes(candidate.matchStatus)) {
            errors.push(`${label}：未知 matchStatus ${candidate.matchStatus || '<空>'}`);
          }
          if (!['pending', 'imported', 'skipped_existing'].includes(candidate.importStatus)) {
            errors.push(`${label}：未知 importStatus ${candidate.importStatus || '<空>'}`);
          }
        }
        if (candidate.isbn && !hasValidIsbn13Checksum(String(candidate.isbn))) {
          errors.push(`${label}：ISBN-13 校验位错误 ${candidate.isbn}`);
        }
        if (/ISBN|出版社/.test(candidate.translator || '')) {
          errors.push(`${label}：translator 疑似混入出版信息`);
        }
        if (candidate.coverFile && !fs.existsSync(path.join(projectRoot, candidate.coverFile))) {
          errors.push(`${label}：封面文件不存在 ${candidate.coverFile}`);
        }
        if (!isCoverRecovery && candidate.importStatus === 'imported') {
          const exists = dataTitleKeys.has(normalizeTitle(candidate.title)) || (candidate.isbn && dataIsbns.has(candidate.isbn));
          if (!exists) errors.push(`${label}：标记为 imported 但 data.js 中无对应书籍`);
        }
        if (candidate.isbn) {
          if (!/^\d{13}$/.test(String(candidate.isbn))) errors.push(`${label}：ISBN 必须是 13 位数字`);
          if (isbnKeys.has(candidate.isbn)) errors.push(`${relativePath}：重复候选 ISBN ${candidate.isbn}`);
          isbnKeys.add(candidate.isbn);
        } else {
          const titleKey = normalizeTitle(candidate.title);
          if (titleKeys.has(titleKey)) errors.push(`${relativePath}：重复无 ISBN 候选 ${candidate.title}`);
          titleKeys.add(titleKey);
        }
      });
      importStats.push({ file, candidates: batch.candidates.length });
    });
}

console.log(JSON.stringify({ ok: errors.length === 0, stats, imports: importStats, errors, warnings }, null, 2));
if (errors.length) process.exit(1);
