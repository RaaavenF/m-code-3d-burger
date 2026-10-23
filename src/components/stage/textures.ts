'use client';

import * as THREE from 'three';

/**
 * 程序化纹理
 *
 * 为什么不用贴图文件：
 *  1. 不引入任何外部资产，仓库干净、首屏无额外请求；
 *  2. Canvas 生成的噪声图很快（256² < 4ms），显存占用可忽略；
 *  3. 改一个参数就能换质感（颗粒密度、焦斑大小），不用重新导图。
 *
 * 两类纹理：
 *  - grainTexture()   ：灰度噪声，用作 bumpMap，只改法线不改颜色
 *  - speckleTexture() ：带颜色的斑点，用作 map + bumpMap，
 *                       面包的烤色、肉排的焦斑、脆衣的面包糠全靠它。
 *                       只靠 bump 的食材永远是一块「上过漆的橡皮」。
 */

const cache = new Map<string, THREE.Texture>();

/** 确定性随机，保证同一食材每次渲染的纹理一致（截图可复现） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export type GrainKind = 'fine' | 'coarse' | 'char' | 'leaf' | 'none';

interface GrainSpec {
  /** 基础灰阶 */
  base: number;
  /** 噪点数量 */
  dots: number;
  /** 单个斑点半径范围 */
  size: [number, number];
  /** 明暗幅度 */
  contrast: number;
  /** 重复次数 */
  repeat: number;
}

const SPECS: Record<Exclude<GrainKind, 'none'>, GrainSpec> = {
  // 面包表皮：细密气孔
  fine: { base: 132, dots: 1400, size: [0.6, 1.8], contrast: 46, repeat: 3 },
  // 肉排：粗颗粒 + 焦边
  coarse: { base: 120, dots: 900, size: [1.4, 4.2], contrast: 74, repeat: 2 },
  // 脆衣：大块深色焦斑
  char: { base: 128, dots: 420, size: [2.2, 7.0], contrast: 96, repeat: 2 },
  // 叶菜：细长脉络
  leaf: { base: 140, dots: 260, size: [0.8, 2.2], contrast: 38, repeat: 4 },
};

