/* ============================================================
   BOOK SPACE · 总览 Overview
   封面墙一次纵览全部藏书：右侧标签抽屉筛选 + 分组 + 搜索 + 详情浮层
   ============================================================ */
(() => {
  const wall = document.getElementById("wall");
  const searchInput = document.getElementById("searchInput");
  const emptyHint = document.getElementById("emptyHint");
  const subCount = document.getElementById("subCount");
  const activeFilters = document.getElementById("activeFilters");

  const drawer = document.getElementById("drawer");
  const drawerToggle = document.getElementById("drawerToggle");
  const drawerClose = document.getElementById("drawerClose");
  const drawerClear = document.getElementById("drawerClear");
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  const drawerCount = document.getElementById("drawerCount");
  const drawerL1 = document.getElementById("drawerL1");
  const drawerL2 = document.getElementById("drawerL2");
  const drawerL2Hint = document.getElementById("drawerL2Hint");

  const detail = document.getElementById("detail");
  const dCover = document.getElementById("dCover");
  const dTag = document.getElementById("dTag");
  const dTitle = document.getElementById("dTitle");
  const dSub = document.getElementById("dSub");
  const dMeta = document.getElementById("dMeta");
  const dDesc = document.getElementById("dDesc");
  const dIdx = document.getElementById("dIdx");

  let keyword = "";
  let selL1 = null;          // 选中的一级分类（null=全部）
  let selL2 = new Set();     // 选中的二级标签集合
  let visible = [];
  let detailIdx = -1;
  const BATCH = 30;          // 分批渲染步长
  let renderedCount = 0;

  /* ---------- 统计 ---------- */
  const catCounts = {};
  const tag2Counts = {};
  BOOKS.forEach(b => {
    catCounts[b.cat] = (catCounts[b.cat] || 0) + 1;
    (b.tags || []).forEach(t => {
      tag2Counts[t] = tag2Counts[t] || { n: 0, cats: new Set() };
      tag2Counts[t].n++;
      tag2Counts[t].cats.add(b.cat);
    });
  });
  const catOrder = CATEGORY_ORDER.filter(c => catCounts[c]);  // 一级分类（统一展示顺序）
  const l2Of = {};                          // 一级 -> [二级, ...]
  catOrder.forEach(c => {
    l2Of[c] = (CATEGORY_GROUPS[c] || []).filter(tag => tag2Counts[tag]?.n);
  });

  /* ---------- 封面 HTML ---------- */
  function coverHTML(b) {
    if (b.cover) {
      return `<img loading="lazy" decoding="async" src="${b.cover}" alt="${b.title}">`;
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

  /* ---------- 筛选 ---------- */
  function match(b) {
    if (keyword && ![
      b.title, b.sub, b.author, b.translator, b.publisher, b.year, b.isbn,
      b.tag, b.cat, ...(b.tags || []), ...(b.tag3 || [])
    ]
        .some(f => f && String(f).toLowerCase().includes(keyword))) return false;
    if (selL1 && b.cat !== selL1) return false;
    if (selL2.size && !(b.tags || []).some(t => selL2.has(t))) return false;
    return true;
  }

  /* ---------- 标签抽屉 ---------- */
  function openDrawer() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawerBackdrop.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawerBackdrop.classList.remove("show");
    document.body.style.overflow = "";
  }
  drawerToggle.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
  });

  function buildDrawer() {
    const l1Html = [
      `<button class="dtag ${!selL1 ? "active" : ""}" data-l1="__all__">全部<sup>${BOOKS.length}</sup></button>`,
      ...catOrder.map(c =>
        `<button class="dtag ${selL1 === c ? "active" : ""}" data-l1="${c}">${c}<sup>${catCounts[c]}</sup></button>`)
    ].join("");
    drawerL1.innerHTML = l1Html;

    // 二级：仅在选中一级后展示其下的二级；未选一级时展示全部二级
    const pool = selL1
      ? (l2Of[selL1] || [])
      : catOrder.flatMap(cat => l2Of[cat] || []);
    const l2Html = pool.length
      ? pool.map(t => {
          const n = tag2Counts[t] ? tag2Counts[t].n : BOOKS.filter(b => (b.tags || []).includes(t)).length;
          return `<button class="dtag ${selL2.has(t) ? "active" : ""}" data-l2="${t}">${t}<sup>${n}</sup></button>`;
        }).join("")
      : `<span class="drawer-section-hint">该一级分类下暂无二级标签</span>`;
    drawerL2.innerHTML = l2Html;
    drawerL2Hint.textContent = selL1 ? `当前：${selL1}` : "选一级后只显示其二级";
  }

  drawerL1.addEventListener("click", e => {
    const btn = e.target.closest("button[data-l1]");
    if (!btn) return;
    const c = btn.dataset.l1;
    selL1 = c === "__all__" ? null : c;
    selL2.clear();
    buildDrawer();
    render();
  });
  drawerL2.addEventListener("click", e => {
    const btn = e.target.closest("button[data-l2]");
    if (!btn) return;
    const t = btn.dataset.l2;
    if (selL2.has(t)) selL2.delete(t); else selL2.add(t);
    buildDrawer();
    render();
  });
  drawerClear.addEventListener("click", () => {
    selL1 = null;
    selL2.clear();
    buildDrawer();
    render();
  });

  /* ---------- 筛选状态条 ---------- */
  function renderActiveFilters() {
    const chips = [];
    if (selL1) chips.push(`<span class="af-chip">一级：${selL1}<button data-clear="l1" aria-label="移除">×</button></span>`);
    selL2.forEach(t => chips.push(`<span class="af-chip">二级：${t}<button data-clear="l2-${t}" aria-label="移除">×</button></span>`));
    if (chips.length) chips.push(`<button class="af-reset" id="afReset">全部清除</button>`);
    activeFilters.innerHTML = chips.join("");
    drawerCount.textContent = (selL1 ? 1 : 0) + selL2.size || "";
  }
  activeFilters.addEventListener("click", e => {
    const clearBtn = e.target.closest("button[data-clear]");
    if (clearBtn) {
      const v = clearBtn.dataset.clear;
      if (v === "l1") { selL1 = null; selL2.clear(); }
      else if (v.startsWith("l2-")) selL2.delete(v.slice(3));
      buildDrawer();
      render();
      return;
    }
    if (e.target.id === "afReset") {
      selL1 = null;
      selL2.clear();
      buildDrawer();
      render();
    }
  });

  /* ---------- 搜索 ---------- */
  searchInput.addEventListener("input", () => {
    keyword = searchInput.value.trim().toLowerCase();
    render();
  });

  /* ---------- 封面墙：分组渲染 + 分批追加 ---------- */
  let observer = null;
  function render() {
    visible = BOOKS.filter(match);
    const groups = {};
    visible.forEach(b => { (groups[b.cat] = groups[b.cat] || []).push(b); });

    // 只渲染有书的一级分组
    const order = catOrder.filter(c => groups[c]);
    wall.innerHTML = order.map(cat => `
      <section class="cat-section" data-section="${cat}">
        <h2 class="cat-head">${cat}<span class="cat-count">${groups[cat].length}</span></h2>
        <div class="tiles" data-tiles="${cat}"></div>
      </section>`).join("");

    if (observer) { observer.disconnect(); observer = null; }

    // 分批填充 tiles（懒加载：滚动接近底部时追加）
    const queue = [];
    order.forEach(cat => {
      groups[cat].forEach(b => {
        queue.push({ cat, b, vi: visible.indexOf(b) });
      });
    });
    renderedCount = 0;
    const tilesEls = {};
    order.forEach(cat => { tilesEls[cat] = wall.querySelector(`[data-tiles="${cat}"]`); });

    function renderBatch() {
      const chunk = queue.slice(renderedCount, renderedCount + BATCH);
      chunk.forEach(({ cat, b, vi }) => {
        tilesEls[cat].insertAdjacentHTML("beforeend",
          `<div class="tile" data-i="${vi}">
            <div class="tile-cover">${coverHTML(b)}</div>
            <div class="tile-caption">
              <div class="tc-title">${b.title}</div>
              <div class="tc-author">${b.author}${b.year ? " · " + b.year : ""}</div>
            </div>
          </div>`);
      });
      renderedCount += chunk.length;
      if (renderedCount < queue.length && !observer) {
        observer = new IntersectionObserver(entries => {
          entries.forEach(en => {
            if (en.isIntersecting) renderBatch();
          });
        }, { rootMargin: "600px 0px" });
      }
      if (renderedCount < queue.length) {
        const last = wall.querySelector(".tile:last-of-type");
        if (last) observer.observe(last);
      }
    }

    renderBatch();

    emptyHint.classList.toggle("show", visible.length === 0);
    const bookUnit = visible.length === 1 ? "Book" : "Books";
    const categoryUnit = order.length === 1 ? "Category" : "Categories";
    subCount.textContent = `${visible.length} ${bookUnit} · ${order.length} ${categoryUnit}`;
    renderActiveFilters();
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
    dTag.textContent = [b.cat, ...(b.tags || []), ...(b.tag3 || []), b.tag].filter(Boolean).join(" · ");
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
  buildDrawer();
  render();

  const q = qs.get("book");
  if (q) {
    const n = parseInt(q, 10);
    if (n >= 1 && n <= visible.length) openDetail(n - 1);
  }
  const catParam = qs.get("cat");
  if (catParam && catCounts[catParam]) {
    selL1 = catParam;
    buildDrawer();
    render();
    setTimeout(() => {
      const el = wall.querySelector(`[data-section="${catParam}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", `${BOOKS.length} 本实体藏书与微信读书收藏，封面墙总览，一次尽收眼底。`);
})();
