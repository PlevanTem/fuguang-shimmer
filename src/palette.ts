/**
 * Main-color extraction via median-cut, plus English color-name matching.
 * Pure functions, synchronous. Fast enough for a 100×100 downsample on main thread.
 */

type RGB = [number, number, number];

/* -----------------------------------------------------------------------------
   Median-cut palette extraction
   ----------------------------------------------------------------------------- */

export function extractPalette(
  img: HTMLImageElement,
  k = 5,
  sampleSize = 100
): string[] {
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 128) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    // Skip near-black / near-white pixels to avoid dominating the palette.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 20) continue;
    if (min > 240 && max - min < 12) continue;
    pixels.push([r, g, b]);
  }
  if (pixels.length === 0) return [];

  let buckets: RGB[][] = [pixels];
  while (buckets.length < k) {
    let targetIdx = -1;
    let targetRange = -1;
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (!bucket || bucket.length < 2) continue;
      const r = channelRange(bucket);
      if (r > targetRange) {
        targetRange = r;
        targetIdx = i;
      }
    }
    if (targetIdx === -1) break;
    const bucket = buckets[targetIdx]!;
    const channel = dominantChannel(bucket);
    bucket.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(bucket.length / 2);
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    buckets = [
      ...buckets.slice(0, targetIdx),
      left,
      right,
      ...buckets.slice(targetIdx + 1),
    ];
  }

  const avgs = buckets
    .filter((b) => b.length > 0)
    .map((bucket) => averageColor(bucket));

  // Sort by bucket size (larger buckets → more dominant → first)
  avgs.sort((a, b) => b.count - a.count);

  return avgs.map(({ rgb }) => rgbToHex(rgb));
}

function channelRange(bucket: RGB[]): number {
  let rMin = 255;
  let rMax = 0;
  let gMin = 255;
  let gMax = 0;
  let bMin = 255;
  let bMax = 0;
  for (const [r, g, b] of bucket) {
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  return Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
}

function dominantChannel(bucket: RGB[]): 0 | 1 | 2 {
  let rMin = 255;
  let rMax = 0;
  let gMin = 255;
  let gMax = 0;
  let bMin = 255;
  let bMax = 0;
  for (const [r, g, b] of bucket) {
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  const rR = rMax - rMin;
  const gR = gMax - gMin;
  const bR = bMax - bMin;
  if (rR >= gR && rR >= bR) return 0;
  if (gR >= bR) return 1;
  return 2;
}

function averageColor(bucket: RGB[]): { rgb: RGB; count: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [rr, gg, bb] of bucket) {
    r += rr;
    g += gg;
    b += bb;
  }
  const n = bucket.length;
  return {
    rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    count: n,
  };
}

/* -----------------------------------------------------------------------------
   Hex ↔ RGB helpers
   ----------------------------------------------------------------------------- */

export function rgbToHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Pick white or black ink that contrasts best with the given hex. */
export function contrastInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111111' : '#FFFFFF';
}

/* -----------------------------------------------------------------------------
   Color name dictionary — nearest-neighbor in RGB space.
   Curated ~70 words picked for aesthetic range, not technical precision.
   ----------------------------------------------------------------------------- */

