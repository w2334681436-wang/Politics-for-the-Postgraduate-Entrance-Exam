(() => {
  "use strict";
  const source = window.TIMELINE_DATA;
  if (!source || !Array.isArray(source.points)) {
    document.body.innerHTML = "<p style='padding:2rem'>时间线数据加载失败，请刷新页面。</p>";
    return;
  }
  const points = source.chapters.flatMap((chapter) => [
    ...(source.supplements || []).filter((point) => point.chapter === chapter.number),
    ...source.points.filter((point) => point.chapter === chapter.number)
  ]);
  const byId = new Map(points.map((point) => [point.id, point]));
  const pointIndex = new Map(points.map((point, index) => [point.id, index]));
  const spacing = window.innerWidth <= 760 ? 356 : 408;
  const stageStart = 220;
  const viewport = document.querySelector("#timeline-viewport");
  const stage = document.querySelector("#timeline-stage");
  const dock = document.querySelector("#chapter-dock");
  const status = document.querySelector("#current-status");
  const detailPanel = document.querySelector("#detail-panel");
  const detailContent = document.querySelector("#detail-content");
  const detailScrim = document.querySelector("#detail-scrim");
  const learnedButton = document.querySelector("#learned-button");
  const searchDialog = document.querySelector("#search-dialog");
  const searchInput = document.querySelector("#search-input");
  const searchResults = document.querySelector("#search-results");
  const searchSummary = document.querySelector("#search-summary");
  const infoDialog = document.querySelector("#info-dialog");
  const learned = new Set(JSON.parse(localStorage.getItem("history-timeline-learned") || "[]"));
  let scale = window.innerWidth <= 760 ? 0.82 : 1;
  let panX = 0;
  let panY = 0;
  let currentIndex = Math.max(0, Number(localStorage.getItem("history-timeline-current")) || 0);
  let detailPointId = null;
  let pointerStart = null;
  let moved = false;
  let renderFrame = null;
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
  const pointLabel = (point) => typeof point.number === "number" ? `考点 ${point.number}` : "章节说明";
  const pointPreview = (point) => (point.content.find((item) => item.kind !== "source-note") || point.content[0] || {}).text || "";
  const displayYears = (point) => point.years.length ? point.years : [point.anchorYear].filter(Boolean);

  function yearMarkup(years, limit = 4) {
    if (!years.length) return '<span class="year-pill more">专题节点</span>';
    const shown = years.slice(0, limit).map((year) => `<span class="year-pill">${year}</span>`).join("");
    return shown + (years.length > limit ? `<span class="year-pill more">+${years.length - limit}</span>` : "");
  }

  function renderTimeline() {
    const chunks = ['<div class="timeline-axis"></div>'];
    source.chapters.forEach((chapter, chapterPosition) => {
      const first = points.findIndex((point) => point.chapter === chapter.number);
      const nextChapter = source.chapters[chapterPosition + 1];
      const next = nextChapter ? points.findIndex((point) => point.chapter === nextChapter.number) : points.length;
      const left = stageStart + Math.max(first, 0) * spacing - 52;
      const width = Math.max(spacing, (Math.max(next, first + 1) - Math.max(first, 0)) * spacing);
      chunks.push(`<div class="chapter-band" data-chapter-band="${chapter.number}" style="left:${left}px;width:${width}px"><div class="chapter-label"><b>${chapter.number}</b><span>${escapeHtml(chapter.title)}</span></div></div>`);
    });
    points.forEach((point, index) => {
      const position = stageStart + index * spacing;
      const direction = index % 2 === 0 ? "above" : "below";
      const isLearned = learned.has(point.id) ? " learned" : "";
      const isActive = index === currentIndex ? " active" : "";
      chunks.push(`<article class="timeline-node ${direction}${isLearned}${isActive}" data-point-id="${point.id}" style="--node-x:${position}px"><span class="node-pin"></span><span class="node-connector"></span><button class="node-card" type="button" aria-label="打开${escapeHtml(pointLabel(point))}：${escapeHtml(point.title)}"><span class="node-meta"><span class="point-number">${escapeHtml(pointLabel(point))}</span><span class="chapter-number">第 ${point.chapter} 章</span></span><h3>${escapeHtml(point.title)}</h3><p class="node-section">${escapeHtml(point.sectionTitle || point.chapterTitle)}</p><p class="node-preview">${escapeHtml(pointPreview(point))}</p><span class="year-list">${yearMarkup(displayYears(point))}</span><span class="node-foot"><span>PDF 第 ${point.sourcePage || "82"} 页</span><strong>${learned.has(point.id) ? "已学习" : "展开完整知识点 →"}</strong></span></button></article>`);
    });
    stage.innerHTML = chunks.join("");
    stage.style.width = `${stageStart * 2 + points.length * spacing}px`;
    stage.querySelectorAll(".node-card").forEach((card) => card.addEventListener("click", (event) => {
      if (moved) { event.preventDefault(); return; }
      openDetail(card.closest(".timeline-node").dataset.pointId);
    }));
  }

  function renderDock() {
    dock.innerHTML = source.chapters.map((chapter) => `<button type="button" data-chapter="${chapter.number}" title="第${chapter.number}章 ${escapeHtml(chapter.title)}">${chapter.number}</button>`).join("");
    dock.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      const index = points.findIndex((point) => point.chapter === Number(button.dataset.chapter));
      if (index >= 0) focusPoint(index, true);
    }));
  }

  function queueTransform() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      stage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
      renderFrame = null;
    });
  }

  function clampPan() {
    const stageWidth = stageStart * 2 + points.length * spacing;
    panX = Math.min(160, Math.max(window.innerWidth - stageWidth * scale - 160, panX));
    const allowance = Math.max(100, (980 * scale - window.innerHeight) / 2 + 110);
    panY = Math.min(allowance, Math.max(-allowance, panY));
  }

  function setScale(nextScale, centerX = window.innerWidth / 2, centerY = window.innerHeight / 2) {
    const oldScale = scale;
    scale = Math.max(0.5, Math.min(1.35, nextScale));
    panX = centerX - ((centerX - panX) / oldScale) * scale;
    panY = centerY - ((centerY - panY) / oldScale) * scale;
    clampPan(); queueTransform();
  }

  function focusPoint(index, animate = true) {
    currentIndex = Math.max(0, Math.min(points.length - 1, index));
    localStorage.setItem("history-timeline-current", String(currentIndex));
    panX = window.innerWidth / 2 - (stageStart + currentIndex * spacing + 160) * scale;
    panY = window.innerHeight / 2 - 490 * scale;
    clampPan();
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)";
      window.setTimeout(() => { stage.style.transition = ""; }, 570);
    }
    queueTransform(); updateCurrentUI();
  }

  function updateCurrentUI() {
    const point = points[currentIndex];
    status.textContent = typeof point.number === "number" ? `${pointLabel(point)} / ${source.meta.pointCount}` : `第 ${point.chapter} 章导览`;
    document.querySelectorAll(".timeline-node.active").forEach((node) => node.classList.remove("active"));
    document.querySelector(`[data-point-id="${point.id}"]`)?.classList.add("active");
    dock.querySelectorAll("button").forEach((button) => button.classList.toggle("active", Number(button.dataset.chapter) === point.chapter));
  }

  function openDetail(id) {
    const point = byId.get(id);
    if (!point) return;
    detailPointId = id; currentIndex = pointIndex.get(id); updateCurrentUI();
    localStorage.setItem("history-timeline-current", String(currentIndex));
    detailContent.innerHTML = `<p class="eyebrow">${escapeHtml(pointLabel(point))} · 第 ${point.chapter} 章</p><h2>${escapeHtml(point.title)}</h2><p class="detail-subtitle">${escapeHtml(point.chapterTitle)} · ${escapeHtml(point.sectionTitle || "章节说明")} · PDF 第 ${point.sourcePage || "82"} 页</p><div class="detail-years">${yearMarkup(displayYears(point), 24)}</div><div class="detail-body">${point.content.map((line) => `<p class="detail-line ${line.kind}">${escapeHtml(line.text)}</p>`).join("")}</div>`;
    detailContent.scrollTop = 0; updateLearnedButton(); detailScrim.hidden = false;
    detailPanel.classList.add("open"); detailPanel.setAttribute("aria-hidden", "false");
  }

  function closeDetail() {
    detailPanel.classList.remove("open"); detailPanel.setAttribute("aria-hidden", "true");
    detailScrim.hidden = true; detailPointId = null;
  }

  function updateLearnedButton() {
    const active = learned.has(detailPointId);
    learnedButton.classList.toggle("active", active); learnedButton.textContent = active ? "✓ 已学习" : "标记已学";
  }

  function toggleLearned() {
    if (!detailPointId) return;
    learned.has(detailPointId) ? learned.delete(detailPointId) : learned.add(detailPointId);
    localStorage.setItem("history-timeline-learned", JSON.stringify([...learned]));
    const node = document.querySelector(`[data-point-id="${detailPointId}"]`);
    node?.classList.toggle("learned", learned.has(detailPointId));
    const foot = node?.querySelector(".node-foot strong");
    if (foot) foot.textContent = learned.has(detailPointId) ? "已学习" : "展开完整知识点 →";
    updateLearnedButton();
  }

  function openSearch() { searchDialog.hidden = false; searchInput.value = ""; renderSearchResults(""); requestAnimationFrame(() => searchInput.focus()); }
  function closeSearch() { searchDialog.hidden = true; }
  const normalize = (value) => value.toLowerCase().replace(/[\s·—,，。；：:、“”‘’（）()《》【】]/g, "");

  function getMatches(query) {
    const term = normalize(query);
    if (!term) return points.slice(0, 12);
    return points.map((point) => {
      const title = normalize(point.title), section = normalize(`${point.chapterTitle}${point.sectionTitle}`), body = normalize(point.searchText), years = displayYears(point).join(" ");
      let score = 0;
      if (String(point.number) === term) score += 120;
      if (title === term) score += 100;
      if (title.includes(term)) score += 70;
      if (years.includes(term)) score += 55;
      if (section.includes(term)) score += 35;
      if (body.includes(term)) score += 18;
      return { point, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || pointIndex.get(a.point.id) - pointIndex.get(b.point.id)).slice(0, 40).map((item) => item.point);
  }

  function renderSearchResults(query) {
    const matches = getMatches(query);
    searchSummary.textContent = query ? `找到 ${matches.length} 个相关节点，选择后自动定位` : "输入关键词，搜索全部 111 个考点与正文";
    if (!matches.length) { searchResults.innerHTML = '<div class="empty-results">没有找到对应内容，试试更短的关键词。</div>'; return; }
    searchResults.innerHTML = matches.map((point, index) => `<button class="search-result" type="button" role="option" aria-selected="${index === 0}" data-result-id="${point.id}"><span class="result-number">${escapeHtml(pointLabel(point))}</span><span class="result-main"><strong>${escapeHtml(point.title)}</strong><span>${escapeHtml(pointPreview(point))}</span></span><span class="result-years">${displayYears(point).slice(0, 3).join(" · ") || `第 ${point.chapter} 章`}</span></button>`).join("");
    searchResults.querySelectorAll(".search-result").forEach((result) => result.addEventListener("click", () => chooseSearchResult(result.dataset.resultId)));
  }

  function chooseSearchResult(id) { closeSearch(); const index = pointIndex.get(id); focusPoint(index, true); window.setTimeout(() => openDetail(id), 320); }
  function moveDetail(delta) { const next = Math.max(0, Math.min(points.length - 1, currentIndex + delta)); focusPoint(next, true); openDetail(points[next].id); }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    viewport.setPointerCapture(event.pointerId); pointerStart = { x: event.clientX, y: event.clientY, panX, panY }; moved = false; viewport.classList.add("dragging");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    panX = pointerStart.panX + dx; panY = pointerStart.panY + dy; clampPan(); queueTransform();
  });
  function endPointer() { pointerStart = null; viewport.classList.remove("dragging"); window.setTimeout(() => { moved = false; }, 0); }
  viewport.addEventListener("pointerup", endPointer); viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) setScale(scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    else { panX -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY; panY -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 0 : event.deltaX; clampPan(); queueTransform(); }
  }, { passive: false });

  document.querySelector("#search-button").addEventListener("click", openSearch);
  document.querySelector("#zoom-in").addEventListener("click", () => setScale(scale + .12));
  document.querySelector("#zoom-out").addEventListener("click", () => setScale(scale - .12));
  document.querySelector("#reset-view").addEventListener("click", () => focusPoint(currentIndex, true));
  document.querySelector("#info-button").addEventListener("click", () => { infoDialog.hidden = false; });
  document.querySelector("#previous-point").addEventListener("click", () => focusPoint(currentIndex - 1, true));
  document.querySelector("#next-point").addEventListener("click", () => focusPoint(currentIndex + 1, true));
  status.addEventListener("click", () => openDetail(points[currentIndex].id));
  document.querySelector("#detail-close").addEventListener("click", closeDetail); detailScrim.addEventListener("click", closeDetail);
  learnedButton.addEventListener("click", toggleLearned);
  document.querySelector("#detail-previous").addEventListener("click", () => moveDetail(-1));
  document.querySelector("#detail-next").addEventListener("click", () => moveDetail(1));
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  document.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", closeSearch));
  document.querySelectorAll("[data-close-info]").forEach((element) => element.addEventListener("click", () => { infoDialog.hidden = true; }));
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); return; }
    if (event.key === "Escape") { if (!searchDialog.hidden) closeSearch(); else if (!infoDialog.hidden) infoDialog.hidden = true; else closeDetail(); return; }
    if (!searchDialog.hidden && event.key === "Enter") { const first = searchResults.querySelector("[data-result-id]"); if (first) chooseSearchResult(first.dataset.resultId); return; }
    if (event.target.matches("input, textarea")) return;
    if (event.key === "ArrowLeft") focusPoint(currentIndex - 1, true);
    if (event.key === "ArrowRight") focusPoint(currentIndex + 1, true);
    if (event.key === "/") { event.preventDefault(); openSearch(); }
  });
  window.addEventListener("resize", () => { clampPan(); queueTransform(); });
  document.querySelector("#source-note").textContent = `内容来源：${source.meta.source}，共 ${source.meta.pageCount} 页、${source.meta.pointCount} 个考点。系统仅清理页眉页脚、推广信息与课程时间码。`;
  renderTimeline(); renderDock(); focusPoint(Math.min(currentIndex, points.length - 1), false);
})();
