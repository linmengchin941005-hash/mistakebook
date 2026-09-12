const VISION_MODEL = "@cf/qwen/qwen3.8-27b";

const UNITS = [
  "多項式函數",
  "指數與對數",
  "數列與級數",
  "排列組合",
  "機率",
  "三角比與三角函數",
  "其他",
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL DEFAULT 'image/jpeg',
  subject TEXT NOT NULL DEFAULT '數A',
  semester TEXT NOT NULL DEFAULT '高二上',
  unit TEXT NOT NULL DEFAULT '其他',
  subunit TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  ai_note TEXT NOT NULL DEFAULT '',
  student_note TEXT NOT NULL DEFAULT '',
  error_type TEXT NOT NULL DEFAULT '',
  mastery INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mistakes_unit ON mistakes(unit);
CREATE INDEX IF NOT EXISTS idx_mistakes_mastery ON mistakes(mastery);
CREATE INDEX IF NOT EXISTS idx_mistakes_created_at ON mistakes(created_at);
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (!authorized(request, env)) {
        return json({ error: "PIN 錯誤" }, 401);
      }

      await ensureSchema(env.DB);

      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        return dashboard(env);
      }

      if (url.pathname === "/api/analyze" && request.method === "POST") {
        return analyze(request, env);
      }

      if (url.pathname === "/api/mistakes" && request.method === "GET") {
        return listMistakes(url, env);
      }

      if (url.pathname === "/api/mistakes" && request.method === "POST") {
        return createMistake(request, env);
      }

      if (url.pathname === "/api/review" && request.method === "GET") {
        return review(env);
      }

      const imageMatch = url.pathname.match(/^\/api\/mistakes\/(\d+)\/image$/);
      if (imageMatch && request.method === "GET") {
        return getImage(Number(imageMatch[1]), env);
      }

      const itemMatch = url.pathname.match(/^\/api\/mistakes\/(\d+)$/);
      if (itemMatch) {
        const id = Number(itemMatch[1]);
        if (request.method === "GET") return getMistake(id, env);
        if (request.method === "PATCH") return updateMistake(id, request, env);
        if (request.method === "DELETE") return deleteMistake(id, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({
        error: "伺服器發生錯誤",
        detail: err instanceof Error ? err.message : String(err),
      }, 500);
    }
  },
};

function authorized(request, env) {
  if (!env.APP_PIN) return false;
  const pin = request.headers.get("x-app-pin") || "";
  return constantTimeEqual(pin, env.APP_PIN);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function ensureSchema(db) {
  const statements = SCHEMA_SQL
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => db.prepare(s));
  await db.batch(statements);
}

async function dashboard(env) {
  const [totals, units] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN mastery = 0 THEN 1 ELSE 0 END) AS red,
        SUM(CASE WHEN mastery = 1 THEN 1 ELSE 0 END) AS yellow,
        SUM(CASE WHEN mastery = 2 THEN 1 ELSE 0 END) AS green
      FROM mistakes
    `).first(),
    env.DB.prepare(`
      SELECT unit, COUNT(*) AS count,
             SUM(CASE WHEN mastery < 2 THEN 1 ELSE 0 END) AS needs_review
      FROM mistakes
      GROUP BY unit
      ORDER BY needs_review DESC, count DESC
    `).all(),
  ]);

  return json({
    totals: {
      total: Number(totals?.total || 0),
      red: Number(totals?.red || 0),
      yellow: Number(totals?.yellow || 0),
      green: Number(totals?.green || 0),
    },
    units: units.results || [],
  });
}

async function analyze(request, env) {
  const form = await request.formData();
  const image = form.get("image");

  if (!(image instanceof File)) {
    return json({ error: "請上傳圖片" }, 400);
  }
  if (!image.type.startsWith("image/")) {
    return json({ error: "檔案必須是圖片" }, 400);
  }
  if (image.size > 8 * 1024 * 1024) {
    return json({ error: "圖片請小於 8MB" }, 400);
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const base64 = arrayBufferToBase64(bytes);
  const dataUri = `data:${image.type};base64,${base64}`;

  const prompt = `
