# AGENTS.md — bookspace 个人藏书站（Codex / AI 代理协作规范）

纯静态个人藏书展示站，部署于 GitHub Pages。无构建步骤：改完文件直接推送 `main` 分支即自动上线。

- 线上地址：https://linqiyu-0921.github.io/bookspace/
- 仓库：github.com/Linqiyu-0921/bookspace（本地目录即源，main 分支）

---

## 1. 项目结构

| 文件 | 职责 |
|---|---|
| `data.js` | 全部书籍数据，导出全局 `const BOOKS = [...]`，**615 本**（271 实体 + 344 微信读书电子书）。一切页面的数据源 |
| `index.html` + `styles.css` + `app.js` | 书架主页：书脊墙、悬停翻开封面、分类筛选 |
| `overview.html` + `overview.css` + `overview.js` | 总览页：分类分组、右侧标签抽屉筛选（一级/二级多选 OR）、搜索 |
| `covers/` | 封面图片（约 590 张 jpg） |

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
- `tag`：**二级分类**（细分，约 200 个值，如"计算机""长篇小说"）
- `tags`：主题标签数组（1-3 个，如 `["人工智能"]`）
- `tag3`：**三级标签**数组（如 `["人工智能入门","机器学习"]`），584 本已有

### 电子书字段语义
- `source:"weread"` 标记微信读书电子书
- `wrId`：微信读书 bookId（封面文件名 = `wr_<wrId>.jpg`）
- `secret`：私密书目（页面 infoTag 会显示「私密」）
- `readTime`：最近阅读（YYYY-MM-DD）；`finished`：是否读完
- 电子书 `desc` 用微信读书官方简介；`year`/`translator`/`publisher` 可能为空

## 3. 封面约定

- 文件名规则：中文书名→拼音全拼（`鸢尾花`→`yuanweihua.jpg`）；英文→小写原名（`Julius Caesar...`→`juliuscaesarthecolossusofrome.jpg`）；微信读书→`wr_<bookId>.jpg`；早期历史数据为 `dbNNN.jpg`
- 冲突处理：重名加 `_N` 后缀
- 无封面书（约 32 本）：data.js **不写 cover 字段**，前端走程序化设计款兜底（书脊配色来自 `palette`）
- 书脊主色：前端对真实封面图 canvas 主色采样（`app.js coverPalette`），`palette` 字段是兜底色
- 微信读书高清封面获取：`/book/info` 接口的 cover 字段（约 250×400），搜索接口只给 70×100 小图

## 4. 关键页面逻辑

- `app.js`：`BOOKS.length` 动态注入 meta description 与角标数字——**禁止静态写死数量**；书架按 cat 分组渲染，悬停翻开显示封面详情（infoTag/infoMeta/infoDesc）
- `overview.js`：右侧抽屉筛选（一级分类单选 + 二级多选 OR），封面 `loading="lazy"` + 分批渲染；搜索跨全分类过滤；`?cat=一级分类` 深链
- 两页 meta/角标数量均由 JS 从 `BOOKS.length` 计算

## 5. 维护操作

### 加书
1. 在 `data.js` 数组追加对象（保持字段顺序与既有书一致）
2. 实体书放实体书区、电子书放电子书区（`source:"weread"`）
3. 封面图放入 `covers/`，文件名按第 3 节规则
4. `node --check data.js` 验证语法；本地开 index.html/overview.html 目测
5. 改完**必须提交并推送前先询问用户**（红线）

### 加封面（补缺封面书）
- 首选微信读书：`WEREAD_API_KEY`（环境变量，用户提供，勿落盘）→ `/store/search` 按书名找 bookId → `/book/info` 取高清封面 URL → 下载到 `covers/`
- 书名匹配必须用「原始字符串 + 副标题分隔符（（：:—-· ）」判断同书，防"岁月"误配"岁月忽已暮"

### 同步飞书 Base
- Base：`PTV8bD3VqalscasqrdOc3BEin5c`，表 `tblBtcwA4cc0nK9U`「书籍清单」，与 data.js 双向对齐（各 615 条）
- `lark-cli base +record-list --format json`：输出 `data.record_id_list` 与 `data.data`（值数组）**按索引一一对齐**——这是获取 record_id 的唯一通道，批量更新用 `+record-batch-update`
- 字段顺序（值数组索引）：0书名 / 1读完 / 2细分标签 / 3简介 / 4ISBN / 5分类 / 6私密 / 7封面 / 8出版社 / 9译者 / 10出版年份 / 11来源照片 / 12最近阅读 / 13封面参考链接 / 14微信读书ID / 15作者
- 微信读书书的分类选项：`+field-search-options --field-id 分类` 查看；data.js 的 cat 值必须存在于选项

## 6. 红线与注意事项

- **git push 是红线**：必须用户明确确认后才推送；本地提交可自行做
- **HTTPS_PROXY 会让 git 挂起**（exit 137 / framing 错误）：推送用
  `env -u HTTPS_PROXY -u HTTP_PROXY git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push origin main`
  （直连优先，github.com 网络波动时重试）
- 删除书籍/封面文件、修改飞书数据：先与用户确认
- `.gitignore` 已忽略 `_*.png` / `_*.jpeg`（根目录设计稿，不入库，勿清理）
- 本项目**可能有并发会话**同时改 data.js：改动前 `git status` 确认工作区状态；写 data.js 用「收集修改区间 + 倒序应用」，勿边遍历边改（位置漂移会污染数据）

## 7. 常用命令

```bash
node --check data.js          # 语法校验（改完必跑）
git status                    # 改动前确认工作区
# 推送（红线，需用户确认后执行）
env -u HTTPS_PROXY -u HTTP_PROXY git push origin main
```

---

_维护约定随项目演化更新；数字（615 本、13 一级分类等）如有变动同步修改本文件。_
