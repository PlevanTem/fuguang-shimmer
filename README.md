# 浮光 · Shimmer

> *A shimmer of color, captured in a moment.*  
> 一缕浮光，一段心情。用色彩记录生活的瞬时感动。

**Shimmer** 是浏览器端（Web Canvas）的小众美学创意图片设计工具，围绕「色彩」与「拼贴」：上传一张照片，自动识别主色，与色块拼接成图；支持实心/镂空形状与文字装饰。  
100% 在本地浏览器处理，**不上传图片**。

**两条玩法**：

1. **色块拼接** — 上传 → 主色板 → 图+色双段布局 → 自动时间色彩文案（`taupe, 12:09 am` 风格） → 支持文案修改。
2. **创意拼贴** — 波点P图，在色块上叠加/镂空圆点、水滴、爱心、星形、文字等（`solid` / `cutout`）。

## 演示视频

<video src="video.mp4" controls playsinline width="100%" style="max-width: 720px; border-radius: 8px;"></video>

若浏览器 / GitHub 不内嵌播放，可 [直接打开或下载 `video.mp4`](./video.mp4)。

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