const COLOR_NAMES: ReadonlyArray<{ name: string; rgb: RGB }> = [
  { name: 'ivory', rgb: [255, 250, 240] },
  { name: 'cream', rgb: [245, 235, 210] },
  { name: 'bone', rgb: [227, 218, 201] },
  { name: 'linen', rgb: [240, 232, 220] },
  { name: 'sand', rgb: [222, 198, 165] },
  { name: 'oat', rgb: [212, 196, 168] },
  { name: 'stone', rgb: [170, 164, 154] },
  { name: 'ash', rgb: [179, 179, 179] },
  { name: 'smoke', rgb: [130, 130, 130] },
  { name: 'charcoal', rgb: [60, 60, 60] },
  { name: 'onyx', rgb: [20, 20, 20] },
  { name: 'pearl', rgb: [234, 224, 200] },
  { name: 'taupe', rgb: [150, 130, 120] },
  { name: 'mushroom', rgb: [180, 165, 140] },
  { name: 'clay', rgb: [190, 130, 100] },
  { name: 'terracotta', rgb: [204, 78, 92] },
  { name: 'brick', rgb: [150, 52, 47] },
  { name: 'rust', rgb: [183, 65, 14] },
  { name: 'cinnamon', rgb: [160, 82, 45] },
  { name: 'amber', rgb: [230, 150, 60] },
  { name: 'mustard', rgb: [230, 180, 34] },
  { name: 'marigold', rgb: [234, 162, 33] },
  { name: 'lemon', rgb: [255, 244, 79] },
  { name: 'honey', rgb: [235, 190, 80] },
  { name: 'butter', rgb: [250, 230, 150] },
  { name: 'chartreuse', rgb: [206, 222, 0] },
  { name: 'lime', rgb: [194, 224, 50] },
  { name: 'olive', rgb: [128, 128, 0] },
  { name: 'matcha', rgb: [180, 210, 120] },
  { name: 'sage', rgb: [159, 178, 138] },
  { name: 'moss', rgb: [139, 154, 90] },
  { name: 'fern', rgb: [79, 121, 66] },
  { name: 'forest', rgb: [34, 95, 58] },
  { name: 'emerald', rgb: [46, 139, 87] },
  { name: 'mint', rgb: [175, 225, 193] },
  { name: 'pistachio', rgb: [195, 216, 137] },
  { name: 'teal', rgb: [0, 128, 128] },
  { name: 'seafoam', rgb: [168, 213, 186] },
  { name: 'sky', rgb: [135, 206, 235] },
  { name: 'powder', rgb: [186, 207, 221] },
  { name: 'denim', rgb: [96, 130, 170] },
  { name: 'cobalt', rgb: [74, 107, 175] },
  { name: 'cerulean', rgb: [42, 82, 190] },
  { name: 'indigo', rgb: [75, 0, 130] },
  { name: 'navy', rgb: [28, 40, 79] },
  { name: 'periwinkle', rgb: [204, 204, 255] },
  { name: 'lavender', rgb: [180, 155, 208] },
  { name: 'lilac', rgb: [200, 162, 200] },
  { name: 'plum', rgb: [142, 69, 133] },
  { name: 'mauve', rgb: [176, 133, 146] },
  { name: 'orchid', rgb: [218, 112, 214] },
  { name: 'blush', rgb: [230, 198, 201] },
  { name: 'pink', rgb: [234, 178, 189] },
  { name: 'rose', rgb: [216, 139, 149] },
  { name: 'dusty pink', rgb: [216, 167, 161] },
  { name: 'coral', rgb: [240, 128, 120] },
  { name: 'peach', rgb: [255, 201, 173] },
  { name: 'apricot', rgb: [251, 206, 177] },
  { name: 'tangerine', rgb: [242, 133, 0] },
  { name: 'papaya', rgb: [255, 218, 185] },
  { name: 'ruby', rgb: [155, 17, 30] },
  { name: 'crimson', rgb: [220, 20, 60] },
  { name: 'bordeaux', rgb: [110, 40, 50] },
  { name: 'mahogany', rgb: [100, 50, 40] },
  { name: 'espresso', rgb: [65, 40, 30] },
  { name: 'sepia', rgb: [112, 66, 20] },
  { name: 'khaki', rgb: [189, 183, 107] },
  { name: 'bronze', rgb: [205, 127, 50] },
  { name: 'gold', rgb: [212, 175, 55] },
  { name: 'silver', rgb: [192, 192, 192] },
  { name: 'slate', rgb: [112, 128, 144] },
  { name: 'steel', rgb: [70, 130, 180] },
  { name: 'cloud', rgb: [225, 230, 235] },
  { name: 'snow', rgb: [250, 250, 250] },
];

export function nearestColorName(hex: string): string {
  const target = hexToRgb(hex);
  let bestName = 'color';
  let bestDist = Infinity;
  for (const { name, rgb } of COLOR_NAMES) {
    const dr = target[0] - rgb[0];
    const dg = target[1] - rgb[1];
    const db = target[2] - rgb[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      bestName = name;
    }
  }
  return bestName;
}

/** Formats `hh:mm a` using the 12-hour clock, e.g. "1:22 pm" — lowercase per DNA. */
export function formatTimestamp(date = new Date()): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
}

/** The auto caption: `<color-name>, <h:mm a>` — the "yellow, 13:22PM" effect. */
export function buildAutoCaption(hex: string, date = new Date()): string {
  return `${nearestColorName(hex)}, ${formatTimestamp(date)}`;
}
