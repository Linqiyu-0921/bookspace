/* ============ Bookspace · 滑动交互逻辑 ============ */
(function () {
  const track = document.getElementById("track");
  const giantText = document.getElementById("giantText");
  const meta = document.getElementById("meta");
  const curIdxEl = document.getElementById("curIdx");
  const totalIdxEl = document.getElementById("totalIdx");
  const progressBar = document.getElementById("progressBar");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const total = BOOKS.length;
  let index = 0;
  let animLock = false;

  totalIdxEl.textContent = String(total).padStart(2, "0");

  /* ---------- 生成书封 ---------- */
  BOOKS.forEach((b, i) => {
    const el = document.createElement("div");
    el.className = "book";
    el.dataset.idx = i;

    const vertical = b.title.length <= 7 && !b.sub;
    el.innerHTML = `
      <div class="book-inner" style="background: linear-gradient(155deg, ${b.palette.coverA} 0%, ${b.palette.coverB} 100%); color: ${b.palette.coverInk};">
        <div class="cover">
          <span class="cover-tag">${b.sub || b.tag}</span>
          <div class="cover-title ${vertical ? "vertical" : ""}">${b.title}</div>
          <div class="cover-footer">
            <span class="cover-author">${b.origin ? "〔" + b.origin + "〕" : ""}${b.author}</span>
            <span class="cover-press">${b.publisher}</span>
          </div>
        </div>
        <span class="cover-band" style="background:${b.palette.accent}"></span>
        ${b.cover ? `<img class="cover-img" src="${b.cover}" alt="${b.title}" loading="lazy" onerror="this.remove()">` : ""}
      </div>`;
    el.addEventListener("click", () => { if (i !== index) go(i); });
    track.appendChild(el);
  });

  const bookEls = [...track.children];

  /* ---------- 渲染当前书 ---------- */
  function render() {
    const b = BOOKS[index];
    const p = b.palette;

    // 背景与前景色
    document.documentElement.style.setProperty("--bg", p.bg);
    document.documentElement.style.setProperty("--ink", p.ink);
    document.documentElement.style.setProperty("--accent", p.accent);
    document.body.style.background = p.bg;
    document.body.style.color = p.ink;

    // 轨道位移（每本书占位 = 书宽 + 间距；offsetWidth 不受 transform 缩放影响）
    const bookW = bookEls[0].offsetWidth;
    const gap = window.innerWidth * 0.07;
    track.style.transform = `translateX(${-index * (bookW + gap)}px)`;

    // 激活态
    bookEls.forEach((el, i) => el.classList.toggle("active", i === index));

    // 巨型背景字
    giantText.classList.add("switching");
    setTimeout(() => {
      giantText.textContent = b.title;
      giantText.classList.remove("switching");
    }, 300);

    // 信息面板（先隐后显触发级联动画）
    meta.classList.remove("show");
    setTimeout(() => {
      document.getElementById("metaTag").textContent = b.tag;
      document.getElementById("metaTitle").textContent = b.title;
      document.getElementById("metaSub").textContent = b.sub || "";
      document.getElementById("metaAuthor").textContent =
        (b.origin && b.origin !== "中" && b.origin !== "港" ? "〔" + b.origin + "〕" : "") + b.author;
      const cellT = document.getElementById("cellTranslator");
      if (b.translator) {
        cellT.style.display = "";
        document.getElementById("metaTranslator").textContent = b.translator;
      } else {
        cellT.style.display = "none";
      }
      document.getElementById("metaPublisher").textContent = b.publisher;
      document.getElementById("metaYear").textContent = b.year;
      document.getElementById("metaDesc").textContent = b.desc;
      meta.classList.add("show");
    }, 260);

    // 计数与进度
    curIdxEl.textContent = String(index + 1).padStart(2, "0");
    progressBar.style.width = ((index + 1) / total) * 100 + "%";
  }

  function go(target) {
    if (animLock) return;
    const next = Math.max(0, Math.min(total - 1, target));
    if (next === index) return;
    index = next;
    animLock = true;
    render();
    setTimeout(() => (animLock = false), 650);
  }

  /* ---------- 交互：按钮 / 键盘 / 滚轮 / 拖拽 ---------- */
  prevBtn.addEventListener("click", () => go(index - 1));
  nextBtn.addEventListener("click", () => go(index + 1));

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(index + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(index - 1);
  });

  let wheelAcc = 0, wheelTimer = null;
  window.addEventListener("wheel", (e) => {
    wheelAcc += e.deltaY + e.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => (wheelAcc = 0), 220);
    if (Math.abs(wheelAcc) > 90) {
      go(index + (wheelAcc > 0 ? 1 : -1));
      wheelAcc = 0;
    }
  }, { passive: true });

  let dragX = null;
  const slider = document.querySelector(".slider");
  slider.addEventListener("pointerdown", (e) => { dragX = e.clientX; });
  window.addEventListener("pointerup", (e) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    dragX = null;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
  });

  window.addEventListener("resize", render);

  /* ---------- 启动 ---------- */
  render();
})();
