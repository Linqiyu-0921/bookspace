import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data.js");
const sourceArg = process.argv[process.argv.indexOf("--source") + 1];
const importPath = sourceArg && !sourceArg.startsWith("--")
  ? path.resolve(sourceArg)
  : path.join(root, "imports", "2026-08-10-chatgpt-conversations.json");
const shouldWrite = process.argv.includes("--write");
const shouldRepair = process.argv.includes("--repair-batch");

const normalizeTitle = value => String(value || "")
  .toLowerCase()
  .replace(/[\s·•:：,，。.!！?？'"“”‘’《》【】\[\]()（）—–\-_/\\]/g, "");

const source = fs.readFileSync(dataPath, "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.__BOOKS__ = BOOKS;`, context, { filename: "data.js" });

const batch = JSON.parse(fs.readFileSync(importPath, "utf8"));
const existingTitles = new Set(context.__BOOKS__.map(book => normalizeTitle(book.title)));
const existingIsbns = new Set(context.__BOOKS__.map(book => book.isbn).filter(Boolean));

function classification(candidate) {
  const title = candidate.title || "";
  const text = [candidate.title, candidate.description]
    .filter(Boolean)
    .join(" ");

  const bySourceNo = {
    "历史与地理|中国历史|历史研究": [1,2,3,4,5,7,8,34,35,36,52,54,97,98,99,100,101,104,105,106,111,112,116,117,118,129,131,132],
    "历史与地理|世界历史|世界史": [102,103,107],
    "社会与文化|文化研究|文化研究": [10,28,30,31,38,44,45,46,113,114,115,130,133],
    "经济与商业|管理|经济社会": [11],
    "哲学与思想|哲学分支|哲学思想": [9,13,66,67,68],
    "文学与小说|戏剧与文学理论|文学研究": [6,12,14,20,21,37,50,119,120],
    "文学与小说|诗歌|诗歌": [15,16,18,19,33],
    "文学与小说|小说|小说": [22,23,24,25,26,29,32,55,58,59,60,61,62,64,122,134,135],
    "文学与小说|散文与随笔|散文·随笔": [27,48,121,123],
    "心理与成长|基础心理学|心理学": [40,41,43,108],
    "心理与成长|人际与关系|亲密关系": [39,109],
    "心理与成长|情绪与自我成长|心理成长": [65],
    "科学与科普|科学文化|科学科普": [42,63],
    "教育与语言|教育|教育": [17],
    "人物与传记|人物领域|人物传记": [53,56,57],
    "艺术与设计|电影音乐与表演|艺术·影像": [47,49,51],
    "计算机与技术|数据与信息技术|计算机科学": [110],
    "漫画与流行文化|漫画|漫画": [124,125,126,127,128]
  };
  if (candidate.sourceNo) {
    for (const [key, numbers] of Object.entries(bySourceNo)) {
      if (!numbers.includes(candidate.sourceNo)) continue;
      const [cat, tag2, tag] = key.split("|");
      const tag3 = cat === "历史与地理" ? [tag2 === "中国历史" ? "中国通史" : "世界通史"]
        : cat === "文学与小说" ? [tag2 === "小说" ? "长篇小说" : "文学批评"]
        : cat === "漫画与流行文化" ? ["大众文化"]
        : cat === "计算机与技术" ? ["计算机科学"]
        : cat === "科学与科普" ? ["趣味科普"]
        : cat === "人物与传记" ? ["人物传记"]
        : cat === "心理与成长" ? ["心理学入门"]
        : ["思想史"];
      return { cat, tags: [tag2], tag3, tag };
    }
  }

  if (/漫画|认知症照护/.test(text)) {
    return { cat: "漫画与流行文化", tags: ["漫画"], tag3: ["大众文化"], tag: "漫画" };
  }
  if (/\bAI\b|人工智能|编程|信息技术|数字人文/.test(text)) {
    return { cat: "计算机与技术", tags: ["人工智能"], tag3: ["人工智能入门"], tag: "技术" };
  }
  if (/核反应堆|生态系统|固碳|环境史|自然大历史|结构：万事万物/.test(text)) {
    return { cat: "科学与科普", tags: ["科学文化"], tag3: ["趣味科普"], tag: "科学科普" };
  }
  if (/教育|大学|教学|书院/.test(title)) {
    return { cat: "教育与语言", tags: ["教育"], tag3: ["教育学"], tag: "教育" };
  }
  if (/诗|词|尝试集|世界把我照亮|低处飞行|手持人间一束光|我笨拙地爱着这个世界/.test(title)) {
    return { cat: "文学与小说", tags: ["诗歌"], tag3: ["中国古诗词"], tag: "诗歌·诗词" };
  }
  if (/心理|情绪|焦虑|不开心|逆商|孤独六讲|放轻松|耿耿于怀|个人成长/.test(text)) {
    return { cat: "心理与成长", tags: ["情绪与自我成长"], tag3: ["情绪管理"], tag: "心理成长" };
  }
  if (/人口与日本经济|房地产|财富|商业|市场如何塑造城市/.test(text)) {
    return { cat: "经济与商业", tags: ["管理"], tag3: ["经济史"], tag: "经济社会" };
  }
  if (/传：|传记|女王传|人物世界|回忆录|未经删节|长书当诉|画魂：/.test(title)) {
    return { cat: "人物与传记", tags: ["人物领域"], tag3: ["人物传记"], tag: "人物传记" };
  }
  if (/建筑|营造|园林|聚落|民居|勒·柯布西耶|高迪|赖特|贝聿铭|四合院|柯林·戴维斯|格罗皮乌斯|维米尔|市中心|公共空间|城市研究|城市规划|生活圈规划/.test(text)) {
    return { cat: "艺术与设计", tags: ["建筑与城市"], tag3: ["建筑史"], tag: "建筑·城市" };
  }
  if (/电影|摄影|音乐|艺术|杜尚|潘玉良|美术|插画|画魂|牡丹亭|昆曲|帕索里尼|David Lynch|林奇|张国荣|久石让|话剧|剧本/.test(text)) {
    return { cat: "艺术与设计", tags: ["电影音乐与表演"], tag3: ["电影史"], tag: "艺术·影像" };
  }
  if (/传：|传记|女王传|人物世界|回忆录|未经删节|长书当诉/.test(title)) {
    return { cat: "人物与传记", tags: ["人物领域"], tag3: ["人物传记"], tag: "人物传记" };
  }
  if (/哲学|思想|易经|儒家|道统|阴阳|人本主义|存在与事件|鲍德里亚|威尔·杜兰特|孤独与团结|庆祝我们的失败|实用主义/.test(text)) {
    return { cat: "哲学与思想", tags: ["哲学分支"], tag3: ["思想史"], tag: "哲学思想" };
  }
  if (/社会|女性主义|性别|媒介|文化分析|知识分子|田野|乡村|梁庄|劳工|纪实|口述|非虚构|女性与权力|传媒时代|我们赞成差别对待|风痕|看见不可见社会|管理下班/.test(text)) {
    return { cat: "社会与文化", tags: ["文化研究"], tag3: ["社会生活史"], tag: "社会·文化" };
  }
  if (/旅程|旅行|探险|波斯|阿拉伯|阿富汗|巴尔干|西北航道|南极|赶在午夜降临前|阿拉伯之沙|荒野|跑者|鲸|美味|料理|吃的|饭局/.test(title)) {
    return { cat: "生活与旅行", tags: ["旅行与生活"], tag3: ["旅行文学"], tag: "生活·旅行" };
  }
  if (/史|古都|南京|北京|北平|上海|徐州|帝王州|故宫|中轴线|秦始皇|朱元璋|曹操|刘备|开捷琳娜|克里奥帕特拉|唐玄宗|六朝|建康|山围故国|寻城记|遇见南京|中国人|文明/.test(text)) {
    return { cat: "历史与地理", tags: ["中国历史"], tag3: ["地方史"], tag: "历史·城市" };
  }
  if (/诗|词|文学理论|文学批评|文学访谈|小说使用说明|小说是什么|小说机杼|叙事话语|红楼|金瓶梅|水浒|三国|少年中国|张爱玲|江苏十三美/.test(text)) {
    return { cat: "文学与小说", tags: ["戏剧与文学理论"], tag3: ["文学批评"], tag: "文学研究" };
  }
  if (/小说|巴别塔|半生缘|传奇|红玫瑰|雷峰塔|楼梯上的女人|太古和其他的时间|薄如晨曦|情欲|她的第三种生活|鲟鱼|好天气|龙凤歌|仪凤之门/.test(text)) {
    return { cat: "文学与小说", tags: ["小说"], tag3: ["长篇小说"], tag: "小说" };
  }
  return { cat: "文学与小说", tags: ["散文与随笔"], tag3: ["文化随笔"], tag: "散文·随笔" };
}

function verifiedYear(candidate) {
  if (!/^\d{4}$/.test(candidate.year || "")) return "";
  return candidate.sourceRefs.some(ref => String(ref.sourceRow || "").includes(candidate.year)) ? candidate.year : "";
}

function asBook(candidate) {
  const taxonomy = classification(candidate);
  let translator = candidate.translator || "";
  let publisher = candidate.publisher || "";
  let year = verifiedYear(candidate);
  if (!publisher && /ISBN|\u51fa\u7248\u793e/.test(translator)) {
    const shifted = translator.match(/^(.*?)(?:，(\d{4}))?；ISBN\s*\d{13}$/);
    if (shifted) {
      publisher = shifted[1];
      year = shifted[2] || year;
      translator = "";
    }
  }
  return {
    title: candidate.title,
    sub: "",
    author: /(?:待核|无法确认)/.test(candidate.author || "") ? "" : candidate.author,
    origin: "",
    translator: /(?:待核|暂未核到|图中版本|—)/.test(translator) ? "" : translator,
    publisher: /(?:待核|照片版待核)/.test(publisher) ? "" : publisher,
    year,
    ...taxonomy,
    isbn: /^\d{13}$/.test(candidate.isbn || "") ? candidate.isbn : "",
    desc: candidate.description || "",
    ...(candidate.collections?.length ? { collections: candidate.collections } : {})
  };
}

batch.candidates.forEach(candidate => {
  if (candidate.matchStatus !== "unchecked") return;
  const exists = candidate.isbn
    ? existingIsbns.has(candidate.isbn)
    : existingTitles.has(normalizeTitle(candidate.title));
  candidate.matchStatus = exists ? "already_in_data" : "new_candidate";
});

const acceptedStatuses = new Set(["source_verified", "web_verified"]);
const pending = batch.candidates.filter(candidate => (
  candidate.matchStatus === "new_candidate"
  && candidate.importStatus === "pending"
  && acceptedStatuses.has(candidate.verificationStatus)
));
const additions = [];
const skipped = [];

for (const candidate of pending) {
  const titleKey = normalizeTitle(candidate.title);
  if ((candidate.isbn && existingIsbns.has(candidate.isbn)) || (!candidate.isbn && existingTitles.has(titleKey))) {
    candidate.importStatus = "skipped_existing";
    skipped.push(candidate.title);
    continue;
  }
  const book = asBook(candidate);
  additions.push(book);
  existingTitles.add(titleKey);
  if (book.isbn) existingIsbns.add(book.isbn);
  candidate.importStatus = "imported";
}

for (const candidate of batch.candidates.filter(candidate => candidate.matchStatus === "already_in_data")) {
  if (candidate.importStatus === "pending") candidate.importStatus = "skipped_existing";
}

const counts = additions.reduce((result, book) => {
  result[book.cat] = (result[book.cat] || 0) + 1;
  return result;
}, {});

console.log(JSON.stringify({ mode: shouldRepair ? "repair" : (shouldWrite ? "write" : "preview"), additions: additions.length, skipped, counts }, null, 2));
if (process.argv.includes("--details")) {
  additions.forEach(book => console.log(`${book.cat}\t${book.tags[0]}\t${book.title}`));
}

if (shouldRepair) {
  const collection = batch.collection;
  const firstIndex = context.__BOOKS__.findIndex(book => (book.collections || []).includes(collection));
  if (firstIndex < 0) throw new Error(`data.js 中没有专题 ${collection}，无法修复`);
  if (context.__BOOKS__.slice(firstIndex).some(book => !(book.collections || []).includes(collection))) {
    throw new Error("专题导入记录不是 data.js 的连续尾部，停止自动修复");
  }
  const repaired = batch.candidates
    .filter(candidate => acceptedStatuses.has(candidate.verificationStatus))
    .filter(candidate => !(candidate.isbn && new Set(context.__BOOKS__.slice(0, firstIndex).map(book => book.isbn).filter(Boolean)).has(candidate.isbn)))
    .map(candidate => {
      candidate.matchStatus = "new_candidate";
      candidate.importStatus = "imported";
      return asBook(candidate);
    });
  const firstTitle = context.__BOOKS__[firstIndex].title;
  const marker = `,\n  {\n    \"title\": ${JSON.stringify(firstTitle)}`;
  const start = source.lastIndexOf(marker);
  if (start < 0) throw new Error("无法定位专题导入尾部起点");
  const serialized = repaired.map(book => `  ${JSON.stringify(book, null, 2).replace(/\n/g, "\n  ")}`).join(",\n");
  fs.writeFileSync(dataPath, `${source.slice(0, start)},\n${serialized}\n];\n`);
  fs.writeFileSync(importPath, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(JSON.stringify({ repaired: repaired.length, collection }, null, 2));
  process.exit(0);
}

if (!shouldWrite) process.exit(0);
if (!additions.length) throw new Error("没有可写入的新书；导入批次可能已处理");

const serialized = additions.map(book => `  ${JSON.stringify(book, null, 2).replace(/\n/g, "\n  ")}`).join(",\n");
const marker = /\n\];\s*$/;
if (!marker.test(source)) throw new Error("无法定位 BOOKS 数组结尾");
const nextSource = source.replace(marker, `,\n${serialized}\n];\n`);

fs.writeFileSync(dataPath, nextSource);
fs.writeFileSync(importPath, `${JSON.stringify(batch, null, 2)}\n`);
