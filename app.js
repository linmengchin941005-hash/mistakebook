const UNITS = [
  "多項式函數",
  "指數與對數",
  "數列與級數",
  "排列組合",
  "機率",
  "三角比與三角函數",
  "其他",
];

const state = {
  pin: localStorage.getItem("math_pin") || "",
  route: "home",
  dashboard: null,
  mistakes: [],
  review: [],
  detail: null,
  draft: null,
  imageFile: null,
  imagePreview: "",
  busy: false,
  error: "",
};

const app = document.querySelector("#app");

window.addEventListener("hashchange", syncRoute);
syncRoute();

function syncRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, id] = hash.split("/");
  state.route = route || "home";
  state.detailId = id || null;
  state.error = "";
  render();
  if (state.pin) loadRoute();
}

async function loadRoute() {
  try {
    if (state.route === "home") await loadDashboard();
    if (state.route === "mistakes") await loadMistakes();
    if (state.route === "review") await loadReview();
    if (state.route === "detail" && state.detailId) await loadDetail(state.detailId);
  } catch (e) {
    handleError(e);
  }
}

function render() {
  if (!state.pin) return renderPin();

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>數 A 錯題本</h1>
          <p>高二上學期 · 個人複習</p>
        </div>
        <button class="ghost" id="logoutBtn">鎖定</button>
      </header>
      ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ""}
      <div id="view">${renderView()}</div>
    </main>
    ${renderNav()}
  `;

  bindCommon();
  bindView();
}

function renderPin() {
  app.innerHTML = `
    <main class="shell pin-wrap">
      <section class="card pin-card">
        <h1>🔐 數 A 錯題本</h1>
        <p>輸入老師設定的學生存取碼。</p>
        <label class="field">PIN
          <input class="text" id="pinInput" inputmode="numeric" autocomplete="current-password" placeholder="例如 8274" />
        </label>
        <div class="actions">
          <button class="primary" id="pinBtn">進入錯題本</button>
        </div>
        ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ""}
      </section>
    </main>
  `;
  document.querySelector("#pinBtn").onclick = submitPin;
  document.querySelector("#pinInput").addEventListener("keydown", e => {
    if (e.key === "Enter") submitPin();
  });
}

async function submitPin() {
  const pin = document.querySelector("#pinInput").value.trim();
  if (!pin) return;
  state.pin = pin;
  try {
    await api("/api/dashboard");
    localStorage.setItem("math_pin", pin);
    state.error = "";
    location.hash = "#/home";
    await loadDashboard();
  } catch (e) {
    state.pin = "";
    localStorage.removeItem("math_pin");
    state.error = "PIN 不正確，請再試一次。";
    renderPin();
  }
}

function renderView() {
  if (state.route === "upload") return renderUpload();
  if (state.route === "mistakes") return renderMistakes();
  if (state.route === "review") return renderReview();
  if (state.route === "detail") return renderDetail();
  return renderHome();
}

function renderHome() {
  const d = state.dashboard;
  if (!d) return `<div class="card">載入中…</div>`;

  return `
    <section class="card hero">
      <h2>把錯題變成下次會的題目。</h2>
      <p>拍照後 AI 會先整理題目與單元，你確認過才會正式存入。</p>
      <button class="primary" onclick="location.hash='#/upload'">＋ 拍照新增錯題</button>
    </section>

    <section class="grid stats">
      ${stat(d.totals.total, "全部錯題")}
      ${stat(d.totals.red, "🔴 尚未熟悉")}
      ${stat(d.totals.yellow, "🟡 練習中")}
      ${stat(d.totals.green, "🟢 已掌握")}
    </section>

    <div class="section-title"><h2>最需要加強</h2><small>依尚未掌握題數</small></div>
    <section class="card">
      ${d.units.length ? d.units.map(u => `
        <div class="unit-row">
          <div>
            <div class="unit-name">${esc(u.unit)}</div>
            <div class="muted">${Number(u.needs_review || 0)} 題待複習</div>
          </div>
          <span class="pill">${Number(u.count)} 題</span>
        </div>
      `).join("") : `<div class="muted">還沒有錯題，先拍第一題吧。</div>`}
    </section>
  `;
}

function renderUpload() {
  if (state.draft) return renderDraft();

  return `
    <div class="section-title"><h2>新增錯題</h2></div>
    <section class="card">
      <div class="upload-box">
        <div style="font-size:38px">📷</div>
        <h3>拍下題目</h3>
        <p class="muted">盡量只拍主要題目，畫面清楚、不要太斜。</p>
        <input id="imageInput" type="file" accept="image/*" capture="environment" />
        <label for="imageInput" class="primary">選擇照片 / 拍照</label>
      </div>

      ${state.imagePreview ? `<img class="preview" src="${state.imagePreview}" alt="題目預覽" />` : ""}

      ${state.imageFile ? `
        <div class="actions">
          <button class="primary" id="analyzeBtn">${state.busy ? "AI 整理中…" : "AI 整理這一題"}</button>
          <button class="secondary" id="clearImageBtn">重選</button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderDraft() {
  const d = state.draft;
  return `
    <div class="section-title"><h2>確認 AI 整理結果</h2></div>
    ${d.analysis.needs_review ? `<div class="notice">⚠️ AI 認為照片有部分不清楚，請特別檢查題目內容。</div>` : ""}
    <section class="card">
      ${state.imagePreview ? `<img class="preview" src="${state.imagePreview}" alt="題目預覽" />` : ""}

      <label class="field">大單元
        <select class="text" id="unit">${UNITS.map(x => `<option ${x === d.analysis.unit ? "selected" : ""}>${x}</option>`).join("")}</select>
      </label>

      <label class="field">小單元
        <input class="text" id="subunit" value="${attr(d.analysis.subunit)}" />
      </label>

      <label class="field">題目
        <textarea class="text" id="question">${esc(d.analysis.question)}</textarea>
      </label>

      <label class="field">答案
        <textarea class="text" id="answer">${esc(d.analysis.answer)}</textarea>
      </label>

      <label class="field">正確解法
        <textarea class="text" id="solution">${esc(d.analysis.solution)}</textarea>
      </label>

      <label class="field">核心觀念
        <textarea class="text" id="ai_note">${esc(d.analysis.ai_note)}</textarea>
      </label>

      <label class="field">我錯在哪裡？
        <textarea class="text" id="student_note" placeholder="例如：我忘記 4 可以寫成 2²。"></textarea>
      </label>

      <label class="field">錯誤類型
        <select class="text" id="error_type">
          <option value="">尚未選擇</option>
          <option>觀念錯誤</option>
          <option>計算錯誤</option>
          <option>公式忘記</option>
          <option>看錯題目</option>
          <option>粗心</option>
          <option>其他</option>
        </select>
      </label>

      <div class="actions">
        <button class="primary" id="saveDraftBtn">✓ 存入錯題本</button>
        <button class="secondary" id="cancelDraftBtn">重新拍照</button>
      </div>
    </section>
  `;
}

function renderMistakes() {
  return `
    <div class="section-title"><h2>全部錯題</h2><small>${state.mistakes.length} 題</small></div>
    <div class="searchbar">
      <input class="text" id="searchInput" placeholder="搜尋題目、小單元、筆記…" />
      <button class="secondary" id="searchBtn">搜尋</button>
    </div>
    <section class="card">
      ${state.mistakes.length ? state.mistakes.map(m => `
        <div class="mistake-row" data-id="${m.id}">
          <div style="min-width:0">
            <div class="unit-name">${masteryIcon(m.mastery)} ${esc(m.unit)} · ${esc(m.subunit || "未分類")}</div>
            <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px">
              ${esc(m.question || "未辨識題目")}
            </div>
          </div>
          <span>›</span>
        </div>
      `).join("") : `<div class="muted">目前沒有符合條件的錯題。</div>`}
    </section>
  `;
}

function renderDetail() {
  const m = state.detail;
  if (!m) return `<div class="card">載入中…</div>`;

  return `
    <div class="section-title"><h2>${esc(m.unit)}</h2><small>#${m.id}</small></div>
    <section class="card">
      <img class="detail-image" src="/api/mistakes/${m.id}/image" data-auth-image="${m.id}" alt="原始題目" />

      <p><span class="pill">${esc(m.subunit || "未分類")}</span></p>
      <h3>題目</h3>
      <div class="question">${esc(m.question)}</div>

      <h3>答案</h3>
      <div class="question">${esc(m.answer)}</div>

      <h3>正確解法</h3>
      <div class="solution">${esc(m.solution)}</div>

      ${m.ai_note ? `<h3>核心觀念</h3><div class="notice">${esc(m.ai_note)}</div>` : ""}

      <label class="field">我錯在哪裡？
        <textarea class="text" id="detailNote">${esc(m.student_note || "")}</textarea>
      </label>

      <label class="field">錯誤類型
        <select class="text" id="detailType">
          ${["","觀念錯誤","計算錯誤","公式忘記","看錯題目","粗心","其他"].map(x =>
            `<option value="${attr(x)}" ${x === (m.error_type || "") ? "selected" : ""}>${x || "尚未選擇"}</option>`
          ).join("")}
        </select>
      </label>

      <label class="field">熟練度</label>
      <div class="mastery">
        ${masteryButton(0, "🔴 不會", m.mastery)}
        ${masteryButton(1, "🟡 練習中", m.mastery)}
        ${masteryButton(2, "🟢 已掌握", m.mastery)}
      </div>

      <div class="actions">
        <button class="primary" id="saveDetailBtn">儲存變更</button>
        <button class="danger" id="deleteBtn">刪除這題</button>
      </div>
    </section>
  `;
}

function renderReview() {
  if (!state.review.length) {
    return `
      <section class="card hero">
        <h2>今天沒有待複習題目 🎉</h2>
        <p>所有題目都已標成「已掌握」，或你還沒有加入錯題。</p>
        <button class="primary" onclick="location.hash='#/upload'">新增錯題</button>
      </section>
    `;
  }

  return `
    <div class="section-title"><h2>今日複習</h2><small>${state.review.length} 題</small></div>
    <section class="grid">
      ${state.review.map((m, i) => `
        <article class="card">
          <div class="muted">第 ${i + 1} 題 · ${esc(m.unit)} / ${esc(m.subunit || "未分類")}</div>
          <h3 class="question">${esc(m.question)}</h3>

          <details>
            <summary style="cursor:pointer;font-weight:800">顯示答案與解法</summary>
            <p><strong>答案：</strong>${esc(m.answer)}</p>
            <div class="solution">${esc(m.solution)}</div>
          </details>

          <div class="actions">
            <button class="secondary reviewMark" data-id="${m.id}" data-mastery="0">🔴 還不會</button>
            <button class="secondary reviewMark" data-id="${m.id}" data-mastery="1">🟡 再練</button>
            <button class="primary reviewMark" data-id="${m.id}" data-mastery="2">🟢 這題會了</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderNav() {
  const items = [
    ["home", "⌂", "首頁"],
    ["upload", "＋", "新增"],
    ["mistakes", "▤", "錯題"],
    ["review", "✓", "複習"],
  ];
  return `<nav class="nav">${items.map(([r, icon, label]) => `
    <button data-route="${r}" class="${state.route === r ? "active" : ""}">${icon}<br>${label}</button>
  `).join("")}</nav>`;
}

function bindCommon() {
  document.querySelector("#logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("math_pin");
    state.pin = "";
    state.dashboard = null;
    render();
  });
  document.querySelectorAll(".nav button").forEach(btn => {
    btn.onclick = () => location.hash = `#/${btn.dataset.route}`;
  });
}

