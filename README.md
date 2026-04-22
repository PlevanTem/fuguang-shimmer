# 浮光 · Shimmer

> *A shimmer of color, captured in a moment.*  
> 一缕浮光，一段心情。用色彩记录生活的瞬时感动。

**Shimmer** 是浏览器端（Web Canvas）的小众美学创意图片设计工具，围绕「色彩」与「拼贴」：上传一张照片，自动识别主色，与色块拼接成图；支持实心/镂空形状与文字装饰。  
100% 在本地浏览器处理，**不上传图片**。

- **产品需求 / 路线图**：见 [`docs/PRD.md`](./docs/PRD.md)（v0.1 草案）  
- **NPM 包名**：`fuguang-shimmer`（与仓库名可一致，便于部署子路径 `VITE_BASE`）

**两条玩法**（对应 PRD 与 colour-walk 类内容）：

1. **色块拼接** — 上传 → 主色板 → 图+色双段布局 → 自动标题（`taupe, 12:09 am` 风格）。
2. **创意拼贴** — 在色块上叠加/镂空圆点、水滴、爱心、星形、文字等（`solid` / `cutout`）。

## Stack

- Vite 5 + TypeScript 5（严格）— 原生 DOM，无框架
- Canvas 2D 合成；调色板中位切分提取
- Google Fonts：`DM Serif Display`、`Inter`、`JetBrains Mono`
- 无运行时依赖

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + bundle → ./dist
npm run preview   # 本地预览生产包
npm run typecheck
```

## 项目结构

```
.
├── .github/workflows/deploy.yml   # GitHub Actions → Pages
├── docs/PRD.md                    # 产品需求文档
├── index.html
├── public/favicon.svg
├── src/
│   ├── main.ts
│   ├── i18n.ts
│   ├── style.css
│   ├── state.ts
│   ├── types.ts
│   ├── palette.ts
│   ├── shapes.ts
│   └── render.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 部署到 GitHub Pages

**只 push 代码不会自动出现可访问网站**，必须在仓库里把 Pages 指到本仓库的 GitHub Actions（见下）。工作流在 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)，推送 `main` 或手动 **Run workflow** 会执行 `npm ci` + `npm run build`（`VITE_BASE=/<仓库名>/`），再发布 `dist/`。

### 首次上线（必做一次）

1. 打开仓库 **Settings** → 左侧 **Pages**。
2. **Build and deployment** 里 **Source** 选 **GitHub Actions**（不要选 “Deploy from a branch”）。保存即可。
3. 推送到 `main`，或到 **Actions** 打开 **Deploy to GitHub Pages** → 选最新运行；若需重跑，点 **Re-run all jobs**。
4. 等该 workflow 变绿后，在 **Settings → Pages** 顶部会显示 **Visit site** 的地址，一般为：  
   `https://<你的用户名>.github.io/<仓库名>/`  
   本仓库示例： [https://plevantem.github.io/fuguang-shimmer/](https://plevantem.github.io/fuguang-shimmer/)（以 Settings 里实际地址为准）

若 **Actions 里 build 失败**，在对应 run 里查看日志（常见：依赖未锁好则本地执行 `npm ci` 试一次）。

其他静态托管（Vercel / Netlify / Cloudflare Pages）使用默认 `base: './'`，直接发布 `dist/` 即可。

## 快捷操作

- **上传**：点击上传区、拖入左栏/画板、或从剪贴板粘贴图片（Ctrl/Cmd + V）
- **导出 PNG**：顶栏 — 高分辨率输出（见 `main.ts` 中 `scaleLayoutToMaxEdge`）
- **重置**：保留照片，清空形状与部分选项

## Roadmap

与 `docs/PRD.md` 里程碑一致：M1 当前 MVP、M2 拼贴深化、M3 GIF、M4 模板与分享等。