你是一位台灣高中數學家教。請閱讀這張「高二上學期數A」錯題照片。

任務：
1. 抄寫主要題目。數學式盡量使用易讀的純文字 / LaTeX，例如 x^2、sqrt(2)、log_2(8)。
2. 從指定大單元中選一個：
${UNITS.map(x => `- ${x}`).join("\n")}
3. 判斷更細的小單元 subunit。
4. 給出正確答案。
5. 給出適合高中生閱讀的精簡解法，不要故意寫很長。
6. ai_note 寫一句「這題最核心的觀念」。
7. 若照片看不清楚，不要亂猜，needs_review 設 true，並在 ai_note 說明哪裡不清楚。

只輸出 JSON，不要 Markdown，也不要使用程式碼區塊。
格式必須是：
{
  "unit": "指數與對數",
  "subunit": "指數律",
  "question": "題目文字",
  "answer": "答案",
  "solution": "解法",
  "ai_note": "核心觀念",
  "needs_review": false
}
`;

  const response = await env.AI.run(VISION_MODEL, {
    messages: [
      {
        role: "system",
        content: "你必須精確閱讀數學題圖片，使用繁體中文回答。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    image: dataUri,
    temperature: 0.1,
    max_completion_tokens: 1200,
  });

  const raw =
    response?.response ??
    response?.result ??
    response?.choices?.[0]?.message?.content ??
    response?.choices?.[0]?.text ??
    "";

  const parsed = extractJson(raw);
  if (!parsed) {
    return json({
      error: "AI 有讀到圖片，但回傳格式無法解析，請再試一次。",
      raw: String(raw).slice(0, 1500),
    }, 502);
  }

  parsed.unit = UNITS.includes(parsed.unit) ? parsed.unit : "其他";
  parsed.subunit = cleanText(parsed.subunit);
  parsed.question = cleanText(parsed.question);
  parsed.answer = cleanText(parsed.answer);
  parsed.solution = cleanText(parsed.solution);
  parsed.ai_note = cleanText(parsed.ai_note);
  parsed.needs_review = Boolean(parsed.needs_review);

  // 暫存圖片到 R2。只有學生確認後，才會建立 D1 題目資料。
  const uploadToken = crypto.randomUUID();
  const imageKey = `pending/${uploadToken}`;
  await env.BUCKET.put(imageKey, bytes, {
    httpMetadata: { contentType: image.type },
    customMetadata: { uploadedAt: new Date().toISOString() },
  });

  return json({
    analysis: parsed,
    upload_token: uploadToken,
    image_type: image.type,
  });
}

async function createMistake(request, env) {
  const body = await request.json();
  const token = String(body.upload_token || "");
  if (!/^[0-9a-f-]{30,50}$/i.test(token)) {
    return json({ error: "圖片暫存憑證無效，請重新上傳。" }, 400);
  }

  const pendingKey = `pending/${token}`;
  const obj = await env.BUCKET.get(pendingKey);
  if (!obj) {
    return json({ error: "暫存圖片已不存在，請重新上傳。" }, 400);
  }

  const idKey = `mistakes/${crypto.randomUUID()}`;
  const bytes = await obj.arrayBuffer();
  const imageType = obj.httpMetadata?.contentType || body.image_type || "image/jpeg";

  await env.BUCKET.put(idKey, bytes, {
    httpMetadata: { contentType: imageType },
  });

  const unit = UNITS.includes(body.unit) ? body.unit : "其他";
  const result = await env.DB.prepare(`
    INSERT INTO mistakes (
      image_key, image_type, unit, subunit, question, answer, solution,
      ai_note, student_note, error_type, mastery
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    idKey,
    imageType,
    unit,
    cleanText(body.subunit),
    cleanText(body.question),
    cleanText(body.answer),
    cleanText(body.solution),
    cleanText(body.ai_note),
    cleanText(body.student_note),
    cleanText(body.error_type),
    clampMastery(body.mastery),
  ).run();

  await env.BUCKET.delete(pendingKey);

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function listMistakes(url, env) {
  const unit = url.searchParams.get("unit");
  const mastery = url.searchParams.get("mastery");
  const q = url.searchParams.get("q");

  let sql = `
    SELECT id, unit, subunit, question, answer, student_note, error_type,
           mastery, created_at, reviewed_at
    FROM mistakes
    WHERE 1=1
  `;
  const args = [];

  if (unit && UNITS.includes(unit)) {
    sql += " AND unit = ?";
    args.push(unit);
  }
  if (mastery !== null && ["0", "1", "2"].includes(mastery)) {
    sql += " AND mastery = ?";
    args.push(Number(mastery));
  }
  if (q) {
    sql += " AND (question LIKE ? OR subunit LIKE ? OR student_note LIKE ?)";
    const like = `%${q.slice(0, 80)}%`;
    args.push(like, like, like);
  }

  sql += " ORDER BY created_at DESC LIMIT 200";

  const stmt = env.DB.prepare(sql);
  const result = args.length ? await stmt.bind(...args).all() : await stmt.all();
  return json({ items: result.results || [] });
}

