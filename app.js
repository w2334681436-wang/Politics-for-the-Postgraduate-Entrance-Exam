(() => {
  "use strict";

  const source = window.TIMELINE_DATA;
  if (!source || !Array.isArray(source.events)) {
    document.body.innerHTML = "<p style='padding:2rem'>时间线数据加载失败，请刷新页面。</p>";
    return;
  }

  const events = source.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  const eventIndex = new Map(events.map((event, index) => [event.id, index]));
  const spacing = window.innerWidth <= 760 ? 390 : 462;
  const stageStart = 220;
  const axisY = window.innerWidth <= 760 ? 650 : 600;
  const stageHeight = window.innerWidth <= 760 ? 1300 : 1200;
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
  const installButton = document.querySelector("#install-button");
  const learned = new Set(JSON.parse(localStorage.getItem("history-timeline-learned-v2") || "[]"));

  let scale = window.innerWidth <= 760 ? 0.78 : 0.9;
  let panX = 0;
  let panY = 0;
  let currentIndex = Math.max(0, Number(localStorage.getItem("history-timeline-current-v2")) || 0);
  let detailEventId = null;
  let pointerStart = null;
  let moved = false;
  let renderFrame = null;
  let deferredInstallPrompt = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  function titleParts(title) {
    const tags = [...title.matchAll(/【([^】]+)】/g)].map((match) => match[1]);
    const clean = title.replace(/【[^】]+】/g, "").replace(/[▲]+/g, "").trim();
    return { clean, tags };
  }

  function importanceOf(title) {
    if (/论述题|重点|▲|多选题|选择题/.test(title) && !/非重点/.test(title)) return "major";
    if (/非重点|背景|了解/.test(title)) return "secondary";
    return "normal";
  }

  function relatedYears(point, limit = Infinity) {
    const years = point.relatedYears || [];
    const shown = years.slice(0, limit);
    const rest = years.length - shown.length;
    return shown.length
      ? `<span class="related-time">关联 ${shown.map((year) => `${year}年`).join(" · ")}${rest > 0 ? ` · +${rest}` : ""}</span>`
      : "";
  }

  function badgeMarkup(title) {
    const { tags } = titleParts(title);
    return tags.map((tag) => `<span class="topic-badge">${escapeHtml(tag.replace(/[▲]+/g, ""))}</span>`).join("");
  }

  function previewOf(point) {
    const line = point.content.find((item) => !/^(▸\s*)?出题角度/.test(item.text)) || point.content[0];
    return line ? line.text.replace(/^[•▸]\s*/, "") : "";
  }

  function renderTimeline() {
    const chunks = [`<div class="timeline-axis" style="top:${axisY}px"></div>`];
    source.chapters.forEach((chapter, chapterPosition) => {
      const first = events.findIndex((event) => event.chapters.includes(chapter.number));
      if (first < 0) return;
      const nextChapter = source.chapters[chapterPosition + 1];
      const next = nextChapter
        ? events.findIndex((event) => event.chapters.includes(nextChapter.number))
        : events.length;
      const normalizedNext = next > first ? next : first + 1;
      const left = stageStart + first * spacing - 56;
      const width = Math.max(spacing, (normalizedNext - first) * spacing);
      chunks.push(`<div class="chapter-band" style="left:${left}px;width:${width}px"><div class="chapter-label"><b>${chapter.number}</b><span>${escapeHtml(chapter.title)}</span></div></div>`);
    });

    events.forEach((event, index) => {
      const position = stageStart + index * spacing;
      const direction = index % 2 === 0 ? "above" : "below";
      const classes = `${direction}${learned.has(event.id) ? " learned" : ""}${index === currentIndex ? " active" : ""}`;
      const chapters = event.chapters.map((chapter) => `第 ${chapter} 章`).join(" · ");
      const topics = event.knowledge.map((point) => {
        const parts = titleParts(point.title);
        return `<li class="topic-row ${importanceOf(point.title)}"><span class="topic-title">${escapeHtml(parts.clean)}</span>${badgeMarkup(point.title)}${relatedYears(point, 4)}</li>`;
      }).join("");
      chunks.push(`<article class="timeline-node ${classes}" data-event-id="${event.id}" style="--node-x:${position}px;top:${axisY}px">
        <span class="node-pin"></span><time class="node-date" datetime="${event.year}">${event.label}</time><span class="node-connector"></span>
        <button class="node-card" type="button" aria-label="打开 ${event.label} 的 ${event.knowledge.length} 项知识">
          <span class="node-meta"><span>${chapters}</span><strong>${event.knowledge.length} 项知识</strong></span>
          <ul class="topic-list">${topics}</ul>
          <span class="node-foot"><span>${learned.has(event.id) ? "本节点已学习" : "按时间归并展示"}</span><strong>${learned.has(event.id) ? "✓ 已学习" : "展开全部正文 →"}</strong></span>
        </button>
      </article>`);
    });

    stage.innerHTML = chunks.join("");
    stage.style.width = `${stageStart * 2 + events.length * spacing}px`;
    stage.style.height = `${stageHeight}px`;
    stage.querySelectorAll(".node-card").forEach((card) => card.addEventListener("click", (event) => {
      if (moved) { event.preventDefault(); return; }
      openDetail(card.closest(".timeline-node").dataset.eventId);
    }));
  }

  function renderDock() {
    dock.innerHTML = source.chapters.map((chapter) => `<button type="button" data-chapter="${chapter.number}" title="第${chapter.number}章 ${escapeHtml(chapter.title)}">${chapter.number}</button>`).join("");
    dock.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      const index = events.findIndex((event) => event.chapters.includes(Number(button.dataset.chapter)));
      if (index >= 0) focusEvent(index, true);
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
    const stageWidth = stageStart * 2 + events.length * spacing;
    panX = Math.min(170, Math.max(window.innerWidth - stageWidth * scale - 170, panX));
    const allowance = Math.max(110, (stageHeight * scale - window.innerHeight) / 2 + 120);
    panY = Math.min(allowance, Math.max(-allowance, panY));
  }

  function setScale(nextScale, centerX = window.innerWidth / 2, centerY = window.innerHeight / 2) {
    const oldScale = scale;
    scale = Math.max(0.48, Math.min(1.25, nextScale));
    panX = centerX - ((centerX - panX) / oldScale) * scale;
    panY = centerY - ((centerY - panY) / oldScale) * scale;
    clampPan();
    queueTransform();
  }

  function focusEvent(index, animate = true) {
    currentIndex = Math.max(0, Math.min(events.length - 1, index));
    localStorage.setItem("history-timeline-current-v2", String(currentIndex));
    panX = window.innerWidth / 2 - (stageStart + currentIndex * spacing + 170) * scale;
    panY = window.innerHeight / 2 - axisY * scale;
    clampPan();
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)";
      window.setTimeout(() => { stage.style.transition = ""; }, 570);
    }
    queueTransform();
    updateCurrentUI();
  }

  function updateCurrentUI() {
    const event = events[currentIndex];
    status.textContent = `${event.label} · ${event.knowledge.length} 项`;
    document.querySelectorAll(".timeline-node.active").forEach((node) => node.classList.remove("active"));
    document.querySelector(`[data-event-id="${event.id}"]`)?.classList.add("active");
    dock.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", event.chapters.includes(Number(button.dataset.chapter)));
    });
  }

  function semanticClass(line) {
    const text = line.text;
    if (/^(▸\s*)?出题角度|【例】|考试考到|命题/.test(text)) return "exam-note";
    if (/^[•◆◇]\s*/.test(text)) return text.length <= 90 ? "content-heading" : "bullet-paragraph";
    if (/^(?:[（(]?\d+[）).、]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(text)) return "numbered";
    if (text.length < 100 && /(根本原因|最主要|本质|核心|关键|标志|意义|结论)[：:]/.test(text)) return "key-conclusion";
    return line.kind || "paragraph";
  }

  function richText(text) {
    let html = escapeHtml(text.replace(/^[•◆◇]\s*/, ""));
    html = html.replace(/((?:18|19|20)\d{2}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?)?)/g, '<span class="inline-date">$1</span>');
    html = html.replace(/【([^】]+)】/g, '<span class="inline-tag">【$1】</span>');
    html = html.replace(/^([^：:]{1,24}[：:])/, "<strong>$1</strong>");
    return html;
  }

  function renderKnowledge(point) {
    const parts = titleParts(point.title);
    const related = relatedYears(point, Infinity);
    return `<section class="knowledge-section ${importanceOf(point.title)}">
      <div class="knowledge-kicker"><span>第 ${point.chapter} 章</span><span>笔记第 ${point.sourcePage} 页</span></div>
      <h3>${escapeHtml(parts.clean)}</h3>
      <div class="knowledge-tags">${badgeMarkup(point.title)}${related}</div>
      <div class="knowledge-body">${point.content.map((line) => `<p class="detail-line ${semanticClass(line)}">${richText(line.text)}</p>`).join("")}</div>
    </section>`;
  }

  function openDetail(id) {
    const event = byId.get(id);
    if (!event) return;
    detailEventId = id;
    currentIndex = eventIndex.get(id);
    updateCurrentUI();
    localStorage.setItem("history-timeline-current-v2", String(currentIndex));
    detailContent.innerHTML = `<header class="event-detail-header"><p class="eyebrow">历史时间节点</p><h2>${event.label}</h2><p>${event.knowledge.length} 项知识按主要发生时间归并；“关联时间”表示该知识同时涉及的其他年份。</p></header>${event.knowledge.map(renderKnowledge).join("")}`;
    detailContent.scrollTop = 0;
    updateLearnedButton();
    detailScrim.hidden = false;
    detailPanel.classList.add("open");
    detailPanel.setAttribute("aria-hidden", "false");
  }

  function closeDetail() {
    detailPanel.classList.remove("open");
    detailPanel.setAttribute("aria-hidden", "true");
    detailScrim.hidden = true;
    detailEventId = null;
  }

  function updateLearnedButton() {
    const active = learned.has(detailEventId);
    learnedButton.classList.toggle("active", active);
    learnedButton.textContent = active ? "✓ 本节点已学习" : "标记本节点已学";
  }

  function toggleLearned() {
    if (!detailEventId) return;
    learned.has(detailEventId) ? learned.delete(detailEventId) : learned.add(detailEventId);
    localStorage.setItem("history-timeline-learned-v2", JSON.stringify([...learned]));
    const node = document.querySelector(`[data-event-id="${detailEventId}"]`);
    node?.classList.toggle("learned", learned.has(detailEventId));
    const foot = node?.querySelector(".node-foot strong");
    if (foot) foot.textContent = learned.has(detailEventId) ? "✓ 已学习" : "展开全部正文 →";
    updateLearnedButton();
  }

  const normalize = (value) => value.toLowerCase().replace(/[\s·—,，。；：:、“”‘’（）()《》【】]/g, "");

  function getMatches(query) {
    const term = normalize(query);
    if (!term) return events.slice(0, 12);
    return events.map((event) => {
      const titles = normalize(event.knowledge.map((point) => point.title).join(" "));
      const body = normalize(event.searchText);
      let score = 0;
      if (String(event.year) === term || normalize(event.label) === term) score += 120;
      if (titles.includes(term)) score += 70;
      if (body.includes(term)) score += 25;
      if (event.knowledge.some((point) => (point.relatedYears || []).some((year) => String(year) === term))) score += 45;
      return { event, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.event.year - b.event.year).slice(0, 36).map((item) => item.event);
  }

  function openSearch() {
    searchDialog.hidden = false;
    searchInput.value = "";
    renderSearchResults("");
    requestAnimationFrame(() => searchInput.focus());
  }
  function closeSearch() { searchDialog.hidden = true; }

  function renderSearchResults(query) {
    const matches = getMatches(query);
    searchSummary.textContent = query ? `找到 ${matches.length} 个时间节点，选择后自动定位` : `可搜索 ${source.meta.nodeCount} 个时间节点和全部正文`;
    if (!matches.length) {
      searchResults.innerHTML = '<div class="empty-results">没有找到对应内容，试试年份或更短的关键词。</div>';
      return;
    }
    searchResults.innerHTML = matches.map((event, index) => {
      const names = event.knowledge.slice(0, 3).map((point) => titleParts(point.title).clean).join("、");
      return `<button class="search-result" type="button" role="option" aria-selected="${index === 0}" data-result-id="${event.id}"><span class="result-number">${event.label}</span><span class="result-main"><strong>${escapeHtml(names)}${event.knowledge.length > 3 ? `等 ${event.knowledge.length} 项` : ""}</strong><span>${escapeHtml(previewOf(event.knowledge[0]))}</span></span><span class="result-years">${event.knowledge.length} 项知识</span></button>`;
    }).join("");
    searchResults.querySelectorAll(".search-result").forEach((result) => result.addEventListener("click", () => chooseSearchResult(result.dataset.resultId)));
  }

  function chooseSearchResult(id) {
    closeSearch();
    const index = eventIndex.get(id);
    focusEvent(index, true);
    window.setTimeout(() => openDetail(id), 300);
  }

  function moveDetail(delta) {
    const next = Math.max(0, Math.min(events.length - 1, currentIndex + delta));
    focusEvent(next, true);
    openDetail(events[next].id);
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    viewport.setPointerCapture(event.pointerId);
    pointerStart = { x: event.clientX, y: event.clientY, panX, panY };
    moved = false;
    viewport.classList.add("dragging");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    panX = pointerStart.panX + dx;
    panY = pointerStart.panY + dy;
    clampPan();
    queueTransform();
  });
  function endPointer() {
    pointerStart = null;
    viewport.classList.remove("dragging");
    window.setTimeout(() => { moved = false; }, 0);
  }
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) setScale(scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    else {
      panX -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      panY -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 0 : event.deltaX;
      clampPan();
      queueTransform();
    }
  }, { passive: false });

  document.querySelector("#search-button").addEventListener("click", openSearch);
  document.querySelector("#zoom-in").addEventListener("click", () => setScale(scale + .12));
  document.querySelector("#zoom-out").addEventListener("click", () => setScale(scale - .12));
  document.querySelector("#reset-view").addEventListener("click", () => focusEvent(currentIndex, true));
  document.querySelector("#info-button").addEventListener("click", () => { infoDialog.hidden = false; });
  document.querySelector("#previous-point").addEventListener("click", () => focusEvent(currentIndex - 1, true));
  document.querySelector("#next-point").addEventListener("click", () => focusEvent(currentIndex + 1, true));
  status.addEventListener("click", () => openDetail(events[currentIndex].id));
  document.querySelector("#detail-close").addEventListener("click", closeDetail);
  detailScrim.addEventListener("click", closeDetail);
  learnedButton.addEventListener("click", toggleLearned);
  document.querySelector("#detail-previous").addEventListener("click", () => moveDetail(-1));
  document.querySelector("#detail-next").addEventListener("click", () => moveDetail(1));
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  document.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", closeSearch));
  document.querySelectorAll("[data-close-info]").forEach((element) => element.addEventListener("click", () => { infoDialog.hidden = true; }));

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); return; }
    if (event.key === "Escape") {
      if (!searchDialog.hidden) closeSearch();
      else if (!infoDialog.hidden) infoDialog.hidden = true;
      else closeDetail();
      return;
    }
    if (!searchDialog.hidden && event.key === "Enter") {
      const first = searchResults.querySelector("[data-result-id]");
      if (first) chooseSearchResult(first.dataset.resultId);
      return;
    }
    if (event.target.matches("input, textarea")) return;
    if (event.key === "ArrowLeft") focusEvent(currentIndex - 1, true);
    if (event.key === "ArrowRight") focusEvent(currentIndex + 1, true);
    if (event.key === "/") { event.preventDefault(); openSearch(); }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installButton.hidden = true; });
  window.addEventListener("resize", () => { clampPan(); queueTransform(); });

  document.querySelector("#source-note").textContent = `内容来自 ${source.meta.pageCount} 页史纲笔记；仅保留有正文讲解的 ${source.meta.knowledgeCount} 项知识，按 ${source.meta.nodeCount} 个主要年份重新归并。`;
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
  renderTimeline();
  renderDock();
  focusEvent(Math.min(currentIndex, events.length - 1), false);
})();
