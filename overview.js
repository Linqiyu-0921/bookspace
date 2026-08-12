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
  const drawerHotZone = document.getElementById("drawerHotZone");
  const drawerIndex = document.getElementById("drawerIndex");
  const drawerClose = document.getElementById("drawerClose");
  const drawerClear = document.getElementById("drawerClear");
  const drawerApply = document.getElementById("drawerApply");
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  const drawerCount = document.getElementById("drawerCount");
  const drawerSummary = document.getElementById("drawerSummary");
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
  const BATCH = 24;
  let renderedCount = 0;
  let closeTimer = null;
  let drawerOpenedByPointer = false;

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
  function coverHTML(b, eager = false) {
    if (b.cover) {
      if (eager) return `<img decoding="async" fetchpriority="high" src="${b.cover}" alt="${b.title}">`;
      return `<img loading="lazy" decoding="async" fetchpriority="low" data-src="${b.cover}" alt="${b.title}">`;
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

  const categoryIcons = {
    "文学与小说": "auto_stories",
    "历史与地理": "travel_explore",
    "心理与成长": "psychology",
    "哲学与思想": "menu_book",
    "艺术与设计": "palette",
    "经济与商业": "finance_mode",
    "社会与文化": "groups",
    "科学与科普": "science",
    "教育与语言": "school",
    "人物与传记": "person",
    "计算机与技术": "terminal",
    "漫画与流行文化": "comic_bubble",
    "生活与旅行": "luggage"
  };

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
  function openDrawer(source = "control") {
    clearTimeout(closeTimer);
    drawerOpenedByPointer = source === "pointer";
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawer.inert = false;
    drawerIndex.inert = false;
    drawerIndex.setAttribute("aria-hidden", "false");
    drawerToggle.setAttribute("aria-expanded", "true");
    drawerToggle.setAttribute("aria-label", "关闭标签筛选");
    drawerBackdrop.classList.add("show");
    document.body.classList.add("drawer-open");
    if (source === "keyboard") drawer.focus();
  }
  function closeDrawer() {
    clearTimeout(closeTimer);
    drawerOpenedByPointer = false;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    drawerIndex.inert = true;
    drawerIndex.setAttribute("aria-hidden", "true");
    drawerToggle.setAttribute("aria-expanded", "false");
    drawerToggle.setAttribute("aria-label", "打开标签筛选");
    drawerBackdrop.classList.remove("show");
    document.body.classList.remove("drawer-open");
  }
  function scheduleDrawerClose() {
    if (!drawerOpenedByPointer || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closeDrawer, 420);
  }
  function cancelDrawerClose() {
    clearTimeout(closeTimer);
  }
  drawerToggle.addEventListener("click", e => {
    if (drawer.classList.contains("open")) closeDrawer();
    else openDrawer(e.detail === 0 ? "keyboard" : "control");
  });
  drawerHotZone.addEventListener("pointerenter", () => {
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) openDrawer("pointer");
  });
  drawerToggle.addEventListener("pointerenter", cancelDrawerClose);
  drawerToggle.addEventListener("pointerleave", scheduleDrawerClose);
  drawer.addEventListener("pointerenter", cancelDrawerClose);
  drawer.addEventListener("pointerleave", scheduleDrawerClose);
  drawerIndex.addEventListener("pointerenter", cancelDrawerClose);
  drawerIndex.addEventListener("pointerleave", scheduleDrawerClose);
  drawerClose.addEventListener("click", closeDrawer);
  drawerApply.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
  });

  function buildDrawer() {
    const l1Html = [
      `<button class="dtag dtag-all ${!selL1 ? "active" : ""}" data-l1="__all__" aria-pressed="${!selL1}"><span class="material-symbols-outlined" aria-hidden="true">library_books</span><span>全部</span><sup>${BOOKS.length}</sup></button>`,
      ...catOrder.map(c =>
        `<button class="dtag ${selL1 === c ? "active" : ""}" data-l1="${c}" aria-pressed="${selL1 === c}"><span class="material-symbols-outlined" aria-hidden="true">${categoryIcons[c] || "bookmark"}</span><span>${c}</span><sup>${catCounts[c]}</sup></button>`)
    ].join("");
    drawerL1.innerHTML = l1Html;

    // 二级：仅在选中一级后展示其下的二级；未选一级时展示全部二级
    const pool = selL1
      ? (l2Of[selL1] || [])
      : catOrder.flatMap(cat => l2Of[cat] || []);
    const l2Html = pool.length
      ? [`<button class="dtag dtag-all ${!selL2.size ? "active" : ""}" data-l2-clear aria-pressed="${!selL2.size}"><span class="dtag-check material-symbols-outlined" aria-hidden="true">select_all</span><span>全部</span><sup>${selL1 ? catCounts[selL1] : BOOKS.length}</sup></button>`, ...pool.map(t => {
          const n = tag2Counts[t] ? tag2Counts[t].n : BOOKS.filter(b => (b.tags || []).includes(t)).length;
          return `<button class="dtag ${selL2.has(t) ? "active" : ""}" data-l2="${t}" aria-pressed="${selL2.has(t)}"><span class="dtag-check material-symbols-outlined" aria-hidden="true">${selL2.has(t) ? "check_circle" : "radio_button_unchecked"}</span><span>${t}</span><sup>${n}</sup></button>`;
        })].join("")
      : `<span class="drawer-section-hint">该一级分类下暂无二级标签</span>`;
    drawerL2.innerHTML = l2Html;
    drawerL2Hint.textContent = selL1 ? `（${selL1}）` : "（全部）";
    drawerIndex.innerHTML = catOrder.map((c, index) =>
      `<button class="index-mark ${selL1 === c ? "active" : ""}" data-index-cat="${c}" aria-label="筛选 ${c}">${String(index + 1).padStart(2, "0")}</button>`
    ).join("");
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
    if (e.target.closest("button[data-l2-clear]")) {
      selL2.clear();
      buildDrawer();
      render();
      return;
    }
    const btn = e.target.closest("button[data-l2]");
    if (!btn) return;
    const t = btn.dataset.l2;
    if (selL2.has(t)) selL2.delete(t); else selL2.add(t);
    buildDrawer();
    render();
  });
  drawerIndex.addEventListener("click", e => {
    const btn = e.target.closest("button[data-index-cat]");
    if (!btn) return;
    selL1 = btn.dataset.indexCat;
    selL2.clear();
    buildDrawer();
    render();
    openDrawer("control");
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
    const filterCount = (selL1 ? 1 : 0) + selL2.size;
    drawerCount.textContent = filterCount || "";
    drawerSummary.innerHTML = `<span>已选 ${filterCount} 个筛选</span><strong>共 ${visible.length} 本书</strong>`;
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
  let coverObserver = null;
  function render() {
    visible = BOOKS.filter(match);
    const groups = {};
    visible.forEach(b => { (groups[b.cat] = groups[b.cat] || []).push(b); });

    // 只渲染有书的一级分组
    const order = catOrder.filter(c => groups[c]);
    wall.innerHTML = order.map(cat => `
      <section class="cat-section" data-section="${cat}" hidden>
        <h2 class="cat-head">${cat}<span class="cat-count">${groups[cat].length}</span></h2>
        <div class="tiles" data-tiles="${cat}"></div>
      </section>`).join("");

    if (observer) { observer.disconnect(); observer = null; }
    if (coverObserver) coverObserver.disconnect();

    coverObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        coverObserver.unobserve(img);
      });
    }, { rootMargin: "240px 0px" });

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

    const sentinel = document.createElement("div");
    sentinel.className = "batch-sentinel";
    sentinel.setAttribute("aria-hidden", "true");

    function renderBatch() {
      observer?.unobserve(sentinel);
      sentinel.remove();
      const chunk = queue.slice(renderedCount, renderedCount + BATCH);
      chunk.forEach(({ cat, b, vi }) => {
        tilesEls[cat].closest(".cat-section").hidden = false;
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
      chunk.forEach(({ cat }) => {
        tilesEls[cat].querySelectorAll("img[data-src]").forEach(img => coverObserver.observe(img));
      });
      if (renderedCount < queue.length && !observer) {
        observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) renderBatch();
        }, { rootMargin: "420px 0px" });
      }
      if (renderedCount < queue.length) {
        const last = chunk.at(-1);
        if (last) {
          tilesEls[last.cat].appendChild(sentinel);
          requestAnimationFrame(() => {
            if (observer && sentinel.isConnected) observer.observe(sentinel);
          });
        }
      } else if (observer) {
        observer.disconnect();
        observer = null;
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
    dCover.innerHTML = coverHTML(b, true);
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
