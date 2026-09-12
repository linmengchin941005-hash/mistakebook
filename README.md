# 高二上數 A｜AI 錯題本

單一學生使用的 Cloudflare Worker 小網站。

## 功能

- 手機拍照 / 上傳錯題
- Workers AI 讀圖、整理題目、分類單元
- 學生確認後再存入錯題本
- D1 儲存題目資料
- R2 私人儲存原始照片
- Dashboard 看單元分布與熟練度
- 今日複習
- 🔴 不會 / 🟡 練習中 / 🟢 已掌握
- 學生可填「我錯在哪裡」
- PIN 保護 API

## 1. 安裝

```bash
npm install
```

## 2. 設定學生 PIN

請設定一組只有你與學生知道的 PIN：

```bash
npx wrangler secret put APP_PIN
```

例如可輸入：

```text
8274
```

不要把 PIN 寫進程式碼或 Git。

## 3. 第一次部署

```bash
npm run deploy
```

`wrangler.jsonc` 使用 Cloudflare 的自動資源 provisioning；部署時會建立 / 綁定 D1 與 R2。
如果你的帳號或 Dashboard 流程沒有自動建立，請在 Cloudflare Dashboard 手動建立：

- D1 database
- R2 bucket
- Workers AI binding

並把它們分別綁定成：

- `DB`
- `BUCKET`
- `AI`

## 4. 初始化資料庫

部署後打開網站、輸入 PIN。網站第一次呼叫 API 時會自動執行 `CREATE TABLE IF NOT EXISTS`，
所以不需要額外執行 migration。

你也可以手動執行 `schema.sql`：

```bash
npx wrangler d1 execute <你的資料庫名稱> --remote --file=./schema.sql
```

## 5. 本機開發

Workers AI 本機模擬不支援，因此 AI binding 建議用 remote binding 或直接部署測試。

```bash
npm run dev
```

## AI 模型

在 `src/index.js`：

```js
const VISION_MODEL = "@cf/qwen/qwen3.8-27b";
```

想換模型只要改這一行。

## 單元分類

目前內建：

- 多項式函數
- 指數與對數
- 數列與級數
- 排列組合
- 機率
- 三角比與三角函數
- 其他

若學生的教材版本不同，可直接改 `src/index.js` 的 `UNITS` 與 AI prompt。

## 安全提醒

- R2 圖片沒有 public URL，圖片只能經過已驗證 PIN 的 `/api/mistakes/:id/image` 讀取。
- 這是「單一學生、小型家教」版本，不是完整多人會員系統。
- 若未來要給多位學生使用，應改成正式登入、每位學生獨立資料權限。