function bindView() {
  if (state.route === "upload") {
    document.querySelector("#imageInput")?.addEventListener("change", onImage);
    document.querySelector("#analyzeBtn")?.addEventListener("click", analyzeImage);
    document.querySelector("#clearImageBtn")?.addEventListener("click", clearUpload);
    document.querySelector("#saveDraftBtn")?.addEventListener("click", saveDraft);
    document.querySelector("#cancelDraftBtn")?.addEventListener("click", clearUpload);
  }

  if (state.route === "mistakes") {
    document.querySelector("#searchBtn")?.addEventListener("click", () =>
      loadMistakes(document.querySelector("#searchInput").value)
    );
    document.querySelector("#searchInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") loadMistakes(e.currentTarget.value);
    });
    document.querySelectorAll(".mistake-row").forEach(row => {
      row.onclick = () => location.hash = `#/detail/${row.dataset.id}`;
    });
  }

  if (state.route === "detail" && state.detail) {
    loadProtectedImage(state.detail.id);
    document.querySelectorAll("[data-mastery]").forEach(btn => {
      btn.onclick = () => {
        state.detail.mastery = Number(btn.dataset.mastery);
        render();
      };
    });
    document.querySelector("#saveDetailBtn")?.addEventListener("click", saveDetail);
    document.querySelector("#deleteBtn")?.addEventListener("click", deleteDetail);
  }

  if (state.route === "review") {
    document.querySelectorAll(".reviewMark").forEach(btn => {
      btn.onclick = () => markReview(Number(btn.dataset.id), Number(btn.dataset.mastery));
    });
  }
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  render();
}

