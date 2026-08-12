# AGENTS.md — bookspace 个人藏书站（Codex / AI 代理协作规范）

纯静态个人藏书展示站，部署于 GitHub Pages。无构建步骤：改完文件直接推送 `main` 分支即自动上线。

- 线上地址：https://linqiyu-0921.github.io/bookspace/
- 仓库：github.com/Linqiyu-0921/bookspace（本地目录即源，main 分支）

---

## 1. 项目结构

| 文件 | 职责 |
|---|---|
| `data.js` | 分类定义与全部书籍数据，导出全局 `CATEGORY_ORDER`、`CATEGORY_GROUPS` 和 `BOOKS`；共 **923 本**（579 实体 + 344 微信读书电子书）。一切页面的数据源 |
| `index.html` + `styles.css` + `app.js` | 书架主页：书脊墙、悬停翻开封面、分类筛选 |
| `overview.html` + `overview.css` + `overview.js` | 总览页：分类分组、右侧标签抽屉筛选（一级/二级多选 OR）、搜索 |
| `covers/` | 封面图片；历史文件沿用原格式，新检索封面统一压缩为 WebP |
| `imports/` | 外部识别书目的审计暂存区；JSON 文件按 `YYYY-MM-DD-来源.json` 命名，完成合并后保留来源与导入状态，不存图片 |
| `scripts/` | 无第三方依赖的 Node.js 维护脚本；负责数据校验、导入检查等，不参与网页运行 |

## 2. 数据模型（data.js，重点）

每本书是一个对象。**实体书与微信读书电子书字段不同**：

```
实体书：
{ title, sub, author, origin, translator, publisher, year, tag,
  tags:[...], cat, tag3:[...], isbn, desc, cover, palette }

电子书（source === "weread"）：
{ title, sub, author, origin, translator, publisher, year, tag,
  tags:[...], cat, tag3:[...], isbn, desc, cover, source:"weread",
  wrId, secret, readTime, finished }
```

### 分类体系（三级，2026-08-02 重构后）
- `cat`：**一级分类**，13 个固定值：文学与小说 / 历史与地理 / 心理与成长 / 哲学与思想 / 艺术与设计 / 经济与商业 / 社会与文化 / 科学与科普 / 教育与语言 / 人物与传记 / 计算机与技术 / 漫画与流行文化 / 生活与旅行
- `tags`：**二级分类数组**，34 个固定值；当前每本书恰好 1 个，如 `["人工智能"]`
- `生活与旅行` 下的二级分类为 `健康与运动` / `旅行与生活`；旅行、饮食、生活方式不得再归入文学散文作兜底。
- `tag3`：**三级标签数组**，111 个值，可为 0-8 个，如 `["人工智能入门","机器学习"]`；893 本已有
- `tag`：自由展示标签，不参与三级分类筛选；约 200 个值，如 `"计算机"`、`"长篇小说"`
- `CATEGORY_ORDER`：13 个一级分类的唯一展示顺序；首页和总览页必须共同引用，禁止各自维护分类常量
- `CATEGORY_GROUPS`：一级到二级的唯一映射与展示顺序；新二级分类必须先在这里登记，校验脚本严格拒绝未登记值或跨一级归属

### 电子书字段语义
- `source:"weread"` 标记微信读书电子书
- `wrId`：微信读书 bookId（封面文件名 = `wr_<wrId>.jpg`）
- `secret`：私密书目（页面 infoTag 会显示「私密」）
- `readTime`：最近阅读（YYYY-MM-DD）；`finished`：是否读完
- 电子书 `desc` 用微信读书官方简介；`year`/`translator`/`publisher` 可能为空

## 3. 封面约定

- 文件名规则：中文书名→拼音全拼（`鸢尾花`→`yuanweihua.jpg`）；英文→小写原名（`Julius Caesar...`→`juliuscaesarthecolossusofrome.jpg`）；微信读书→`wr_<bookId>.jpg`；早期历史数据为 `dbNNN.jpg`
- 冲突处理：重名加 `_N` 后缀
- ISBN 精确检索恢复的封面统一命名为 `isbn_<13位ISBN>.webp`；检索来源、原图链接、ISBN 核验和下载状态必须写入 `imports/YYYY-MM-DD-cover-recovery.json`
- 新增或重新处理的封面最长边不超过 900px，WebP quality 80，清除元数据；禁止直接纳入数 MB 的原图
- 历史封面超过 150KB 时保留原文件、不覆盖媒体素材，生成 `opt_<原文件名去扩展名>.webp` 并只更新 `data.js` 引用；优化批次写入 `imports/YYYY-MM-DD-cover-optimization.json`
- 无封面书（当前 252 本）：data.js **不写 cover 字段**，前端走程序化设计款兜底（书脊配色来自 `palette`）
- 书脊主色：前端对真实封面图 canvas 主色采样（`app.js coverPalette`），`palette` 字段是兜底色
- 书架主页封面必须通过 `IntersectionObserver` 延迟加载，只对临近视口的封面采样主色；禁止恢复为全量 `src` 同步加载
- 总览页分批渲染必须使用唯一 sentinel；每批完成后不得继续观察旧 tile，避免一次滚动连锁渲染全部书目
- 微信读书高清封面获取：`/book/info` 接口的 cover 字段（约 250×400），搜索接口只给 70×100 小图

