/* 体調記録アプリ本体。データは localStorage に保存する。 */
(function () {
  "use strict";

  const STORAGE_KEY = "taichou-kiroku:v1";

  // 各項目の選択肢。value は 1〜5 のスコアで、Excel 書き出し時にも使う。
  // 「良い側」を上に置き、真ん中が「普通」になるよう揃えて迷いにくくしている。
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

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const form = $("entry-form");
  const dateInput = $("date");
  const sleepHoursInput = $("sleep-hours");
  const memoInput = $("memo");
  const formError = $("form-error");
  const saveMsg = $("save-msg");
  const saveBtn = $("save-btn");
  const editBadge = $("edit-badge");
  const tableEl = $("entries-table");
  const tbody = $("entries-body");
  const emptyMsg = $("empty-msg");
  const countEl = $("count");

  // ---------- ストレージ ----------
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      console.warn("保存データの読み込みに失敗しました", e);
      return {};
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  // 日付キー(YYYY-MM-DD)をオブジェクトにして保持。1日1件。
  let entries = loadEntries();

  function sortedDates() {
    return Object.keys(entries).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }

  // ---------- ユーティリティ ----------
  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function labelOf(field, value) {
    const opt = OPTIONS[field].find((o) => o.value === Number(value));
    return opt ? opt.label : "";
  }

  function formatDateJa(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
    return `${m}/${d} (${wd})`;
  }

  function formatHours(h) {
    if (h === null || h === undefined || h === "") return "";
    return Number.isInteger(h) ? `${h}時間` : `${h}時間`;
  }

  function updateSelectStyle(select) {
    select.classList.toggle("is-empty", select.value === "");
  }

  // ---------- フォーム初期化 ----------
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
        select.closest(".field").classList.remove("invalid");
      });
    }
  }

  function resetForm(keepDate) {
    const date = keepDate ? dateInput.value : todayString();
    form.reset();
    dateInput.value = date;
    for (const field of Object.keys(OPTIONS)) {
      const select = $(SELECT_IDS[field]);
      select.value = "";
      updateSelectStyle(select);
    }
    clearInvalid();
    hideError();
    syncEditState();
  }

  function fillForm(date) {
    const e = entries[date];
    if (!e) return;
    dateInput.value = date;
    for (const field of Object.keys(OPTIONS)) {
      const select = $(SELECT_IDS[field]);
      select.value = e[field] != null ? String(e[field]) : "";
      updateSelectStyle(select);
    }
    sleepHoursInput.value = e.sleepHours != null ? String(e.sleepHours) : "";
    memoInput.value = e.memo || "";
    clearInvalid();
    hideError();
    syncEditState();
  }

  // 選択中の日付にすでに記録があるかで、ボタン文言とバッジを切り替える
  function syncEditState() {
    const exists = Boolean(entries[dateInput.value]);
    editBadge.hidden = !exists;
    saveBtn.textContent = exists ? "上書き保存する" : "保存する";
    for (const tr of tbody.querySelectorAll("tr")) {
      tr.classList.toggle("is-editing", tr.dataset.date === dateInput.value);
    }
  }

  // ---------- バリデーション ----------
  function clearInvalid() {
    form.querySelectorAll(".field.invalid").forEach((el) => el.classList.remove("invalid"));
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function hideError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  function validate() {
    clearInvalid();
    const missing = [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) {
      missing.push("日付");
      dateInput.closest(".field").classList.add("invalid");
    }

    for (const field of Object.keys(OPTIONS)) {
      const select = $(SELECT_IDS[field]);
      if (select.value === "") {
        missing.push(FIELD_LABELS[field]);
        select.closest(".field").classList.add("invalid");
      }
    }

    const hoursRaw = sleepHoursInput.value.trim();
    const hours = Number(hoursRaw);
    if (hoursRaw === "" || !Number.isFinite(hours) || hours < 0 || hours > 24) {
      missing.push("睡眠時間 (0〜24)");
      sleepHoursInput.closest(".field").classList.add("invalid");
    }

    if (missing.length) {
      showError(`未入力または不正な項目があります: ${missing.join("、")}`);
      const first = form.querySelector(".field.invalid select, .field.invalid input");
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
      sleepHours: Math.round(hours * 100) / 100,
      sleepQuality: Number($("sleep-quality").value),
      memo: memoInput.value.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ---------- 一覧描画 ----------
  function dotHtml(level) {
    return `<span class="dot l${level}" aria-hidden="true"></span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList() {
    const dates = sortedDates();
    tbody.innerHTML = "";
    countEl.textContent = dates.length ? `${dates.length}件` : "";
    emptyMsg.hidden = dates.length > 0;
    tableEl.hidden = dates.length === 0;

    for (const date of dates) {
      const e = entries[date];
      const tr = document.createElement("tr");
      tr.dataset.date = date;
      tr.innerHTML =
        `<td><strong>${formatDateJa(date)}</strong><br><span class="sub">${date}</span></td>` +
        `<td>${dotHtml(e.condition)}${escapeHtml(labelOf("condition", e.condition))}</td>` +
        `<td>${dotHtml(e.mental)}${escapeHtml(labelOf("mental", e.mental))}</td>` +
        `<td>${dotHtml(e.appetite)}${escapeHtml(labelOf("appetite", e.appetite))}</td>` +
        `<td>${dotHtml(e.motivation)}${escapeHtml(labelOf("motivation", e.motivation))}</td>` +
        `<td>${escapeHtml(formatHours(e.sleepHours))}<br><span class="sub">${dotHtml(e.sleepQuality)}${escapeHtml(labelOf("sleepQuality", e.sleepQuality))}</span></td>` +
        `<td class="ops">` +
        `<button type="button" class="btn-icon" data-action="edit" data-date="${date}">編集</button>` +
        `<button type="button" class="btn-icon delete" data-action="delete" data-date="${date}">削除</button>` +
        `</td>`;
      tbody.appendChild(tr);

      // メモは横幅を圧迫しないよう、行の下に全幅で表示する
      if (e.memo) {
        tr.classList.add("has-memo");
        const memoTr = document.createElement("tr");
        memoTr.className = "memo-row";
        memoTr.dataset.date = date;
        memoTr.innerHTML = `<td colspan="7"><span class="memo-text">${escapeHtml(e.memo)}</span></td>`;
        tbody.appendChild(memoTr);
      }
    }
    syncEditState();
  }

  // ---------- Excel 書き出し ----------
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
    // Excel では古い日付が上にある方がグラフにしやすいので昇順にする
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
        e.memo || "",
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

  // ---------- メッセージ ----------
  let flashTimer = null;
  function flash(msg, isError) {
    saveMsg.textContent = msg;
    saveMsg.style.color = isError ? "var(--danger)" : "";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      saveMsg.textContent = "";
    }, 4000);
  }

  // ---------- イベント ----------
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entry = validate();
    if (!entry) return;
    const existed = Boolean(entries[entry.date]);
    entries[entry.date] = entry;
    try {
      saveEntries(entries);
    } catch (e) {
      showError("保存に失敗しました。ブラウザの保存領域が使えない可能性があります。");
      return;
    }
    renderList();
    flash(existed ? `${formatDateJa(entry.date)} の記録を上書きしました。` : `${formatDateJa(entry.date)} の記録を保存しました。`);
    syncEditState();
  });

  $("clear-btn").addEventListener("click", () => resetForm(true));

  $("today-btn").addEventListener("click", () => {
    dateInput.value = todayString();
    dateInput.dispatchEvent(new Event("change"));
  });

  // 日付を変えたとき、その日の記録があれば読み込む。なければ入力欄を空にする。
  dateInput.addEventListener("change", () => {
    if (entries[dateInput.value]) {
      fillForm(dateInput.value);
    } else {
      resetForm(true);
    }
  });

  sleepHoursInput.addEventListener("input", () => {
    sleepHoursInput.closest(".field").classList.remove("invalid");
  });

  tbody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const date = btn.dataset.date;
    if (btn.dataset.action === "edit") {
      fillForm(date);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      $("condition").focus();
    } else if (btn.dataset.action === "delete") {
      if (!confirm(`${formatDateJa(date)} の記録を削除しますか?`)) return;
      delete entries[date];
      saveEntries(entries);
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
    entries = {};
    saveEntries(entries);
    renderList();
    resetForm(true);
    flash("すべての記録を削除しました。");
  });

  // ---------- 起動 ----------
  populateSelects();
  dateInput.value = todayString();
  renderList();
  if (entries[dateInput.value]) {
    fillForm(dateInput.value);
  } else {
    syncEditState();
  }
})();
