/**
 * Tiny i18n. Two languages hardcoded. No runtime locale negotiation — the
 * user toggles with a button in the top bar.
 *
 * Static text: set via `data-i18n="key"` (and `data-i18n-placeholder`,
 *              `data-i18n-aria`, `data-i18n-title`) on elements.
 * Dynamic text: import `t(key)` / `tFormat(key, ...args)` and call at update.
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'fuguang-shimmer.lang';

// Default is Chinese per the product brief.
let currentLang: Lang = 'zh';

const DICT: Record<string, Record<Lang, string>> = {
  // Page
  'doc.title': {
    zh: '浮光 Shimmer — 色彩日记与拼贴编辑器',
    en: 'Shimmer — color diary & collage editor',
  },

  // Top bar
  'file.empty': { zh: '还没有照片', en: 'no photo yet' },
  'btn.reset': { zh: '重置', en: 'Reset' },
  'btn.export': { zh: '导出 PNG', en: 'Export PNG' },

  // Sections
  'section.source': { zh: '01 · 来源', en: '01 · Source' },
  'section.layout': { zh: '02 · 布局', en: '02 · Layout' },
  'section.palette': { zh: '03 · 调色板', en: '03 · Palette' },
  'section.shapes': { zh: '04 · 形状', en: '04 · Shapes' },
  'section.caption': { zh: '05 · 标题', en: '05 · Caption' },

  // Upload zone
  'upload.title': { zh: '拖一张照片进来', en: 'Drop a photo' },
  'upload.hint': {
    zh: '点击、拖拽、或粘贴 (Ctrl+V) · JPG / PNG / WebP',
    en: 'click, drag, or paste (Ctrl+V) · JPG / PNG / WebP',
  },
  'upload.ariaLabel': { zh: '上传照片', en: 'Upload photo' },

  // Layout chips
  'layout.img-top': { zh: '图 / 色', en: 'image / block' },
  'layout.img-bottom': { zh: '色 / 图', en: 'block / image' },
  'layout.img-left': { zh: '图 | 色', en: 'image | block' },
  'layout.img-right': { zh: '色 | 图', en: 'block | image' },

  // Layout hint
  'hint.layout-auto': {
    zh: '上传后会根据照片比例自动选，色块与照片同尺寸',
    en: 'layout auto-picked from photo aspect · color block = photo size',
  },

  // Palette
  'palette.hint.empty': { zh: '先上传一张图', en: 'upload an image first' },
  'palette.hint.extracted': {
    zh: '提取到 {0} 种主色',
    en: '{0} swatches extracted',
  },

  // Shapes
  'shapes.sub': { zh: '创意拼贴', en: 'creative collage' },
  'label.fill-mode': { zh: '填充模式', en: 'Fill mode' },
  'mode.solid': { zh: '实心', en: 'solid' },
  'mode.cutout': { zh: '镂空', en: 'cutout' },
  'label.shape-color': { zh: '形状颜色', en: 'Shape color' },
  'label.shape-size': { zh: '形状大小', en: 'Shape size' },
  'shape.dot': { zh: '圆点', en: 'Dot' },
  'shape.drop': { zh: '水滴', en: 'Drop' },
  'shape.star': { zh: '星星', en: 'Star' },
  'shape.heart': { zh: '爱心', en: 'Heart' },
  'shape.music': { zh: '音符', en: 'Note' },
  'shape.wave': { zh: '波浪', en: 'Wave' },
  'shape.triangle': { zh: '三角', en: 'Triangle' },
  'shape.hex': { zh: '六边形', en: 'Hex' },
  'shape.text': { zh: '文字', en: 'Text' },
  'shape.add': { zh: '添加{0}', en: 'Add {0}' },
  'shape.text.placeholder': {
    zh: '输入文字... 例如 浮光',
    en: 'Type text... e.g. Shimmer',
  },
  'shape.text.add': { zh: '添加文字', en: 'Add text' },
  'shape.selected': {
    zh: '已选中 · 拖动移动 · Delete 删除',
    en: 'selected · drag to move · Delete to remove',
  },
  'btn.scatter': { zh: '撒 8 个', en: 'Scatter 8' },
  'btn.clear': { zh: '清空', en: 'Clear' },

  // Caption
  'caption.toggle': {
    zh: '在色块上显示文字',
    en: 'Show caption on color block',
  },
  'caption.label': { zh: '文字', en: 'Text' },
  'caption.placeholder': {
    zh: '如：mustard, 1:22 pm',
    en: 'e.g. mustard, 1:22 pm',
  },
  'caption.auto': { zh: '自动：{0}', en: 'auto: {0}' },
  'label.font': { zh: '字体', en: 'Font' },

  // Stage
  'stage.empty.title': { zh: '拖一张照片进来，开始你的色彩日记', en: 'Drop a photo to begin your color diary' },
  'stage.empty.hint': {
    zh: '所有处理都在你的浏览器里完成，图片不会上传。',
    en: 'Everything happens in your browser. No upload.',
  },
  'stage.meta.photo': { zh: '照片', en: 'photo' },
  'stage.meta.canvas': { zh: '画布', en: 'canvas' },
  'stage.zoom.in.aria': { zh: '放大预览', en: 'Zoom preview in' },
  'stage.zoom.in.title': {
    zh: '放大（或按住 Ctrl/⌘ 并滚动鼠标滚轮）',
    en: 'Zoom in (or Ctrl/⌘ + scroll wheel)',
  },
  'stage.zoom.out.aria': { zh: '缩小预览', en: 'Zoom preview out' },
  'stage.zoom.out.title': {
    zh: '缩小（或按住 Ctrl/⌘ 并滚动鼠标滚轮）',
    en: 'Zoom out (or Ctrl/⌘ + scroll wheel)',
  },
  'stage.zoom.reset.aria': { zh: '缩放百分比，点击恢复 100%', en: 'Zoom %; click to reset' },
  'stage.zoom.reset.title': {
    zh: '适配以填满预览区。双击可重置为 100%。无滚动条时，可直接滚轮缩放。',
    en: 'Fits the preview. Double-click resets to 100%. Without scrollbars, the wheel alone zooms.',
  },

  // Language toggle
  'lang.label': { zh: '语言', en: 'Lang' },
};

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  applyToDom();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('doc.title');
}

export function initLang(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === 'zh' || saved === 'en') currentLang = saved;
  } catch {
    // ignore
  }
  applyToDom();
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('doc.title');
}

export function t(key: string): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[currentLang];
}

export function tFormat(key: string, ...args: Array<string | number>): string {
  const template = t(key);
  return template.replace(/\{(\d+)\}/g, (_match, idx) => {
    const i = parseInt(idx, 10);
    return args[i] !== undefined ? String(args[i]) : '';
  });
}

/** Walk DOM and write localized text into elements with data-i18n attrs. */
function applyToDom(): void {
  if (typeof document === 'undefined') return;

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder;
    if (key && 'placeholder' in el) {
      (el as HTMLInputElement).placeholder = t(key);
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute('aria-label', t(key));
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle;
    if (key) el.setAttribute('title', t(key));
  }
}

/** Call once per language change so listeners can refresh dynamic strings. */
type Listener = (lang: Lang) => void;
const listeners = new Set<Listener>();

export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLangChange(): void {
  for (const fn of listeners) fn(currentLang);
}