## 4. 关键页面逻辑

- `app.js`：`BOOKS.length` 动态注入 meta description 与角标数字；书架支持 `cat` 一级分类和 `tags` 二级分类筛选，悬停翻开显示封面详情（infoTag/infoMeta/infoDesc）
- `overview.js`：档案索引式右侧双栏抽屉筛选（`cat` 一级单选 + `tags` 二级多选 OR）；桌面端指针进入右侧热区自动打开、离开后延迟收起，触屏与键盘保留显式按钮；封面用 `data-src` + `IntersectionObserver` 懒加载并分批渲染；搜索跨全部书籍字段过滤；`?cat=一级分类` 深链
- 两页分类顺序均读取 `data.js` 的 `CATEGORY_ORDER` / `CATEGORY_GROUPS`；数量均由 JS 从 `BOOKS.length` 计算，HTML 与注释中禁止静态写死总数

## 5. 外部书目导入

1. 外部识别结果先进入 `imports/`，必须保留来源任务 ID、原始书名、原始书目行与核验状态。
2. 以 ISBN 为第一去重键；无 ISBN 时使用规范化书名，不能仅凭模糊相似度自动合并不同版本。
3. 只有版本信息可核验的记录才能写入 `data.js`；待核记录继续留在 `imports/`，不得为凑数量补写作者、ISBN 或封面。
4. 新书先更新网站并通过 `node scripts/validate-data.mjs`，再按同一批次写入飞书 Base；两边数量和业务字段必须一致。
5. 封面检索优先出版社、图书馆、微信读书等可确认版本的来源；文件名遵守第 3 节约定，无法确认时使用程序化封面。

## 6. 维护操作

### 加书
1. 在 `data.js` 数组追加对象（保持字段顺序与既有书一致）
2. 实体书放实体书区、电子书放电子书区（`source:"weread"`）
3. 封面图放入 `covers/`，文件名按第 3 节规则
4. 执行 `node scripts/validate-data.mjs`；本地打开 index.html/overview.html，检查桌面端和移动端
5. 改完**必须提交并推送前先询问用户**（红线）

### 加封面（补缺封面书）
- 首选微信读书：`WEREAD_API_KEY`（环境变量，用户提供，勿落盘）→ `/store/search` 按书名找 bookId → `/book/info` 取高清封面 URL → 下载到 `covers/`
- 无微信读书凭据时，先按 ISBN 在可核验书目页精确匹配；只有页面明确回显同一 ISBN 才能自动写入，默认占位图视为未命中
- 书名匹配必须用「原始字符串 + 副标题分隔符（（：:—-· ）」判断同书，防"岁月"误配"岁月忽已暮"

### 同步飞书 Base
- Base：`PTV8bD3VqalscasqrdOc3BEin5c`，表 `tblBtcwA4cc0nK9U`「书籍清单」。`data.js` 与 Base 当前均为 923 条；历史对话导入的 308 条及 9 张已核验封面已同步完成。
- `node scripts/sync-feishu.mjs` 只读预检网站与 Base 差异；`--write-compatible` 仅写入已有分类选项可容纳的记录，`--write` 写入全部待同步记录，`--upload-covers` 只追加尚未上传的批次封面，`--verify-fields` 逐字段核对本批 308 条记录。写入前先运行预检。
- `lark-cli base +record-list --format json`：输出 `data.record_id_list` 与 `data.data`（值数组）**按索引一一对齐**——这是获取 record_id 的唯一通道，批量更新用 `+record-batch-update`
- 字段顺序（值数组索引）：0书名 / 1读完 / 2细分标签 / 3简介 / 4ISBN / 5分类 / 6私密 / 7封面 / 8出版社 / 9译者 / 10出版年份 / 11来源照片 / 12最近阅读 / 13封面参考链接 / 14微信读书ID / 15作者
- 微信读书书的分类选项：`+field-search-options --field-id 分类` 查看；data.js 的 cat 值必须存在于选项

## 7. 红线与注意事项

- **git push 是红线**：必须用户明确确认后才推送；本地提交可自行做
- **HTTPS_PROXY 会让 git 挂起**（exit 137 / framing 错误）：推送用
  `env -u HTTPS_PROXY -u HTTP_PROXY git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push origin main`
  （直连优先，github.com 网络波动时重试）
- 删除书籍/封面文件、修改飞书数据：先与用户确认
- `.gitignore` 已忽略 `_*.png` / `_*.jpeg`（根目录设计稿，不入库，勿清理）
- 本项目**可能有并发会话**同时改 data.js：改动前 `git status` 确认工作区状态；写 data.js 用「收集修改区间 + 倒序应用」，勿边遍历边改（位置漂移会污染数据）

## 8. 常用命令

```bash
node scripts/validate-data.mjs # 语法、分类、重复项、封面路径校验（改完必跑）
git status                    # 改动前确认工作区
# 推送（红线，需用户确认后执行）
env -u HTTPS_PROXY -u HTTP_PROXY git push origin main
```

---

_维护约定随项目演化更新；数字（923 本、13 一级分类等）如有变动同步修改本文件。_