async function loadMistakes(q = "") {
  const data = await api(`/api/mistakes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  state.mistakes = data.items;
  render();
}

async function loadDetail(id) {
  const data = await api(`/api/mistakes/${id}`);
  state.detail = data.item;
  render();
}

async function loadReview() {
  const data = await api("/api/review");
  state.review = data.items;
  render();
}

function onImage(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  state.imageFile = file;
  if (state.imagePreview) URL.revokeObjectURL(state.imagePreview);
  state.imagePreview = URL.createObjectURL(file);
  render();
}

function clearUpload() {
  if (state.imagePreview) URL.revokeObjectURL(state.imagePreview);
  state.imagePreview = "";
  state.imageFile = null;
  state.draft = null;
  state.busy = false;
  render();
}

async function analyzeImage() {
  if (!state.imageFile || state.busy) return;
  state.busy = true;
  state.error = "";
  render();

  const fd = new FormData();
  fd.append("image", state.imageFile);

  try {
    state.draft = await api("/api/analyze", {
      method: "POST",
      body: fd,
    });
  } catch (e) {
    handleError(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function saveDraft() {
  const d = state.draft;
  if (!d) return;
  const payload = {
    upload_token: d.upload_token,
    image_type: d.image_type,
    unit: value("#unit"),
    subunit: value("#subunit"),
    question: value("#question"),
    answer: value("#answer"),
    solution: value("#solution"),
    ai_note: value("#ai_note"),
    student_note: value("#student_note"),
    error_type: value("#error_type"),
    mastery: 0,
  };

  try {
    const out = await api("/api/mistakes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    clearUpload();
    location.hash = `#/detail/${out.id}`;
  } catch (e) {
    handleError(e);
  }
}

