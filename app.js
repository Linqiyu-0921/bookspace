/* ============================================================
   Between the Spines · 交互逻辑
   书脊生成 / 悬停翻开 / 背景随书切换 / 拖拽·滚轮平移书架
   ============================================================ */
(function () {
  const scene = document.getElementById("scene");
  const track = document.getElementById("track");
  const bookInfo = document.getElementById("bookInfo");
  const infoTag = document.getElementById("infoTag");
  const infoTitle = document.getElementById("infoTitle");
  const infoSub = document.getElementById("infoSub");
  const infoMeta = document.getElementById("infoMeta");
  const infoDesc = document.getElementById("infoDesc");
  const curIdxEl = document.getElementById("curIdx");
  const totalIdxEl = document.getElementById("totalIdx");
  const bookCountEl = document.getElementById("bookCount");
  const catsEl = document.getElementById("cats");
  const searchInput = document.getElementById("searchInput");
  const emptyHint = document.getElementById("emptyHint");
  const bgWord = document.getElementById("bgWord");
  const bgWordText = bgWord.querySelector("span");

  const DEFAULT_BG = "#ece9e2";
  const DEFAULT_INK = "#141414";

  // 把色板墨色转为半透明副色（兼容性优于 CSS color-mix）
  function fadeInk(hex, a) {
    const m = /^#?([\da-f]{6})$/i.exec(hex || "");
    if (!m) return `rgba(20, 20, 20, ${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  /* ---------- 真实封面主色采样：书脊设计直接取自封面 ---------- */
  function coverPalette(img) {
    try {
      const c = document.createElement("canvas");
      const w = (c.width = 32), h = (c.height = 32);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const buckets = {};
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
        bk.n++; bk.r += r; bk.g += g; bk.b += b;
      }
      let best = null, bestScore = -1;
      for (const k in buckets) {
        const bk = buckets[k];
        const r = bk.r / bk.n, g = bk.g / bk.n, b = bk.b / bk.n;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        const score = bk.n * (0.16 + sat); // 偏好有饱和度的主色，避免白底/灰底喧宾夺主
        if (score > bestScore) { bestScore = score; best = { r, g, b }; }
      }
      if (!best) return null;
      const lum = (0.2126 * best.r + 0.7152 * best.g + 0.0722 * best.b) / 255;
      return {
        color: `rgb(${Math.round(best.r)}, ${Math.round(best.g)}, ${Math.round(best.b)})`,
        ink: lum > 0.62 ? "#23211c" : "#f7f5ef"
      };
    } catch (e) {
      return null; // 跨域污染等异常时回退手配色板
    }
  }

  bookCountEl.textContent = `${BOOKS.length} Books`;
  totalIdxEl.textContent = String(BOOKS.length).padStart(2, "0");

  // 动态同步 meta description 的书籍数量，防止与 data.js 脱节（修复静态写死 52 的过期文案）
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", `${BOOKS.length} 本书店寻得的书，以书脊之姿立于一排书架，悬停翻开即见封面。`);

  /* ---------- 生成书脊 ---------- */
  BOOKS.forEach((b, i) => {
    const p = b.palette || {};
    const spineColor = p.coverA || "#46608a";
    const spineInk = p.coverInk || "#ffffff";
    // 错落感：宽 / 高 / 倾角基于索引伪随机
    const spineW = 42 + ((i * 7) % 5) * 4;                    // 42 ~ 58px
    const bookH = 218 + ((i * 11) % 7) * 16;                  // 218 ~ 314px
    const coverW = Math.round(bookH * 0.62);                  // 保持书本比例
    const hScale = `min(${bookH}px, ${Math.round((bookH / 314) * 40)}vh)`; // 小窗口下按视口高度缩放
    const tilt = (i % 2 === 0 ? -1 : 1) * (0.6 + ((i * 5) % 4) * 0.5);

    const wrap = document.createElement("div");
    wrap.className = "book-wrap";
    wrap.dataset.idx = i;
    // 尺寸统一乘 --shelf-scale：移动端媒体查询只需下调系数即可整体缩书
    const sc = " * var(--shelf-scale, 1))";
    wrap.style.setProperty("--spine-w", `calc(min(${spineW}px, ${(spineW / 10).toFixed(1)}vh)` + sc);
    wrap.style.setProperty("--book-h", `calc(${hScale}` + sc);
    wrap.style.setProperty("--cover-w", `calc(min(${coverW}px, ${Math.round((coverW / 314) * 40)}vh)` + sc);
    wrap.style.setProperty("--book-color", spineColor);
    wrap.style.setProperty("--spine-ink", spineInk);
    wrap.style.setProperty("--tilt", tilt + "deg");
    wrap.style.setProperty("--cover-a", p.coverA || "#46608a");
    wrap.style.setProperty("--cover-b", p.coverB || "#7a8fb4");
    wrap.style.setProperty("--cover-ink", p.coverInk || "#ffffff");
    wrap.style.setProperty("--cover-accent", p.accent || "#c8a24b");

    // 书脊字号自适应：按书名长度适配书高，保证长书名完整不遮挡
    const fs = Math.max(9, Math.min(13, Math.floor((bookH - 44) / (b.title.length * 1.2))));
    wrap.style.setProperty("--spine-fs", fs + "px");

    const vertical = b.title.length <= 7;
    const authorLine = (b.origin && b.origin !== "中" ? "〔" + b.origin + "〕" : "") + (b.author || "");
    wrap.innerHTML = `
      <div class="book">
        <div class="spine">
          <div class="spine-text">${b.title}</div>
          <div class="spine-dot"></div>
        </div>
        <div class="pages"></div>
        <div class="cover">
          <div class="cover-design">
            <span class="cover-tag">${b.sub || b.tag || ""}</span>
            <div class="cover-title ${vertical ? "vertical" : ""}">${b.title}</div>
            <div class="cover-footer">
              <span class="cover-author">${authorLine}</span>
              <span class="cover-press">${b.publisher || ""}</span>
            </div>
            <span class="cover-band"></span>
          </div>
          ${b.cover ? `<img src="${b.cover}" alt="${b.title}" decoding="async" onerror="this.remove()">` : ""}
        </div>
        <div class="book-shadow"></div>
      </div>`;

    track.appendChild(wrap);

    // 真实封面加载后：封面比例随原图（不裁切变形），书脊主色/墨色取自封面主色
    const coverImg = wrap.querySelector(".cover img");
    if (coverImg) {
      const applyReal = () => {
        if (!coverImg.naturalWidth) return;
        const ratio = Math.max(0.58, Math.min(0.8, coverImg.naturalWidth / coverImg.naturalHeight));
        const w = Math.round(bookH * ratio);
        wrap.style.setProperty("--cover-w", `calc(min(${w}px, ${Math.round((w / 314) * 40)}vh) * var(--shelf-scale, 1))`);
        const pal = coverPalette(coverImg);
        if (pal) {
          wrap.style.setProperty("--book-color", pal.color);
          wrap.style.setProperty("--spine-ink", pal.ink);
        }
        wrap.classList.add("real-cover");
      };
      if (coverImg.complete) applyReal();
      else coverImg.addEventListener("load", applyReal);
    }
  });

  const bookEls = [...track.children];

  /* ---------- 种类分类筛选 + 搜索 ---------- */
  const CAT_ORDER = ["全部", "社科历史", "文学小说", "商业经管", "随笔书信", "哲学宗教", "诗歌", "艺术设计", "漫画"];
  const catCount = {};
  BOOKS.forEach((b) => { catCount[b.cat] = (catCount[b.cat] || 0) + 1; });

  let activeCat = "全部";
  let activeTag = "";
  let query = "";

  const subcatsEl = document.getElementById("subcats");

  CAT_ORDER.forEach((cat) => {
    if (cat !== "全部" && !catCount[cat]) return;
    const btn = document.createElement("button");
    btn.className = "chip" + (cat === activeCat ? " active" : "");
    btn.innerHTML = `${cat}<sup>${cat === "全部" ? BOOKS.length : catCount[cat]}</sup>`;
    btn.addEventListener("click", () => {
      activeCat = cat;
      activeTag = "";
      [...catsEl.children].forEach((c) => c.classList.toggle("active", c === btn));
      renderSubcats();
      applyFilter();
    });
    catsEl.appendChild(btn);
  });

  /* 细分标签：根据当前大类聚合 tags，按数量降序；全部时取前 12 个 */
  function renderSubcats() {
    subcatsEl.innerHTML = "";
    const pool = activeCat === "全部" ? BOOKS : BOOKS.filter((b) => b.cat === activeCat);
    const tagCount = {};
    pool.forEach((b) => (b.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    let entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
    if (activeCat === "全部") entries = entries.slice(0, 12);
    if (!entries.length) return;
    const mk = (label, count, tagVal) => {
      const btn = document.createElement("button");
      btn.className = "chip sub" + (activeTag === tagVal ? " active" : "");
      btn.innerHTML = count == null ? label : `${label}<sup>${count}</sup>`;
      btn.addEventListener("click", () => {
        activeTag = tagVal;
        [...subcatsEl.children].forEach((c) => c.classList.toggle("active", c === btn));
        applyFilter();
      });
      subcatsEl.appendChild(btn);
    };
    mk("全部标签", null, "");
    entries.forEach(([t, n]) => mk(t, n, t));
  }
  renderSubcats();

  function matches(b) {
    const okCat = activeCat === "全部" || b.cat === activeCat;
    const okTag = !activeTag || (b.tags || []).includes(activeTag);
    const q = query.trim().toLowerCase();
    const okQ = !q || [b.title, b.sub, b.author, b.translator, b.publisher, b.tag, b.cat, ...(b.tags || [])]
      .filter(Boolean)
      .some((s) => String(s).toLowerCase().includes(q));
    return okCat && okTag && okQ;
  }

  function applyFilter() {
    clearOpen();
    let visible = 0;
    bookEls.forEach((wrap, i) => {
      const show = matches(BOOKS[i]);
      wrap.classList.toggle("hidden", !show);
      if (show) visible++;
    });
    bookCountEl.textContent = `${visible} Books`;
    totalIdxEl.textContent = String(visible).padStart(2, "0");
    curIdxEl.textContent = visible ? "01" : "00";
    emptyHint.classList.toggle("show", visible === 0);
    panTo(0);
  }

  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    applyFilter();
  });

  /* ---------- 悬停：翻开 + 换背景 + 浮卡 ---------- */
  let hideTimer = null;

  function openBook(wrap, b, idx) {
    clearTimeout(hideTimer);
    const p = b.palette || {};
    document.body.style.background = p.bg || DEFAULT_BG;
    document.body.style.setProperty("--ink", p.ink || DEFAULT_INK); // 墨色随色板，深色底下保持可读
    document.body.style.setProperty("--ink-muted", fadeInk(p.ink || DEFAULT_INK, 0.55));

    // 巨型背景书名字
    bgWordText.textContent = b.title;
    bgWord.classList.add("show");

    // 侧边计数：当前书在可见（筛选后）列表中的序号
    const visibleEls = bookEls.filter((el) => !el.classList.contains("hidden"));
    curIdxEl.textContent = String(visibleEls.indexOf(wrap) + 1).padStart(2, "0");

    infoTag.textContent = [...new Set([b.cat, ...(b.tags || []), b.tag, b.secret ? "私密" : ""].filter(Boolean))].join(" · ");
    infoTitle.textContent = b.title;
    infoSub.textContent = b.sub || "";
    const authorLine =
      (b.origin && b.origin !== "中" ? "〔" + b.origin + "〕" : "") + (b.author || "");
    if (b.source === "weread") {
      infoMeta.textContent = [
        "微信读书电子书",
        b.readTime ? "最近阅读 " + b.readTime : "",
        b.finished ? "已读完" : "在读"
      ].filter(Boolean).join(" · ");
    } else {
      infoMeta.textContent = [
        authorLine,
        b.translator ? b.translator + " 译" : "",
        b.publisher,
        b.year
      ].filter(Boolean).join(" · ");
    }
    infoDesc.textContent = b.desc || "";
    bookInfo.classList.add("active");
  }

  function closeBook() {
    hideTimer = setTimeout(() => {
      bookInfo.classList.remove("active");
      bgWord.classList.remove("show");
      document.body.style.background = DEFAULT_BG;
      document.body.style.setProperty("--ink", DEFAULT_INK);
      document.body.style.setProperty("--ink-muted", "rgba(20, 20, 20, 0.52)");
    }, 380);
  }

  /* ---------- 粘性翻开管理：同时只开一本 + 自动平移到画面中心展开 ---------- */
  let openIdx = -1;
  let centerTimer = null;

  // 把翻开的书平移到画面中心（书脊 + 展开封面的视觉中点）
  function centerOn(wrap) {
    const cover = wrap.querySelector(".cover");
    const r = wrap.getBoundingClientRect();
    const s = scene.getBoundingClientRect();
    const bookCenter = r.left + (r.width + cover.offsetWidth) / 2;
    panTo(offset + bookCenter - (s.left + s.width / 2));
  }

  function setOpen(i) {
    if (i === openIdx) return;
    if (openIdx >= 0) bookEls[openIdx].classList.remove("open");
    openIdx = i;
    const wrap = bookEls[i];
    wrap.classList.add("open");
    openBook(wrap, BOOKS[i], i);
    // 待书脊右侧腾位动画基本结束后再居中，读到的才是终态位置
    clearTimeout(centerTimer);
    centerTimer = setTimeout(() => { if (openIdx === i) centerOn(wrap); }, 480);
  }

  function clearOpen() {
    clearTimeout(hoverTimer);
    pendingIdx = -1;
    if (openIdx < 0) return;
    clearTimeout(centerTimer);
    bookEls[openIdx].classList.remove("open");
    openIdx = -1;
    closeBook();
  }

  /* ---------- 桌面：悬停意图判定后翻开（指针在同一本书上稍作停留才触发，
     连续快速掠过时零开销——避免每本书都触发布局动画与整页重绘导致卡顿） ---------- */
  const HOVER_INTENT_MS = 120;
  let hoverTimer = null;
  let pendingIdx = -1;

  track.addEventListener("pointermove", (e) => {
    if (dragging || e.pointerType === "touch") return;
    const wrap = e.target.closest(".book-wrap");
    const idx = wrap ? +wrap.dataset.idx : -1;
    if (idx === -1 || idx === openIdx) {
      clearTimeout(hoverTimer);
      pendingIdx = -1;
      return;
    }
    if (idx === pendingIdx) return; // 已在等待这本书的意图判定
    pendingIdx = idx;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      pendingIdx = -1;
      setOpen(idx);
    }, HOVER_INTENT_MS);
  });

  track.addEventListener("pointerleave", () => {
    clearTimeout(hoverTimer);
    pendingIdx = -1;
  });

  // 点击书架空白处收起当前翻开的书
  scene.addEventListener("click", (e) => {
    if (!moved && !e.target.closest(".book-wrap")) clearOpen();
  });

  /* ---------- 触屏：点按切换翻开 ---------- */
  bookEls.forEach((wrap, i) => {
    wrap.addEventListener("touchstart", (e) => {
      if (wrap.classList.contains("open")) return; // 已打开则允许后续行为
      e.preventDefault();
      setOpen(i);
    }, { passive: false });
  });

  /* ---------- 书架平移：拖拽 / 滚轮 / 方向键 ---------- */
  let offset = 0;         // 当前位移
  let target = 0;         // 目标位移
  let raf = null;

  function maxOffset() {
    return Math.max(0, track.scrollWidth - scene.clientWidth);
  }

  function tick() {
    offset += (target - offset) * 0.14;
    if (Math.abs(target - offset) < 0.4) offset = target;
    track.style.transform = `translateX(${-offset}px)`;
    raf = Math.abs(target - offset) > 0 ? requestAnimationFrame(tick) : null;
  }

  function panTo(v) {
    target = Math.max(0, Math.min(maxOffset(), v));
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // 初始定位到书架中段，露出两端渐入感（深链翻书时不抢位）
  window.addEventListener("load", () => { if (openIdx < 0) panTo(maxOffset() * 0.06); });

  window.addEventListener("wheel", (e) => {
    clearOpen(); // 手动滑动书架时收起翻开的书
    panTo(target + (e.deltaY + e.deltaX) * 1.1);
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (e.target === searchInput) return; // 输入搜索时不平移书架
    if (e.key === "Escape") clearOpen();
    if (e.key === "ArrowRight") { clearOpen(); panTo(target + 180); }
    if (e.key === "ArrowLeft") { clearOpen(); panTo(target - 180); }
  });

  let dragging = false, dragStartX = 0, dragStartOffset = 0, moved = false;
  scene.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    dragStartX = e.clientX;
    dragStartOffset = target;
    scene.classList.add("dragging");
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 4) moved = true;
    if (moved) clearOpen(); // 拖拽书架时收起翻开的书
    panTo(dragStartOffset - dx);
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
    scene.classList.remove("dragging");
  });

  window.addEventListener("resize", () => panTo(target));

  /* ---------- 深链：?open=N 自动翻开第 N 本书（0 起） ---------- */
  const openParam = new URLSearchParams(location.search).get("open");
  if (openParam !== null && bookEls[+openParam]) {
    setTimeout(() => setOpen(+openParam), 300); // setOpen 自带居中
  }
})();