async function getMistake(id, env) {
  const row = await env.DB.prepare("SELECT * FROM mistakes WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "找不到這題" }, 404);
  return json({ item: row });
}

async function getImage(id, env) {
  const row = await env.DB.prepare(
    "SELECT image_key, image_type FROM mistakes WHERE id = ?"
  ).bind(id).first();

  if (!row) return json({ error: "找不到這題" }, 404);

  const obj = await env.BUCKET.get(row.image_key);
  if (!obj) return json({ error: "找不到圖片" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("content-type", row.image_type || "image/jpeg");
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { headers });
}

async function updateMistake(id, request, env) {
  const body = await request.json();
  const existing = await env.DB.prepare("SELECT * FROM mistakes WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "找不到這題" }, 404);

  const next = {
    unit: UNITS.includes(body.unit) ? body.unit : existing.unit,
    subunit: body.subunit ?? existing.subunit,
    question: body.question ?? existing.question,
    answer: body.answer ?? existing.answer,
    solution: body.solution ?? existing.solution,
    ai_note: body.ai_note ?? existing.ai_note,
    student_note: body.student_note ?? existing.student_note,
    error_type: body.error_type ?? existing.error_type,
    mastery: body.mastery === undefined ? existing.mastery : clampMastery(body.mastery),
  };

  await env.DB.prepare(`
    UPDATE mistakes SET
      unit=?, subunit=?, question=?, answer=?, solution=?, ai_note=?,
      student_note=?, error_type=?, mastery=?,
      reviewed_at=CASE WHEN ? != mastery THEN CURRENT_TIMESTAMP ELSE reviewed_at END
    WHERE id=?
  `).bind(
    next.unit,
    cleanText(next.subunit),
    cleanText(next.question),
    cleanText(next.answer),
    cleanText(next.solution),
    cleanText(next.ai_note),
    cleanText(next.student_note),
    cleanText(next.error_type),
    next.mastery,
    next.mastery,
    id,
  ).run();

  return json({ ok: true });
}

async function deleteMistake(id, env) {
  const row = await env.DB.prepare("SELECT image_key FROM mistakes WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "找不到這題" }, 404);

  await env.DB.prepare("DELETE FROM mistakes WHERE id = ?").bind(id).run();
  if (row.image_key) await env.BUCKET.delete(row.image_key);
  return json({ ok: true });
}

async function review(env) {
  const result = await env.DB.prepare(`
    SELECT id, unit, subunit, question, answer, solution, ai_note,
           student_note, error_type, mastery, created_at
    FROM mistakes
    WHERE mastery < 2
    ORDER BY
      CASE mastery WHEN 0 THEN 0 ELSE 1 END,
      COALESCE(reviewed_at, created_at) ASC,
      RANDOM()
    LIMIT 5
  `).all();

  return json({ items: result.results || [] });
}

function extractJson(value) {
  if (value && typeof value === "object") {
    if (!Array.isArray(value)) return value;
  }

  let text = String(value || "").trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function arrayBufferToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function cleanText(v) {
  return String(v ?? "").trim().slice(0, 12000);
}

function clampMastery(v) {
  const n = Number(v);
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
