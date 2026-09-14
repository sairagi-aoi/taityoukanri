/* 体調記録アプリ本体。データは localStorage に保存する。 */
(function () {
  "use strict";

  const STORAGE_KEY = "taichou-kiroku:v1";
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_ENTRIES = 5000;
  const MEMO_MAX = 500;
  const TREND_DAYS = 14;

  const OPTIONS = {
    condition: [
      { value: 5, label: "とても良い" },
      { value: 4, label: "良い" },
      { value: 3, label: "普通" },
      { value: 2, label: "やや悪い" },
      { value: 1, label: "悪い" },
    ],
    mental: [
      { value: 5, label: "とても安定" },
      { value: 4, label: "安定" },
      { value: 3, label: "普通" },
      { value: 2, label: "やや不安定" },
      { value: 1, label: "不安定" },
    ],
    appetite: [
      { value: 5, label: "とてもある" },
      { value: 4, label: "ある" },
      { value: 3, label: "普通" },
      { value: 2, label: "あまりない" },
      { value: 1, label: "ない" },
    ],
    motivation: [
      { value: 5, label: "とても高い" },
      { value: 4, label: "高い" },
      { value: 3, label: "普通" },
      { value: 2, label: "やや低い" },
      { value: 1, label: "低い" },
    ],
    sleepQuality: [
      { value: 5, label: "とても良い" },
      { value: 4, label: "良い" },
      { value: 3, label: "普通" },
      { value: 2, label: "やや悪い" },
      { value: 1, label: "悪い" },
    ],
  };

  const SCORE_FIELDS = ["condition", "mental", "appetite", "motivation", "sleepQuality"];

  const FIELD_LABELS = {
    condition: "体調",
    mental: "メンタルの安定度",
    appetite: "食欲",
    motivation: "意欲",
    sleepQuality: "睡眠の質",
  };

  const SELECT_IDS = {
    condition: "condition",
    mental: "mental",
    appetite: "appetite",
    motivation: "motivation",
    sleepQuality: "sleep-quality",
  };

  const $ = (id) => document.getElementById(id);
  const form = $("entry-form");
  const dateInput = $("date");
  const sleepHoursInput = $("sleep-hours");
  const memoInput = $("memo");
  const formError = $("form-error");
  const saveBtn = $("save-btn");
  const editBadge = $("edit-badge");
  const tableEl = $("entries-table");
  const tbody = $("entries-body");
  const emptyMsg = $("empty-msg");
  const countEl = $("count");
  const appToast = $("app-toast");
  const todayStatusEl = $("today-status");
  const streakEl = $("streak-info");
  const monthFilterEl = $("month-filter");
  const trendsWrap = $("trends-wrap");
  const trendsSvg = $("trends-chart");

  let formBaseline = null;
  let lastDateValue = "";
  /** @type {string} YYYY-MM または "" で全件 */
  let listMonthFilter = "";

  function loadEntriesRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      console.warn("保存データの読み込みに失敗しました", e);
      return {};
    }
  }

  function scoreValue(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) return null;
    return n;
  }

  function parseSleepHours(v) {
    if (v === null || v === undefined || v === "") return null;
    const raw = String(v).trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) return null;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return null;
    return Math.round(hours * 100) / 100;
  }

  function normalizeEntry(date, raw) {
    if (!DATE_RE.test(date) || !raw || typeof raw !== "object") return null;
    const scores = {};
    for (const field of SCORE_FIELDS) {
      const s = scoreValue(raw[field]);
      if (s === null) return null;
      scores[field] = s;
    }
    const sleepHours = parseSleepHours(raw.sleepHours);
    if (sleepHours === null) return null;
    let memo = "";
    if (raw.memo != null && raw.memo !== "") {
      memo = String(raw.memo).slice(0, MEMO_MAX).trim();
    }
    const updatedAt =
      typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : new Date().toISOString();
    return {
      date,
      ...scores,
      sleepHours,
      memo,
      updatedAt,
    };
  }

  function normalizeStore(parsed) {
    const out = {};
    const keys = Object.keys(parsed).filter((k) => DATE_RE.test(k)).sort();
    for (const key of keys.slice(0, MAX_ENTRIES)) {
      const entry = normalizeEntry(key, parsed[key]);
      if (entry) out[key] = entry;
    }
    return out;
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function persistEntries() {
    try {
      saveEntries(entries);
      return true;
    } catch (e) {
      return false;
    }
  }

  const loadedRaw = loadEntriesRaw();
  let entries = normalizeStore(loadedRaw);

  function sortedDates() {
    return Object.keys(entries).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }

  function sortedDatesForList() {
    const all = sortedDates();
    if (!listMonthFilter) return all;
    return all.filter((d) => d.startsWith(listMonthFilter));
  }

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function currentYearMonth() {
    const t = todayString();
    return t.slice(0, 7);
  }

  function addDays(iso, delta) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function labelOf(field, value) {
    const opt = OPTIONS[field].find((o) => o.value === Number(value));
    return opt ? opt.label : "";
  }

  function formatDateJa(iso) {
    if (!DATE_RE.test(iso)) return iso;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
    return `${m}/${d} (${wd})`;
  }

  function formatHours(h) {
    if (h === null || h === undefined || h === "") return "";
    return `${h}時間`;
  }

  function getFormSnapshot() {
    const snap = {
      date: dateInput.value,
      sleepHours: sleepHoursInput.value.trim(),
      memo: memoInput.value.trim(),
    };
    for (const field of SCORE_FIELDS) {
      snap[field] = $(SELECT_IDS[field]).value;
    }
    return snap;
  }

  function setFormBaseline() {
    formBaseline = getFormSnapshot();
  }

  function isFormDirty() {
    if (!formBaseline) return false;
    const cur = getFormSnapshot();
    return JSON.stringify(cur) !== JSON.stringify(formBaseline);
  }

  function confirmDiscard() {
    if (!isFormDirty()) return true;
    return confirm("入力内容は保存されていません。破棄して続けますか?");
  }

  function updateSelectStyle(select) {
    select.classList.toggle("is-empty", select.value === "");
  }

  function setFieldInvalid(el, invalid) {
    const field = el.closest(".field");
    if (!field) return;
    field.classList.toggle("invalid", invalid);
    const control = field.querySelector("select, input, textarea");
    if (control) control.setAttribute("aria-invalid", invalid ? "true" : "false");
  }

  function populateSelects() {
    for (const field of Object.keys(OPTIONS)) {
      const select = $(SELECT_IDS[field]);
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "選択してください";
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
      for (const opt of OPTIONS[field]) {
        const o = document.createElement("option");
        o.value = String(opt.value);
        o.textContent = opt.label;
        select.appendChild(o);
      }
      updateSelectStyle(select);
      select.addEventListener("change", () => {
        updateSelectStyle(select);
        setFieldInvalid(select, false);
      });
    }
  }

  function resetForm(keepDate) {
    const date = keepDate ? dateInput.value : todayString();
    form.reset();
    dateInput.value = date;
    lastDateValue = date;
    for (const field of SCORE_FIELDS) {
      const select = $(SELECT_IDS[field]);
      select.value = "";
      updateSelectStyle(select);
    }
    clearInvalid();
    hideError();
    syncEditState();
    setFormBaseline();
  }

  function fillForm(date) {
    const e = entries[date];
    if (!e) return;
    dateInput.value = date;
    lastDateValue = date;
    for (const field of SCORE_FIELDS) {
      const select = $(SELECT_IDS[field]);
      const v = scoreValue(e[field]);
      select.value = v != null ? String(v) : "";
      updateSelectStyle(select);
    }
    sleepHoursInput.value = e.sleepHours != null ? String(e.sleepHours) : "";
    memoInput.value = e.memo || "";
    clearInvalid();
    hideError();
    syncEditState();
    setFormBaseline();
  }

  function syncEditState() {
    const exists = Boolean(entries[dateInput.value]);
    editBadge.hidden = !exists;
    saveBtn.textContent = exists ? "上書き保存する" : "保存する";
    for (const tr of tbody.querySelectorAll("tr")) {
      tr.classList.toggle("is-editing", tr.dataset.date === dateInput.value);
    }
    updateHeaderStatus();
  }

  function clearInvalid() {
    form.querySelectorAll(".field").forEach((el) => {
      el.classList.remove("invalid");
      const control = el.querySelector("select, input, textarea");
      if (control) control.setAttribute("aria-invalid", "false");
    });
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function hideError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  function isValidSelectValue(field, value) {
    return OPTIONS[field].some((o) => o.value === Number(value));
  }

  function validate() {
    clearInvalid();
    const missing = [];

    if (!DATE_RE.test(dateInput.value)) {
      missing.push("日付");
      setFieldInvalid(dateInput, true);
    }

    for (const field of SCORE_FIELDS) {
      const select = $(SELECT_IDS[field]);
      if (select.value === "" || !isValidSelectValue(field, select.value)) {
        missing.push(FIELD_LABELS[field]);
        setFieldInvalid(select, true);
      }
    }

    const hoursRaw = sleepHoursInput.value.trim();
    const hours = parseSleepHours(hoursRaw);
    if (hours === null) {
      missing.push("睡眠時間 (0〜24)");
      setFieldInvalid(sleepHoursInput, true);
    }

    if (missing.length) {
      showError(`未入力または不正な項目があります: ${missing.join("、")}`);
      const first = form.querySelector(".field.invalid select, .field.invalid input, .field.invalid textarea");
      if (first) first.focus();
      return null;
    }

    hideError();
    return {
      date: dateInput.value,
      condition: Number($("condition").value),
      mental: Number($("mental").value),
      appetite: Number($("appetite").value),
      motivation: Number($("motivation").value),
      sleepHours: hours,
      sleepQuality: Number($("sleep-quality").value),
      memo: memoInput.value.trim().slice(0, MEMO_MAX),
      updatedAt: new Date().toISOString(),
    };
  }

  function appendDot(parent, level) {
    const n = scoreValue(level);
    if (n === null) return;
    const span = document.createElement("span");
    span.className = `dot l${n}`;
    span.setAttribute("aria-hidden", "true");
    parent.appendChild(span);
  }

  function appendScoreCell(td, field, value) {
    appendDot(td, value);
    td.appendChild(document.createTextNode(labelOf(field, value)));
  }

  function renderList() {
    const dates = sortedDatesForList();
    tbody.replaceChildren();
    const total = sortedDates().length;
    countEl.textContent = total
      ? listMonthFilter
        ? `${dates.length}件 / 全${total}件`
        : `${total}件`
      : "";
    const hasAny = total > 0;
    emptyMsg.hidden = dates.length > 0;
    if (!hasAny) {
      emptyMsg.textContent = "まだ記録がありません。フォームから今日の記録を保存しましょう。";
    } else if (dates.length === 0) {
      emptyMsg.textContent = "この月の記録はありません。月を変えるか「すべての月」を選んでください。";
      emptyMsg.hidden = false;
    }
    tableEl.hidden = dates.length === 0;

    for (const date of dates) {
      const e = entries[date];
      if (!e) continue;

      const tr = document.createElement("tr");
      tr.dataset.date = date;

      const tdDate = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = formatDateJa(date);
      tdDate.appendChild(strong);
      tdDate.appendChild(document.createElement("br"));
      const subDate = document.createElement("span");
      subDate.className = "sub";
      subDate.textContent = date;
      tdDate.appendChild(subDate);
      tr.appendChild(tdDate);

      const tdCond = document.createElement("td");
      appendScoreCell(tdCond, "condition", e.condition);
      tr.appendChild(tdCond);

      const tdMental = document.createElement("td");
      appendScoreCell(tdMental, "mental", e.mental);
      tr.appendChild(tdMental);

      const tdApp = document.createElement("td");
      appendScoreCell(tdApp, "appetite", e.appetite);
      tr.appendChild(tdApp);

      const tdMot = document.createElement("td");
      appendScoreCell(tdMot, "motivation", e.motivation);
      tr.appendChild(tdMot);

      const tdSleep = document.createElement("td");
      tdSleep.appendChild(document.createTextNode(formatHours(e.sleepHours)));
      tdSleep.appendChild(document.createElement("br"));
      const subSleep = document.createElement("span");
      subSleep.className = "sub";
      appendDot(subSleep, e.sleepQuality);
      subSleep.appendChild(document.createTextNode(labelOf("sleepQuality", e.sleepQuality)));
      tdSleep.appendChild(subSleep);
      tr.appendChild(tdSleep);

      const tdOps = document.createElement("td");
      tdOps.className = "ops";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-icon";
      editBtn.dataset.action = "edit";
      editBtn.dataset.date = date;
      editBtn.textContent = "編集";
      editBtn.setAttribute("aria-label", `${formatDateJa(date)} の記録を編集`);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-icon delete";
      delBtn.dataset.action = "delete";
      delBtn.dataset.date = date;
      delBtn.textContent = "削除";
      delBtn.setAttribute("aria-label", `${formatDateJa(date)} の記録を削除`);
      tdOps.append(editBtn, delBtn);
      tr.appendChild(tdOps);

      tbody.appendChild(tr);

      if (e.memo) {
        tr.classList.add("has-memo");
        const memoTr = document.createElement("tr");
        memoTr.className = "memo-row";
        memoTr.dataset.date = date;
        const memoTd = document.createElement("td");
        memoTd.colSpan = 7;
        const memoSpan = document.createElement("span");
        memoSpan.className = "memo-text";
        memoSpan.textContent = e.memo;
        memoTd.appendChild(memoSpan);
        memoTr.appendChild(memoTd);
        tbody.appendChild(memoTr);
      }
    }
    syncEditState();
    renderTrendsChart();
    populateMonthFilter();
  }

  function populateMonthFilter() {
    if (!monthFilterEl) return;
    const months = new Set();
    for (const d of sortedDates()) months.add(d.slice(0, 7));
    const sortedMonths = [...months].sort((a, b) => (a < b ? 1 : -1));
    const prev = listMonthFilter;
    monthFilterEl.replaceChildren();
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "すべての月";
    monthFilterEl.appendChild(allOpt);
    for (const ym of sortedMonths) {
      const [y, m] = ym.split("-");
      const opt = document.createElement("option");
      opt.value = ym;
      opt.textContent = `${y}年${Number(m)}月`;
      monthFilterEl.appendChild(opt);
    }
    if (prev && [...monthFilterEl.options].some((o) => o.value === prev)) {
      monthFilterEl.value = prev;
      listMonthFilter = prev;
    } else if (sortedMonths.includes(currentYearMonth())) {
      listMonthFilter = currentYearMonth();
      monthFilterEl.value = listMonthFilter;
    } else {
      listMonthFilter = "";
      monthFilterEl.value = "";
    }
  }

  function computeStreak() {
    let streak = 0;
    let day = todayString();
    while (entries[day]) {
      streak += 1;
      day = addDays(day, -1);
    }
    return streak;
  }

  function updateHeaderStatus() {
    if (!todayStatusEl || !streakEl) return;
    const today = todayString();
    const hasToday = Boolean(entries[today]);
    todayStatusEl.textContent = hasToday ? "今日: 記録済み" : "今日: 未記録";
    todayStatusEl.classList.toggle("is-done", hasToday);
    todayStatusEl.classList.toggle("is-pending", !hasToday);
    const streak = computeStreak();
    streakEl.textContent = streak > 0 ? `連続 ${streak} 日` : "連続記録なし";
  }

  function renderTrendsChart() {
    if (!trendsWrap || !trendsSvg) return;
    const all = sortedDates().reverse().slice(-TREND_DAYS);
    if (all.length < 2) {
      trendsWrap.hidden = true;
      return;
    }
    trendsWrap.hidden = false;

    const w = 320;
    const h = 120;
    const pad = { l: 28, r: 8, t: 12, b: 22 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;

    const series = [
      { key: "condition", stroke: "var(--level-5)", label: "体調" },
      { key: "mental", stroke: "var(--accent)", label: "メンタル" },
    ];

    function yPos(score) {
      return pad.t + ih - ((score - 1) / 4) * ih;
    }
    function xPos(i) {
      return pad.l + (i / (all.length - 1)) * iw;
    }

    while (trendsSvg.firstChild) trendsSvg.removeChild(trendsSvg.firstChild);

    for (let level = 1; level <= 5; level++) {
      const y = yPos(level);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(pad.l));
      line.setAttribute("x2", String(w - pad.r));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "trend-grid");
      trendsSvg.appendChild(line);
    }

    for (const s of series) {
      const points = all
        .map((date, i) => {
          const sc = scoreValue(entries[date][s.key]);
          if (sc === null) return null;
          return `${xPos(i)},${yPos(sc)}`;
        })
        .filter(Boolean);
      if (points.length < 2) continue;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", s.stroke);
      poly.setAttribute("stroke-width", "2");
      poly.setAttribute("points", points.join(" "));
      trendsSvg.appendChild(poly);
    }

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `直近${all.length}日の体調・メンタル (1〜5)`;
    trendsSvg.appendChild(title);
  }

  function buildExportRows() {
    const header = [
      "日付",
      "体調",
      "体調(スコア)",
      "メンタルの安定度",
      "メンタル(スコア)",
      "食欲",
      "食欲(スコア)",
      "意欲",
      "意欲(スコア)",
      "睡眠時間(時間)",
      "睡眠の質",
      "睡眠の質(スコア)",
      "メモ",
    ];
    const dates = sortedDates().reverse();
    const rows = dates.map((date) => {
      const e = entries[date];
      return [
        date,
        labelOf("condition", e.condition),
        e.condition,
        labelOf("mental", e.mental),
        e.mental,
        labelOf("appetite", e.appetite),
        e.appetite,
        labelOf("motivation", e.motivation),
        e.motivation,
        e.sleepHours,
        labelOf("sleepQuality", e.sleepQuality),
        e.sleepQuality,
        (e.memo || "").slice(0, MEMO_MAX),
      ];
    });
    return [header, ...rows];
  }

  function exportExcel() {
    if (!Object.keys(entries).length) {
      flash("書き出す記録がありません。", true);
      return;
    }
    const rows = buildExportRows();
    const blob = XlsxWriter.build({
      sheetName: "体調記録",
      rows,
      colWidths: [12, 12, 12, 16, 14, 12, 12, 12, 12, 14, 12, 14, 40],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `体調記録_${todayString()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`${rows.length - 1}件をExcelファイルに書き出しました。`);
  }

  let flashTimer = null;
  function flash(msg, isError) {
    if (!appToast) return;
    appToast.textContent = msg;
    appToast.classList.toggle("is-error", Boolean(isError));
    appToast.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      appToast.hidden = true;
      appToast.textContent = "";
    }, 4000);
  }

  function flashSaveError() {
    flash("保存に失敗しました。ブラウザの保存領域が使えない可能性があります。", true);
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entry = validate();
    if (!entry) return;
    const existed = Boolean(entries[entry.date]);
    const prev = existed ? { ...entries[entry.date] } : null;
    entries[entry.date] = entry;
    if (!persistEntries()) {
      if (prev) entries[entry.date] = prev;
      else delete entries[entry.date];
      showError("保存に失敗しました。ブラウザの保存領域が使えない可能性があります。");
      return;
    }
    renderList();
    setFormBaseline();
    flash(
      existed
        ? `${formatDateJa(entry.date)} の記録を上書きしました。`
        : `${formatDateJa(entry.date)} の記録を保存しました。`
    );
  });

  $("clear-btn").addEventListener("click", () => {
    if (!confirmDiscard()) return;
    resetForm(true);
  });

  $("today-btn").addEventListener("click", () => {
    const next = todayString();
    if (dateInput.value === next) return;
    if (!confirmDiscard()) return;
    dateInput.value = next;
    dateInput.dispatchEvent(new Event("change"));
  });

  dateInput.addEventListener("change", () => {
    if (!confirmDiscard()) {
      dateInput.value = lastDateValue;
      return;
    }
    lastDateValue = dateInput.value;
    if (entries[dateInput.value]) {
      fillForm(dateInput.value);
    } else {
      resetForm(true);
    }
  });

  sleepHoursInput.addEventListener("input", () => {
    setFieldInvalid(sleepHoursInput, false);
  });

  tbody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const date = btn.dataset.date;
    if (!DATE_RE.test(date)) return;

    if (btn.dataset.action === "edit") {
      if (!confirmDiscard()) return;
      fillForm(date);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      $("condition").focus();
    } else if (btn.dataset.action === "delete") {
      if (!confirm(`${formatDateJa(date)} の記録を削除しますか?`)) return;
      const backup = entries[date];
      delete entries[date];
      if (!persistEntries()) {
        if (backup) entries[date] = backup;
        flashSaveError();
        return;
      }
      renderList();
      if (dateInput.value === date) resetForm(true);
      flash(`${formatDateJa(date)} の記録を削除しました。`);
    }
  });

  $("export-btn").addEventListener("click", exportExcel);

  $("delete-all-btn").addEventListener("click", () => {
    const n = Object.keys(entries).length;
    if (!n) {
      flash("削除する記録がありません。", true);
      return;
    }
    if (!confirm(`${n}件の記録をすべて削除します。よろしいですか?`)) return;
    const backup = { ...entries };
    entries = {};
    if (!persistEntries()) {
      entries = backup;
      flashSaveError();
      return;
    }
    renderList();
    resetForm(true);
    flash("すべての記録を削除しました。");
  });

  if (monthFilterEl) {
    monthFilterEl.addEventListener("change", () => {
      listMonthFilter = monthFilterEl.value;
      renderList();
    });
  }

  for (const field of form.querySelectorAll(".field select, .field input, .field textarea")) {
    field.setAttribute("aria-describedby", "form-error");
  }

  populateSelects();
  listMonthFilter = currentYearMonth();
  dateInput.value = todayString();
  lastDateValue = dateInput.value;
  try {
    if (localStorage.getItem(STORAGE_KEY) !== JSON.stringify(entries)) {
      persistEntries();
    }
  } catch (_) {
    /* 読み取り不可環境では同期をスキップ */
  }
  renderList();
  if (entries[dateInput.value]) {
    fillForm(dateInput.value);
  } else {
    syncEditState();
    setFormBaseline();
  }
})();

