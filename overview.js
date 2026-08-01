/* ============================================================
   BOOK SPACE · 总览 Overview
   封面墙一次纵览全部藏书：按分类分组 + 分类锚点导航 + 搜索 + 详情浮层
   ============================================================ */
(() => {
  const wall = document.getElementById("wall");
  const catsNav = document.getElementById("cats");
  const searchInput = document.getElementById("searchInput");
  const emptyHint = document.getElementById("emptyHint");
  const subCount = document.getElementById("subCount");

  const detail = document.getElementById("detail");
  const dCover = document.getElementById("dCover");
  const dTag = document.getElementById("dTag");
  const dTitle = document.getElementById("dTitle");
  const dSub = document.getElementById("dSub");
  const dMeta = document.getElementById("dMeta");
  const dDesc = document.getElementById("dDesc");
  const dIdx = document.getElementById("dIdx");

  let keyword = "";
  let visible = [];        // 当前筛选后的书目
  let detailIdx = -1;      // 详情浮层中的下标（相对 visible）

  // 分类顺序与计数
  const catCounts = {};
  BOOKS.forEach(b => { catCounts[b.cat] = (catCounts[b.cat] || 0) + 1; });
  const catOrder = ["全部", ...Object.keys(catCounts)];

  /* ---------- 封面 HTML：真实封面优先，缺失时回退设计款 ---------- */
  function coverHTML(b) {
    if (b.cover) {
      return `<img src="${b.cover}" alt="${b.title}">`;
    }
    const p = b.palette || {};
    const authorLine = b.origin ? `[${b.origin}] ${b.author}` : b.author;
    return `
      <div class="tile-design" style="background:linear-gradient(160deg, ${p.coverA || "#ddd"}, ${p.coverB || "#bbb"}); color:${p.coverInk || "#222"};">
        <span class="td-tag">${b.sub || b.tag || ""}</span>
        <div class="td-title">${b.title}</div>
        <span class="td-author">${authorLine}</span>
      </div>`;
  }

  /* ---------- 分类锚点导航（sticky） ---------- */
  function buildCatNav() {
    catsNav.innerHTML = catOrder.map(c => {
      const n = c === "全部" ? BOOKS.length : catCounts[c];
      const href = c === "全部" ? "#top" : "#cat-" + encodeURIComponent(c);
      return `<a class="chip" href="${href}" data-cat="${c}">${c}<sup>${n}</sup></a>`;
    }).join("");
  }
  catsNav.addEventListener("click", e => {
    const a = e.target.closest("a.chip");
    if (!a) return;
    e.preventDefault();
    const c = a.dataset.cat;
    if (c === "全部") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const el = document.getElementById("cat-" + encodeURIComponent(c));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /* ---------- 搜索 ---------- */
  searchInput.addEventListener("input", () => {
    keyword = searchInput.value.trim().toLowerCase();
    render();
  });

  function match(b) {
    if (!keyword) return true;
    return [b.title, b.sub, b.author, b.translator, b.publisher, b.tag]
      .some(f => f && f.toLowerCase().includes(keyword));
  }

  /* ---------- 封面墙：按分类分组 + 锚点区块 ---------- */
  function render() {
    visible = BOOKS.filter(match);
    const groups = {};
    visible.forEach(b => { (groups[b.cat] = groups[b.cat] || []).push(b); });

    wall.innerHTML = catOrder
      .filter(c => c !== "全部" && groups[c])
      .map(cat => {
        const items = groups[cat].map(b => {
          const vi = visible.indexOf(b);
          return `<div class="tile" data-i="${vi}" style="animation-delay:${Math.min(vi * 18, 500)}ms">
            <div class="tile-cover">${coverHTML(b)}</div>
            <div class="tile-caption">
              <div class="tc-title">${b.title}</div>
              <div class="tc-author">${b.author}${b.year ? " · " + b.year : ""}</div>
            </div>
          </div>`;
        }).join("");
        return `<section class="cat-section" id="cat-${encodeURIComponent(cat)}">
          <h2 class="cat-head">${cat}<span class="cat-count">${groups[cat].length}</span></h2>
          <div class="tiles">${items}</div>
        </section>`;
      }).join("");

    emptyHint.classList.toggle("show", visible.length === 0);
    subCount.textContent = `${visible.length} Books · ${Object.keys(groups).length} Categories`;
  }

  wall.addEventListener("click", e => {
    const tile = e.target.closest(".tile");
    if (tile) openDetail(+tile.dataset.i);
  });

  /* ---------- 详情浮层 ---------- */
  function openDetail(i) {
    if (i < 0 || i >= visible.length) return;
    detailIdx = i;
    const b = visible[i];
    dCover.innerHTML = coverHTML(b);
    dTag.textContent = [b.cat, b.tag].filter(Boolean).join(" · ");
    dTitle.textContent = b.title;
    dSub.textContent = b.sub || "";
    dSub.style.display = b.sub ? "" : "none";
    const authorLine = b.origin ? `[${b.origin}] ${b.author}` : b.author;
    dMeta.textContent = [authorLine, b.translator && `${b.translator} 译`, b.publisher, b.year]
      .filter(Boolean).join(" · ");
    dDesc.textContent = b.desc || "";
    dIdx.textContent = `${String(i + 1).padStart(2, "0")} / ${String(visible.length).padStart(2, "0")}`;
    detail.classList.add("open");
    detail.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    detail.classList.remove("open");
    detail.setAttribute("aria-hidden", "true");
    detailIdx = -1;
  }
  function step(d) {
    if (detailIdx < 0 || !visible.length) return;
    openDetail((detailIdx + d + visible.length) % visible.length);
  }

  document.getElementById("dClose").addEventListener("click", closeDetail);
  document.getElementById("dPrev").addEventListener("click", () => step(-1));
  document.getElementById("dNext").addEventListener("click", () => step(1));
  detail.addEventListener("click", e => { if (e.target === detail) closeDetail(); });

  document.addEventListener("keydown", e => {
    if (!detail.classList.contains("open")) return;
    if (e.key === "Escape") closeDetail();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  /* ---------- 初始化 ---------- */
  const qs = new URLSearchParams(location.search);
  buildCatNav();
  render();

  // 深链：overview.html?book=N 直接打开第 N 本详情（1 起）
  const q = qs.get("book");
  if (q) {
    const n = parseInt(q, 10);
    if (n >= 1 && n <= visible.length) openDetail(n - 1);
  }
  // 深链：overview.html?cat=分类名 平滑滚动到对应分类区块
  const catParam = qs.get("cat");
  if (catParam) {
    const el = document.getElementById("cat-" + encodeURIComponent(catParam));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  // 动态同步 meta description 的书籍数量（修复静态写死 52 的过期文案）
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", `${BOOKS.length} 本书店寻得的书，封面墙总览，一次尽收眼底。`);
})();