export function grainTexture(kind: GrainKind): THREE.Texture | null {
  if (kind === 'none') return null;

  const hit = cache.get(kind);
  if (hit) return hit;

  const spec = SPECS[kind];
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = `rgb(${spec.base},${spec.base},${spec.base})`;
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(kind.length * 977 + spec.dots);

  for (let i = 0; i < spec.dots; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = spec.size[0] + rand() * (spec.size[1] - spec.size[0]);
    const dir = rand() > 0.5 ? 1 : -1;
    const v = Math.max(
      0,
      Math.min(255, spec.base + dir * spec.contrast * (0.35 + rand() * 0.65)),
    );
    ctx.fillStyle = `rgba(${v},${v},${v},${0.35 + rand() * 0.5})`;
    ctx.beginPath();

    if (kind === 'leaf') {
      // 叶脉：细长的椭圆
      ctx.ellipse(x, y, r * 3.4, r * 0.7, rand() * Math.PI, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(spec.repeat, spec.repeat);
  texture.anisotropy = 4;
  // bumpMap 是数据贴图，不能按 sRGB 解码
  texture.colorSpace = THREE.NoColorSpace;

  cache.set(kind, texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 彩色斑点：烤色 / 焦斑 / 面包糠
 *
 * 纯色 + bump 只能做出「橘黄色的橡皮」。真实的食物表面是
 * 「一堆相近但不同的颜色挤在一起」—— 面包有深浅不一的烤斑，
 * 肉排有焦黑点，脆衣有金黄到深褐的颗粒。所以必须上 map。
 * ═══════════════════════════════════════════════════════════ */

export type SpeckKind =
  | 'bunTop'
  | 'bunBottom'
  | 'crumb'
  | 'beef'
  | 'grilled'
  | 'spicy'
  | 'fish'
  | 'crispy'
  | 'hash'
  | 'onion'
  | 'cheese';

interface SpeckSpec {
  base: string;
  specks: string[];
  count: number;
  dot: [number, number];
  repeat: number;
  /** 大块色斑的数量（斑驳感来自大斑，不来自细点） */
  blotches?: number;
  blotchDot?: [number, number];
}

/**
 * ⚠️ 大块斑驳（blotches）只给「平面 UV」用
 *
 * 旋转体（面包、肉排、脆衣、薯饼）的 UV 是柱面展开的：u 绕一圈、v 顺着轮廓。
 * 一到圆顶的极点，所有 u 都挤到同一个像素上 —— 大色斑在那一圈被拉成
 * 放射状的刷痕，看起来像谁拿刷子从顶上刷下来了。这就是之前面包顶上
 * 「一圈圈放射纹」的真正原因，不是光照也不是 bump。
 *
 * 所以柱面展开的那几个材质把 blotches 关掉，只留高频细点：
 * 细点在极点被平均掉，读起来只是「颗粒」，不会变成纹路。
 * 大块色差改由顶点色承担（bakeVerticalGradient / bakeRadialGradient）。
 */
const SPECK_SPECS: Record<SpeckKind, SpeckSpec> = {
  // 上层面包：烤得最深，金黄到焦糖。
  // 带一点大块斑驳 —— 顶面是平面投影，不会在极点拉成刷痕，
  // 这几块深浅不一的「烤斑」正是面包不像饼干的关键。
  bunTop: {
    base: '#E0A05A',
    specks: ['#D18E42', '#EFB673', '#C8813A', '#F3C083', '#B9742C'],
    count: 2200,
    dot: [0.8, 2.6],
    repeat: 3,
    blotches: 18,
    blotchDot: [14, 46],
  },
  // 下层面包：受热少，偏浅
  bunBottom: {
    base: '#D29243',
    specks: ['#C07F31', '#E5AE67', '#AE6C24', '#F0C386'],
    count: 2200,
    dot: [0.7, 2.6],
    repeat: 3,
  },
  // 切面瓤：下层面包被切开的那一面。
  //
  // ⚠️ 这一张是**唯一**贴在平面上的 speck 贴图，所以它必须反过来处理两件事：
  //
  //  1. `repeat` 从 3 降到 **1**。切面是一张直径 ~1.7 单位的圆片，
  //     在 1080p 下约占 380px；贴图 256px 再乘 3，一个像素铺不到半个屏幕像素，
  //     所有气孔都被 mipmap 平均掉了 —— 这正是上一版「像盖了一层奶油」的真凶：
  //     没有孔，就只剩一块均匀的浅色。
  //     改成 1 次之后，一个贴图像素 ≈ 1.5 屏幕像素，气孔才读得出来。
  //
  //  2. 底色从 #F2D6A6 换成 #E8D0AC。旧值色相 37°、饱和 32%、明度 95%，
  //     在暖光下被推到头，读成「黄油/奶油」；但也不能一压到底 ——
  //     试过 #E7BF86，饱和一高，在暖光里整块瓤直接变琥珀色，像一块松饼。
  //     面包瓤是「低饱和的暖米色」：明度比外皮高一档，饱和度反而比外皮低。
  //
  //  3. 细点里**只能有一个**浅色。原来 5 个色值里 2 个接近白（#FBEDD2 / #FFF6E4），
  //     按均匀分布取色时有 40% 的气孔是亮的，放大看像一层白疹子。
  //     真实的气孔是**阴影**：绝大多数偏暗，只有极少数（气孔壁的高点）是亮的。
  crumb: {
    base: '#E8D0AC',
    specks: ['#CFAC80', '#C39C6C', '#DCC4A0', '#F5E8CE', '#BB905F'],
    count: 3600,
    dot: [0.8, 2.4],
    repeat: 1,
    // 瓤里的气泡不是一个模子：十几块边界模糊的大孔 + 密到看不清的细孔，
    // 才是「发起来的面」而不是「压过的砂纸」。UV 是平的，大斑不会被拉成刷痕。
    blotches: 30,
    blotchDot: [7, 24],
  },
  // 牛肉排：中褐带红调 + 焦黑点。
  //  · 底色从 #74431F 提亮到 #86492A —— 上一版在暖光下整块发暗，
  //    像一块巧克力饼干，而不是煎过的牛肉
  //  · 细点放大、数量减少：3600 颗 1px 的点是「砂纸」，
  //    1300 颗 2–5px 的点才是「绞肉的粗颗粒」
  beef: {
    base: '#8C5230',
    specks: ['#7C4423', '#9E5E36', '#6A3A1C', '#AC6C41', '#5A2F17'],
    count: 2100,
    dot: [1.2, 3.6],
    repeat: 3,
    // 大斑要「小、少、淡」：上一版 30 块 6–22px 的深斑按 cc 铺满，
    // 整块肉长出了一身豹纹，像一块撒了巧克力豆的饼干
    blotches: 12,
    blotchDot: [4, 12],
  },
  // 板烧：没有面衣，表面是「铁板上的油光 + 焦斑」。
  // 比牛肉浅一档、也更暖，否则两个深褐色的饼在汉堡里分不出来。
  // ⚠️ 上一版在 specks 里放了 #D8AA6E 这种浅色，满屏的亮点点
  //    在渲染后读成「撒了糖霜的饼干」—— 板烧是咸的，不能有白点。
  grilled: {
    base: '#AB6C2C',
    specks: ['#8E5420', '#C98A3F', '#74421A', '#B87933'],
    count: 1500,
    dot: [1.4, 4.2],
    repeat: 2,
    blotches: 26,
    blotchDot: [10, 32],
  },
  // 麦辣鸡腿排：深红棕的辣味面衣，混着辣椒碎（暗红细点）
  spicy: {
    base: '#A5501C',
    specks: ['#8C3E12', '#C06B2E', '#6F2A08', '#D0803C', '#8E1F0C'],
    count: 1300,
    dot: [2.0, 5.6],
    repeat: 3,
    blotches: 26,
    blotchDot: [8, 24],
  },
  // 鳕鱼排：浅金面衣（比鸡排浅两档），底下的雪白鱼肉从裂缝里透出来。
  // ⚠️ 白斑要「大而少、边缘糊」：
  //    上一版 800 颗 2–7px 的亮白圆点均匀铺满，远看是一块
  //    「撒了白巧碎的饼干」。真实的鱼肉是从面衣的裂缝里**透**出来的，
  //    是几片边界模糊的斑，不是圆点。
  fish: {
    base: '#D8A659',
    specks: ['#C8944A', '#EBCE9B', '#B07C34', '#F2E2C2'],
    count: 240,
    dot: [3.0, 10.0],
    repeat: 2,
    blotches: 26,
    blotchDot: [12, 40],
  },
  // 脆衣：金黄颗粒 + 深褐焦块。
  // 上一版 #C98733 太浅、太灰，炸鸡在渲染里像一块全麦苏打饼。
  // 细点也收成「大而少」：2800 颗 1px 的点在 60% 缩放下糊成一层噪波，
  // 反而是 1200 颗 2–6px 的碎壳读得出「裹粉」。
  crispy: {
    base: '#B0671A',
    specks: ['#98540F', '#D39338', '#7C4007', '#E2AC55', '#5F2E04'],
    count: 1200,
    dot: [2.0, 6.0],
    repeat: 3,
    blotches: 30,
    blotchDot: [10, 32],
  },
  // 薯饼：偏干的浅褐，焦斑要多 —— 薯饼是「煎」出来的，
  // 表面一块块深色的焦脆区是它最好认的特征
  hash: {
    base: '#A96A1E',
    specks: ['#8B5212', '#C68B3C', '#6E3E08', '#DCA954'],
    count: 2400,
    dot: [1.4, 4.2],
    repeat: 3,
    blotches: 30,
    blotchDot: [8, 30],
  },
  // 洋葱片：暖乳白带极淡的赭，只放一点厚薄差 ——
  // 洋葱的层次交给几何的顶点色（内缘乳白、外缘暖褐）。
  // 底色原来是 #F7EDF0（冷粉白），在暖光下整体灰度比周围低一档，
  // 看着像一块没烤过的瓷片；换成暖乳白之后它才和面包、酱料同处一个色温。
  onion: {
    base: '#F8EDDA',
    specks: ['#EEDCC0', '#FFFAEC', '#E2C6A6', '#FFFDF4'],
    count: 1500,
    dot: [0.7, 2.2],
    repeat: 2,
    blotches: 16,
    blotchDot: [14, 40],
  },
  // 芝士：**近白**的低对比斑驳。
  //
  // 这里不能放橙黄：品类色由几何上的顶点色给（中心 → 边缘的橙黄渐变），
  // 贴图在 material 里是和顶点色**相乘**的，底色一旦带颜色，
  // 相乘的结果会暗两档 —— 上一版 #EDA322 的贴图叠上去，
  // 芝士直接变成一块深芥末。
  //
  // 现在只让它在 ±4% 的明度上做斑驳：真实吉士片的表面是微起皱、
  // 有小气泡的，完全均质的一片橙就是塑料。对比压到这么低，
  // 远看只是「表面有一点点不平」，不会变成撒了碎屑的饼干。
  cheese: {
    base: '#FFFAEE',
    specks: ['#FFF4DE', '#FFFFFF', '#FDEBCE', '#FFFDF8'],
    count: 900,
    dot: [1.4, 4.4],
    repeat: 2,
    blotches: 30,
    blotchDot: [10, 34],
  },
};

/**
 * 把「底色 + 大斑 + 细点」三层画进任意 canvas。
 * speckleTexture 与 grillTexture 共用，保证焦带底下是同一套肉底。
 */
function drawSpeckField(
  ctx: CanvasRenderingContext2D,
  size: number,
  spec: SpeckSpec,
  seed: number,
) {
  const rand = mulberry32(seed);

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, size, size);

  // ① 大块斑驳：低透明度叠几层，做出「烤色不均」
  const bl = spec.blotches ?? 0;
  for (let i = 0; i < bl; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r =
      (spec.blotchDot?.[0] ?? 10) +
      rand() * ((spec.blotchDot?.[1] ?? 30) - (spec.blotchDot?.[0] ?? 10));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = spec.specks[(rand() * spec.specks.length) | 0];
    g.addColorStop(0, `${col}${'cc'}`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ② 细点：颗粒感
  for (let i = 0; i < spec.count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = spec.dot[0] + rand() * (spec.dot[1] - spec.dot[0]);
    ctx.fillStyle = spec.specks[(rand() * spec.specks.length) | 0];
    ctx.globalAlpha = 0.28 + rand() * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function speckleTexture(kind: SpeckKind): THREE.Texture | null {
  const hit = cache.get(`speck:${kind}`);
  if (hit) return hit;

  const spec = SPECK_SPECS[kind];
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawSpeckField(ctx, size, spec, kind.length * 7919 + spec.count);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(spec.repeat, spec.repeat);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;

  cache.set(`speck:${kind}`, texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 炙烤纹 / 铁板压痕
 *
 * 牛肉饼是「被铁网压出来的细焦痕」，板烧是「铁板烫出来的宽焦印」。
 * 之前用三条细长的 BoxGeometry 横在肉饼顶上 —— 顶面是微拱的，
 * 那三片平板必然有一头浮空，看起来像贴了三道黑胶带。
 *
 * 贴图天然贴合曲面，且「每一条都有粗细变化、边缘被烫糊」这件事
 * 只能画出来。UV 走顶视投影，贴图里水平的带子正好对应世界里的
 * 横向焦痕，一次成型、不增加 draw call。
 * ═══════════════════════════════════════════════════════════ */

interface GrillBand {
  /** 在贴图里的纵向位置 0–1 */
  v: number;
  /** 带宽（占画幅比例） */
  w: number;
  /** 最深处的浓度 */
  a: number;
  ph: number;
}

const GRILL_BANDS: Record<'beef' | 'grilled', GrillBand[]> = {
  // 牛肉的焦带要细、要淡：它是「烤盘的压痕」，不是黑条纹。
  // 上一版 alpha 0.62、宽 6%，三条一叠把整块肉压成了深褐色，
  // 再配上深色细点，整块读起来是一块巧克力饼干。
  beef: [
    { v: 0.3, w: 0.05, a: 0.55, ph: 0.4 },
    { v: 0.52, w: 0.058, a: 0.58, ph: 2.6 },
    { v: 0.74, w: 0.048, a: 0.52, ph: 4.7 },
  ],
  grilled: [
    { v: 0.18, w: 0.085, a: 0.52, ph: 1.1 },
    { v: 0.43, w: 0.095, a: 0.56, ph: 3.3 },
    { v: 0.68, w: 0.082, a: 0.52, ph: 5.4 },
    { v: 0.88, w: 0.07, a: 0.46, ph: 0.9 },
  ],
};

export function grillTexture(variant: 'beef' | 'grilled' = 'beef'): THREE.Texture | null {
  const key = `grill:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 256;
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawSpeckField(ctx, S, SPECK_SPECS[variant], variant === 'beef' ? 6113 : 7331);

  // 焦带：先做模糊再画，边缘才是「被烫糊」而不是一条硬边
  ctx.save();
  ctx.filter = 'blur(5px)';
  for (const b of GRILL_BANDS[variant]) {
    for (let x = 0; x <= S; x += 8) {
      const u = x / S;
      const cy = (b.v + Math.sin(u * Math.PI * 2 * 1.3 + b.ph) * 0.014) * S;
      const half = (b.w * S * 0.5) * (0.78 + 0.34 * Math.sin(u * Math.PI * 2 * 0.9 + b.ph * 2));
      ctx.fillStyle = `rgba(38,17,5,${b.a})`;
      ctx.fillRect(x, cy - half, 9, half * 2);
    }
  }
  ctx.restore();

  // 焦带两侧的油光：真实烤肉在焦痕旁边会反出一圈亮边
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = 'blur(6px)';
  for (const b of GRILL_BANDS[variant]) {
    const cy = b.v * S;
    ctx.fillStyle = 'rgba(120,72,28,0.28)';
    ctx.fillRect(0, cy - b.w * S * 1.15, S, b.w * S * 0.42);
    ctx.fillRect(0, cy + b.w * S * 0.7, S, b.w * S * 0.42);
  }
  ctx.restore();

  // 牛肉饼的焦边：贴图最下面那一条正好被侧壁的柱面 UV 采到
  // （侧壁 v = y / size，只落在底部 10% 里）。
  // 之前用一圈 Torus 假装焦边，半径比饼还小，整个埋在肉里 —— 从外面
  // 根本看不见，难怪肉排一直像块光板。
  if (variant === 'beef') {
    const edge = ctx.createLinearGradient(0, 0, 0, S * 0.14);
    edge.addColorStop(0, 'rgba(38,18,6,0.55)');
    edge.addColorStop(0.55, 'rgba(52,26,10,0.3)');
    edge.addColorStop(1, 'rgba(52,26,10,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, S, S * 0.14);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // repeat 1：焦痕要「一共三条」，铺满整块肉饼就是二十几条了
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;

  cache.set(key, texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 培根：脂肪的走向
 *
 * 单色的砖红薄板不管怎么弯都是「一块硬纸板」。培根的可辨识度几乎
 * 全部来自那条**沿长度方向走的脂肪纹** —— 深红的瘦肉里夹着几条
 * 奶白的肥边，边缘煎到卷起来发焦。
 * 贴图横向（U）是长度、纵向（V）是宽度，所以脂肪纹是几条沿 U 走的
 * 波浪带，而不是斑点。
 * ═══════════════════════════════════════════════════════════ */

/** 三种脂肪走向。三条培根必须各用一套，否则三条上的纹路
 *  一模一样，会像三片同一张印花塑料 */
const BACON_BANDS: { v: number; w: number; amp: number; ph: number }[][] = [
  [
    { v: 0.24, w: 0.052, amp: 0.042, ph: 0.4 },
    { v: 0.53, w: 0.038, amp: 0.05, ph: 2.1 },
    { v: 0.79, w: 0.06, amp: 0.038, ph: 5.2 },
  ],
  [
    { v: 0.16, w: 0.06, amp: 0.04, ph: 1.3 },
    { v: 0.44, w: 0.034, amp: 0.055, ph: 3.9 },
    { v: 0.72, w: 0.05, amp: 0.045, ph: 4.6 },
  ],
  [
    { v: 0.2, w: 0.045, amp: 0.05, ph: 5.7 },
    { v: 0.5, w: 0.058, amp: 0.042, ph: 1.9 },
    { v: 0.77, w: 0.036, amp: 0.048, ph: 3.1 },
  ],
];

export function baconTexture(variant = 0): THREE.Texture | null {
  const hit = cache.get(`bacon${variant}`);
  if (hit) return hit;

  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rand = mulberry32(8181 + variant * 137);
  const bands = BACON_BANDS[variant % BACON_BANDS.length];

  // 瘦肉底：煎过的培根是琥珀褐，不是鲜红。
  // 之前用 #8B3320 配 #F7E1CA 的奶白脂肪带，对比过强、色调偏粉，
  // 整条读出来是「火腿片」——真实培根的肉和脂肪只差两个明度级。
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#9C3F1D');
  bg.addColorStop(0.5, '#B05228');
  bg.addColorStop(1, '#9C3F1D');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 肌纤维：沿长度方向的极细亮线，打散大块纯色
  ctx.beginPath();
  for (let i = 0; i < 150; i++) {
    const y = rand() * H;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + (rand() - 0.5) * 6);
  }
  ctx.strokeStyle = 'rgba(226,144,84,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  for (const b of bands) {
    // 两条正弦叠起来：只有一条时脂肪纹是标准波浪，一看就是画上去的；
    // 宽度也跟着 u 变，末端才会自然地散开
    const centerY = (u: number) =>
      (b.v +
        Math.sin(u * Math.PI * 2 * 1.7 + b.ph) * b.amp +
        Math.sin(u * Math.PI * 2 * 4.3 + b.ph * 1.7) * b.amp * 0.45) *
      H;
    const halfW = (u: number) => b.w * (0.62 + 0.5 * Math.sin(u * Math.PI * 2 * 2.1 + b.ph * 2.3)) * H * 0.5;

    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) ctx.lineTo(x, centerY(x / W) - halfW(x / W));
    for (let x = W; x >= 0; x -= 3) ctx.lineTo(x, centerY(x / W) + halfW(x / W));
    ctx.closePath();

    const fg = ctx.createLinearGradient(0, 0, 0, H);
    fg.addColorStop(0, '#E4C29C');
    fg.addColorStop(0.5, '#F2DBBC');
    fg.addColorStop(1, '#DEB993');
    ctx.fillStyle = fg;
    ctx.fill();
  }

  // 煎过的焦边：上下两条，越靠边越黑
  const edgeTop = ctx.createLinearGradient(0, 0, 0, H * 0.16);
  edgeTop.addColorStop(0, 'rgba(54,20,10,0.36)');
  edgeTop.addColorStop(1, 'rgba(48,18,10,0)');
  ctx.fillStyle = edgeTop;
  ctx.fillRect(0, 0, W, H * 0.16);
  const edgeBot = ctx.createLinearGradient(0, H, 0, H * 0.84);
  edgeBot.addColorStop(0, 'rgba(54,20,10,0.36)');
  edgeBot.addColorStop(1, 'rgba(48,18,10,0)');
  ctx.fillStyle = edgeBot;
  ctx.fillRect(0, H * 0.84, W, H * 0.16);

  // 脆皮的深色点
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = rand() > 0.55 ? 'rgba(64,26,14,0.5)' : 'rgba(160,72,40,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cache.set(`bacon${variant}`, texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 生菜叶脉
 *
 * 上一版是「11 条从圆心放射出的主脉 + 亮筋描边」，叠在整片圆叶上，
 * 圆心那一块就变成一枚星芒徽章 —— 远看像荷叶，不像生菜。
 *
 * 真实生菜的信号不在「放射」，在「皱」：叶面本身是起伏的、
 * 主脉是软的、叶缘有一圈更深的色。所以这版：
 *  - 主脉只留很浅的一道，从中心 25% 半径才开始画，圆心留白
 *  - 叶脉整体透明度压到 0.1 上下，靠几何的皱褶去带光影
 *  - 加一层低频斑驳 + 一层高频细点，叶面才有「活的」质感
 * ═══════════════════════════════════════════════════════════ */

export function leafTexture(): THREE.Texture | null {
  const hit = cache.get('leafVein');
  if (hit) return hit;

  const S = 512;
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = S / 2;
  const cy = S / 2;
  const PI = Math.PI;
  const rand = mulberry32(4242);

  // 底色：新鲜罗马生菜的黄绿，中心略亮
  // 饱和度要给足 —— 高曝光 + ACES 色调映射会把浅绿洗成一层灰薄荷
  const bg = ctx.createRadialGradient(cx, cy, S * 0.02, cx, cy, S * 0.52);
  bg.addColorStop(0, '#A9DC62');
  bg.addColorStop(0.45, '#93CF4C');
  bg.addColorStop(0.85, '#77BB35');
  bg.addColorStop(1, '#5C9C24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // ① 低频斑驳：像一片片薄厚不同的叶肉
  for (let i = 0; i < 70; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 20 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.45;
    g.addColorStop(0, light ? 'rgba(212,240,168,0.20)' : 'rgba(96,150,54,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI * 2);
    ctx.fill();
  }

  ctx.lineCap = 'round';

  // ② 主脉：从 28% 半径起画、扭曲、很淡
  const ribs = Array.from({ length: 9 }, (_, i) => ({
    a: (i / 9) * PI * 2 + (rand() - 0.5) * 0.4,
    wob: (rand() - 0.5) * 0.34,
  }));

  const strokeRibs = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ribs.forEach(rb => {
      for (let k = 0; k <= 10; k++) {
        const t = 0.28 + (k / 10) * 0.72;
        const aa = rb.a + Math.sin(t * PI * 1.9) * rb.wob;
        const x = cx + Math.cos(aa) * t * S * 0.5;
        const y = cy + Math.sin(aa) * t * S * 0.5;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };
  strokeRibs('rgba(110,160,64,0.13)', 9);
  strokeRibs('rgba(226,246,190,0.15)', 4);

  // ③ 次级脉：又短又弯，别用直线
  ctx.beginPath();
  ribs.forEach(rb => {
    for (let k = 0; k < 3; k++) {
      const t0 = 0.4 + k * 0.2;
      const aa = rb.a + Math.sin(t0 * PI * 1.9) * rb.wob;
      let x = cx + Math.cos(aa) * t0 * S * 0.5;
      let y = cy + Math.sin(aa) * t0 * S * 0.5;
      const dir = aa + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.4);
      for (let step = 0; step < 3; step++) {
        x += Math.cos(dir + step * 0.28) * S * 0.028;
        y += Math.sin(dir + step * 0.28) * S * 0.028;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
  });
  ctx.strokeStyle = 'rgba(210,238,168,0.11)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ④ 高频细点：叶面的细胞颗粒
  for (let i = 0; i < 1400; i++) {
    const a = rand() * PI * 2;
    const r = Math.sqrt(rand()) * S * 0.5;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(196,232,150,0.14)' : 'rgba(104,156,58,0.12)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.8 + rand() * 1.6, 0, PI * 2);
    ctx.fill();
  }

  // ⑤ 叶缘压暗，叶片才有厚度
  ctx.strokeStyle = 'rgba(68,112,34,0.22)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.485, 0, PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set('leafVein', texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 番茄横切面
 *
 * 上一版用「7 个 RingGeometry 楔形 + 球体籽」拼心室，问题很明显：
 * 楔形的边是硬的、等宽的，7 瓣一圈排下来像一枚风车 logo，
 * 而且籽是浮在切面上的小白球，像撒了糖珠。
 *
 * 真实番茄的横切面不是扇形分割，而是一圈「透镜状」的胶质心室：
 * 每个心室两端收窄、中间鼓出来，心室之间是淡粉色的隔膜，
 * 外面再包一圈浅色的皮下果肉和深色果皮。
 * 这种渐变和圆角用几何拼不出来，只能画。
 *
 * 于是整张切面画进 canvas，几何只剩「侧壁 + 一张圆片 + 果皮圈」，
 * 顺带把绘制调用从 20 多次降到 3 次。
 * ═══════════════════════════════════════════════════════════ */

export function tomatoTexture(): THREE.Texture | null {
  const hit = cache.get('tomatoCut');
  if (hit) return hit;

  const S = 512;
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.5;
  const PI = Math.PI;
  const rand = mulberry32(9152);

  // ── 1. 皮下果肉：整片浅红打底 ──
  const flesh = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  flesh.addColorStop(0, '#F0936F');
  flesh.addColorStop(0.42, '#E9724E');
  flesh.addColorStop(0.74, '#DC5B3B');
  flesh.addColorStop(0.93, '#CC452B');
  flesh.addColorStop(1, '#BE3A22');
  ctx.fillStyle = flesh;
  ctx.fillRect(0, 0, S, S);

  // 果肉的放射状纤维：极细、极淡，只负责打散「纯色圆盘」的平
  ctx.beginPath();
  for (let i = 0; i < 260; i++) {
    const a = rand() * PI * 2;
    const r0 = R * (0.1 + rand() * 0.45);
    const len = R * (0.08 + rand() * 0.22);
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
  }
  ctx.strokeStyle = 'rgba(255,180,150,0.10)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // ── 2. 七个心室：透镜形，两端收窄、中间最胖 ──
  //    真实番茄的心室几乎顶到果皮，内沿离果心也很近，
  //    所以半径跨到 0.17–0.85；只画中间一小圈会变成「花蕊」。
  const N = 7;
  const rIn = R * 0.17;
  const rOut = R * 0.87;

  for (let i = 0; i < N; i++) {
    const mid = (i / N) * PI * 2 - PI / 2 + (rand() - 0.5) * 0.05;
    const span = (PI * 2) / N;
    const half = span * 0.38;
    // 每个心室的胖瘦略有差别，一圈等宽会立刻读成机械图形
    const bulge = 0.88 + rand() * 0.2;
    const rMid = (rIn + rOut) / 2;
    const rHalf = (rOut - rIn) / 2;

    const pts: [number, number][] = [];
    const STEPS = 26;
    // 外沿：左 → 右
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const a = mid - half + t * half * 2;
      // sin(πt) 在中段取 1、两端取 0 —— 这才是透镜的胖瘦曲线。
      // 之前写成 sin((t-0.5)π)，中段恰好是 0，结果心室被掐成一小段。
      const p = Math.pow(Math.sin(PI * t), 0.5) * bulge;
      const rr = rMid + rHalf * p;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    // 内沿：右 → 左
    for (let s = STEPS; s >= 0; s--) {
      const t = s / STEPS;
      const a = mid - half + t * half * 2;
      const p = Math.pow(Math.sin(PI * t), 0.5) * bulge;
      const rr = Math.max(rIn * 0.8, rMid - rHalf * p);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }

    ctx.beginPath();
    pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();

    // 心室胶质：深红，外沿更暗（光进不去）
    const gx = cx + Math.cos(mid) * rMid;
    const gy = cy + Math.sin(mid) * rMid;
    const gel = ctx.createRadialGradient(gx, gy, R * 0.01, gx, gy, rHalf * 0.9);
    gel.addColorStop(0, '#D8402A');
    gel.addColorStop(0.55, '#C32D18');
    gel.addColorStop(1, '#A81F0E');
    ctx.fillStyle = gel;
    ctx.fill();

    // 心室内的籽：水滴形，沿半径方向躺倒，贴着胶质散布
    const seeds = 5 + Math.floor(rand() * 3);
    for (let k = 0; k < seeds; k++) {
      const sa = mid + (rand() - 0.5) * half * 1.6;
      const sr = rMid + (rand() - 0.5) * rHalf * 0.72;
      const x = cx + Math.cos(sa) * sr;
      const y = cy + Math.sin(sa) * sr;
      const ang = sa + PI / 2;
      const len = R * (0.021 + rand() * 0.008);
      const wid = len * 0.48;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.quadraticCurveTo(0, -wid, len, 0);
      ctx.quadraticCurveTo(0, wid, -len, 0);
      ctx.fillStyle = 'rgba(240,219,170,0.9)';
      ctx.fill();
      // 只留一道极细的暗芯，不要一整块深色
      ctx.beginPath();
      ctx.ellipse(len * 0.1, 0, len * 0.5, wid * 0.2, 0, 0, PI * 2);
      ctx.fillStyle = 'rgba(212,176,116,0.5)';
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 3. 隔膜：心室之间那几道淡粉色的壁 ──
  ctx.strokeStyle = 'rgba(248,186,160,0.42)';
  ctx.lineWidth = R * 0.017;
  ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2 - PI / 2 + PI / N;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.11, cy + Math.sin(a) * R * 0.11);
    ctx.lineTo(cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84);
    ctx.stroke();
  }

  // ── 4. 果心：偏白的胶质柱，边界不规则 ──
  ctx.beginPath();
  const core = R * 0.2;
  for (let s = 0; s <= 48; s++) {
    const a = (s / 48) * PI * 2;
    const rr = core * (1 + Math.sin(a * 3 + 1.2) * 0.1 + Math.sin(a * 5 + 0.4) * 0.05);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (s === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, core);
  cg.addColorStop(0, '#FBD8C4');
  cg.addColorStop(0.7, '#F8C4AC');
  cg.addColorStop(1, '#EFB098');
  ctx.fillStyle = cg;
  ctx.fill();

  // ── 5. 果皮：收在最后画，压住所有向外的溢出 ──
  //    内沿走一圈不规则的浅色「皮下层」，再一圈深红果皮
  ctx.beginPath();
  for (let s = 0; s <= 72; s++) {
    const a = (s / 72) * PI * 2;
    const rr = R * (0.945 + Math.sin(a * 4 + 0.8) * 0.006);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (s === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(214,74,54,0.85)';
  ctx.lineWidth = R * 0.055;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.972, 0, PI * 2);
  ctx.strokeStyle = 'rgba(168,32,18,0.9)';
  ctx.lineWidth = R * 0.04;
  ctx.stroke();

  // 圆外填掉：CircleGeometry 用不到，但清掉边界杂色更稳
  ctx.beginPath();
  ctx.rect(0, 0, S, S);
  ctx.arc(cx, cy, R * 0.99, 0, PI * 2, true);
  ctx.fillStyle = '#C0321A';
  ctx.fill('evenodd');

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set('tomatoCut', texture);
  return texture;
}

/* ═══════════════════════════════════════════════════════════
 * 洋葱：同心层理
 *
 * 洋葱片最关键的信号不是颜色，是**一层套一层的同心弧**。
 * 之前的做法是给整片一个「内缘亮 → 外缘暖」的顶点色渐变 ——
 * 那只是明度渐变，读出来是一块浅色的塑料片，不读成洋葱。
 *
 * 这里不再用几何去堆（那会变成一沓环，接口处全是硬边），
 * 而是画进贴图：onionWedgeGeometry 的 UV 是
 *   u = 沿弧长、v = 沿半径
 * 所以贴图上**一条水平线**就是一圈同心弧。画 7 条柔和的层线即可。
 *
 * 明度差只有 6% 上下：洋葱是半透的，层与层之间是「厚薄差」不是
 * 「色差」。对比给大了，整片会读成千层酥。
 * ═══════════════════════════════════════════════════════════ */
export function onionTexture(): THREE.Texture | null {
  const hit = cache.get('onionLayer');
  if (hit) return hit;

  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rand = mulberry32(60812);

  // 底色：暖乳白。真正的暖色由顶点色给，这里只做明度底。
  ctx.fillStyle = '#FFFBF1';
  ctx.fillRect(0, 0, W, H);

  // ① 层线：v 从 0（内缘）到 1（外缘），一层比一层宽。
  //    间距也逐条拉开：等距 + 等深的线会读成瓦楞纸，洋葱的层是
  //    「越往外越宽」的。暗线只给 0.3 的不透明度 —— 再深就成百叶了。
  const bands = [0.12, 0.23, 0.35, 0.48, 0.62, 0.77, 0.9];
  for (const v of bands) {
    const y = v * H;
    const h = 4 + v * 9;
    const g = ctx.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, 'rgba(255,251,241,0)');
    g.addColorStop(0.34, 'rgba(255,247,232,0.6)'); // 层的内壁：偏亮
    g.addColorStop(0.56, 'rgba(216,190,166,0.3)'); // 缝：偏暖的暗线
    g.addColorStop(1, 'rgba(255,251,241,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - h, W, h * 2);
  }

  // ② 细胞感：沿弧长方向拉长的细纹理（洋葱的细胞是长条形的）
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const len = 6 + rand() * 26;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.30)' : 'rgba(206,180,156,0.16)';
    ctx.lineWidth = 0.7 + rand() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // repeat 1：层线要「一圈就是一圈」，平铺会变成一圈密集的同心纹
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;

  cache.set('onionLayer', texture);
  return texture;
}