async function saveDetail() {
  const mastery = Number(document.querySelector(".mastery .selected")?.dataset.mastery ?? state.detail.mastery);
  try {
    await api(`/api/mistakes/${state.detail.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        student_note: value("#detailNote"),
        error_type: value("#detailType"),
        mastery,
      }),
    });
    await loadDetail(state.detail.id);
  } catch (e) {
    handleError(e);
  }
}

async function deleteDetail() {
  if (!confirm("確定要刪除這一題？原始照片也會一起刪除。")) return;
  try {
    await api(`/api/mistakes/${state.detail.id}`, { method: "DELETE" });
    state.detail = null;
    location.hash = "#/mistakes";
  } catch (e) {
    handleError(e);
  }
}

async function markReview(id, mastery) {
  try {
    await api(`/api/mistakes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mastery }),
    });
    state.review = state.review.filter(x => x.id !== id);
    render();
  } catch (e) {
    handleError(e);
  }
}

async function loadProtectedImage(id) {
  try {
    const res = await fetch(`/api/mistakes/${id}/image`, {
      headers: { "x-app-pin": state.pin },
    });
    if (!res.ok) throw new Error("讀取圖片失敗");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = document.querySelector(`[data-auth-image="${id}"]`);
    if (img) img.src = url;
  } catch {}
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("x-app-pin", state.pin);

  const res = await fetch(url, { ...options, headers });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("math_pin");
      state.pin = "";
    }
    throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
  }
  return data;
}

function handleError(e) {
  state.error = e?.message || "發生錯誤";
  render();
}

function masteryButton(n, label, current) {
  return `<button data-mastery="${n}" class="${Number(current) === n ? "selected" : ""}">${label}</button>`;
}
function masteryIcon(n) {
  return Number(n) === 2 ? "🟢" : Number(n) === 1 ? "🟡" : "🔴";
}
function stat(n, label) {
  return `<div class="card stat"><strong>${Number(n || 0)}</strong><span>${label}</span></div>`;
}
function value(sel) {
  return document.querySelector(sel)?.value ?? "";
}
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function attr(v) {
  return esc(v).replaceAll('"', "&quot;");
}
