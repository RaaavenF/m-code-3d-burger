import * as THREE from 'three';
import type { GeometryKind } from '@/types/burger';

/**
 * 程序化低模几何
 *
 * 为什么不直接用 GLB：
 *  1. 麦当劳没有公开食材模型资产，第三方来源的授权状况不明；
 *  2. 一个 15 层的汉堡要 15 个 draw，GLB 加载 + 解码会让首屏多等 1–2 秒；
 *  3. 程序化几何的厚度直接来自 Ingredient.thickness，改数据就改模型，
 *     不会出现「数据说 0.22、模型是 0.31」的错位。
 *
 * 轮廓用 [半径, 高度比例] 描述，高度比例会乘以 thickness，
 * 因此同一份轮廓能适配任意厚度。
 *
 * 若要换成自有 GLB：给 Ingredient 加 modelPath 字段，IngredientMesh 会优先加载它。
 */

type Profile = [number, number][];

/**
 * 下层面包：平底、收腰、**平顶**（被上一层压住），边缘略外翻。
 *
 * 顶面必须是一刀切开的平面，不是圆穹：
 * 圆穹会在切面之外顶出一圈被拉成竖条纹的外皮，像贝果的内壁。
 */
export const BUN_BOTTOM_PROFILE: Profile = [
  [0, 0], [0.3, 0], [0.55, 0.006], [0.74, 0.03], [0.88, 0.075],
  [0.955, 0.145], [0.99, 0.235], [1, 0.34], [0.995, 0.46], [0.978, 0.58],
  [0.95, 0.7], [0.912, 0.81], [0.878, 0.9], [0.856, 0.965], [0.84, 1],
  [0, 1],
];

/**
 * 上层面包：圆顶。
 *
 * 底部半径刻意收到 0.68 —— 真实汉堡的顶包会「收腰」扣在馅料上，
 * 若底部和馅料同样宽，薄层（酱料、洋葱）会被完全遮住，
 * 用户加了却看不见，会以为没生效。但也别收太狠：
 * 收到 0.66 时从侧面能看到盖底下是空的，像一顶浮着的帽子。
 *
 * ⚠️ 最大半径收在 0.925（原来是 1.03）
 *    上一版的顶包比生菜还宽，从斜上方看就是一顶宽檐帽，
 *    把下面 6 层全罩进阴影里。现在它比生菜窄一圈 ——
 *    生菜、培根从盖沿下探出来，夹层才有存在感。
 *
 * ⚠️ 最高点在 y=0.72 处就已经收到半径 0.77
 *    剩下的 28% 高度横跨 0.77→0。这样肩部是一个连续的弧，
 *    而不是「一圈陡坡 + 一块平顶」——平顶在俯视时就是一块圆饼。
 */
export const BUN_TOP_PROFILE: Profile = [
  [0, 0], [0.66, 0.006], [0.77, 0.028], [0.845, 0.072], [0.892, 0.132],
  [0.918, 0.208], [0.925, 0.3], [0.919, 0.392], [0.9, 0.48], [0.868, 0.565],
  [0.824, 0.645], [0.768, 0.72], [0.7, 0.79], [0.612, 0.852], [0.505, 0.905],
  [0.374, 0.951], [0.214, 0.985], [0, 1],
];

/** 兼容旧名：芝麻沿这个轮廓取样 */
const BUN_TOP = BUN_TOP_PROFILE;

/**
 * 肉排轮廓：五种肉各有一条自己的曲线
 *
 * 之前五块肉共用一条 PATTY 轮廓，只靠贴图换色 —— 于是汉堡里
 * 无论夹牛肉、脆鸡还是鳕鱼，剪影完全一样，用户只能靠颜色猜。
 * 真实汉堡的五种肉在**侧面轮廓**上就能分出来：
 *  · 牛肉饼手压 → 顶面中间塌一点，边缘厚而圆
 *  · 麦辣鸡腿 → 整块腿肉裹粉，最厚、边缘最陡
 *  · 脆鸡排 → 扁平、边缘炸得毛糙
 *  · 板烧     → 铁板压过，最扁最宽，边缘收成一道薄边
 *  · 鳕鱼     → 圆角方（形状由 squarifyGeometry 负责）
 */

/** 牛肉排：顶面中间微微凹下去（手压留下的坑） */
const PATTY_BEEF: Profile = [
  [0, 0], [0.28, 0], [0.54, 0.004], [0.72, 0.016], [0.86, 0.05],
  [0.935, 0.1], [0.982, 0.18], [1.0, 0.3], [1.006, 0.42], [0.998, 0.54],
  [0.985, 0.66], [0.965, 0.77], [0.925, 0.865], [0.86, 0.93],
  [0.72, 0.978], [0.5, 0.998], [0.26, 0.978], [0, 0.952],
];

/** 麦辣鸡腿排：最厚，侧壁陡直（整块腿肉裹粉炸出来的柱状） */
const PATTY_SPICY: Profile = [
  [0, 0], [0.26, 0], [0.5, 0.003], [0.7, 0.012], [0.85, 0.04],
  [0.928, 0.085], [0.975, 0.15], [0.998, 0.245], [1.008, 0.38], [1.004, 0.52],
  [0.99, 0.66], [0.968, 0.78], [0.928, 0.875], [0.85, 0.945],
  [0.7, 0.99], [0.42, 1], [0, 1],
];

/** 板烧鸡腿排：最扁，边缘收成薄边（铁板压出来的） */
const PATTY_GRILLED: Profile = [
  [0, 0], [0.34, 0], [0.6, 0.004], [0.78, 0.02], [0.9, 0.055],
  [0.962, 0.115], [0.996, 0.2], [1.0, 0.32], [0.995, 0.46], [0.985, 0.58],
  [0.965, 0.7], [0.93, 0.8], [0.868, 0.885], [0.78, 0.95],
  [0.6, 0.99], [0.32, 1], [0, 1],
];

/** 鳕鱼排：圆角方（squarify 之后再走这条轮廓） */
const PATTY_FISH: Profile = [
  [0, 0], [0.32, 0], [0.58, 0.005], [0.76, 0.022], [0.89, 0.058],
  [0.955, 0.12], [0.992, 0.21], [1.0, 0.33], [0.996, 0.47], [0.985, 0.6],
  [0.962, 0.72], [0.925, 0.81], [0.86, 0.895], [0.76, 0.955],
  [0.56, 0.993], [0.3, 1], [0, 1],
];

/** 薯饼：扁圆盘，边略鼓、顶面平（压模压出来的） */
const HASHBROWN: Profile = [
  [0, 0], [0.32, 0], [0.58, 0.01], [0.78, 0.05], [0.9, 0.13],
  [0.965, 0.26], [0.995, 0.42], [1.0, 0.56], [0.99, 0.7], [0.965, 0.82],
  [0.915, 0.91], [0.83, 0.965], [0.55, 1], [0, 1],
];

/** 薄片（番茄片） */
const SLICE: Profile = [
  [0, 0], [0.52, 0], [0.74, 0.006], [0.88, 0.03], [0.95, 0.12],
  [0.98, 0.3], [0.98, 0.7], [0.95, 0.88], [0.88, 0.97], [0.74, 1], [0, 1],
];

const PROFILES: Partial<Record<GeometryKind, Profile>> = {
  bunBottom: BUN_BOTTOM_PROFILE,
  bunTop: BUN_TOP_PROFILE,
  pattyBeef: PATTY_BEEF,
  pattyCrispy: PATTY_SPICY,
  pattySpicy: PATTY_SPICY,
  pattyGrilled: PATTY_GRILLED,
  pattyFish: PATTY_FISH,
  hashbrown: HASHBROWN,
  tomato: SLICE,
};

/** 外部（IngredientMesh）直接取轮廓，避免同一条曲线维护两份 */
export const PROFILE_BY_KIND = PROFILES;

/**
 * 把轮廓转成 LatheGeometry 需要的 Vector2 数组。
 * y 会乘以 thickness，保证几何体底面在 y=0、顶面在 y=thickness。
 */
export function lathePoints(
  kind: GeometryKind,
  thickness: number,
  segments = 44,
): THREE.Vector2[] {
  return latheFromProfile(PROFILES[kind] ?? SLICE, thickness, segments);
}

export function latheFromProfile(
  profile: Profile,
  thickness: number,
  segments = 44,
  radiusScale = 1,
): THREE.Vector2[] {
  const steps = Math.max(segments, profile.length);
  const pts: THREE.Vector2[] = [];

  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (profile.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(profile.length - 1, i0 + 1);
    const f = t - i0;
    const r = profile[i0][0] * (1 - f) + profile[i1][0] * f;
    const yf = profile[i0][1] * (1 - f) + profile[i1][1] * f;
    pts.push(new THREE.Vector2(r * radiusScale, yf * thickness));
  }
  return pts;
}

/**
 * 在轮廓上按「点序号参数」取样 —— u=0 是轮廓首点，u=1 是末点。
 * 回的是 [半径, 高度比例]，高度比例再乘 thickness 才是世界高度。
 */
function sampleProfile(profile: Profile, u: number): [number, number] {
  const t = Math.max(0, Math.min(1, u)) * (profile.length - 1);
  const i0 = Math.floor(t);
  const i1 = Math.min(profile.length - 1, i0 + 1);
  const f = t - i0;
  return [
    profile[i0][0] * (1 - f) + profile[i1][0] * f,
    profile[i0][1] * (1 - f) + profile[i1][1] * f,
  ];
}

/**
 * 轮廓上某点的外法线，返回 [径向分量, 高度分量]。
 *
 * 芝麻、焦斑这类「贴面小物件」必须按法线摆放，否则在圆顶肩部
 * 会像钉子一样扎进面包侧壁 —— 直接按球面近似定位是错的最常见原因：
 * 面包是压扁的旋转体，不是球。
 */
function surfaceNormal(profile: Profile, u: number, thickness: number): [number, number] {
  const eps = 0.008;
  const [r1, y1] = sampleProfile(profile, u + eps);
  const [r0, y0] = sampleProfile(profile, u - eps);
  const dr = r1 - r0;
  const dy = (y1 - y0) * thickness;
  const len = Math.hypot(dr, dy) || 1;
  // 切线 (dr, dy) 的外法线取 (dy, -dr)：轮廓自下而上时 dr<0、dy>0，
  // 于是法线天然指向「外面且朝上」。
  return [dy / len, -dr / len];
}

/* ═══════════════════════════════════════════════════════════
 * 确定性随机
 *
 * 散点必须可复现，否则每次 re-render 位置都在跳，看起来像在抖，
 * 截图也没法复现。所有随机几何都用这个种子函数。
 * ═══════════════════════════════════════════════════════════ */

function rand32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════════════════════════════════════
 * 生菜：整片叶子
 *
 * 单一 CircleGeometry 只有一个环，怎么改顶点都只是个「波浪圆盘」。
 * 要让叶心隆起、叶缘塌下去挂在下一层上，必须自己铺多圈环。
 *
 * ⚠️ 轮廓不能用 sin(a * 瓣数)
 *   正弦叠加出来的边，无论频率怎么混，都带着「几瓣」的周期感 ——
 *   上一版就是 7 个等大的瓣，转一圈像一朵七瓣花/朝鲜蓟。
 *   真实叶片的边缘是**不周期**的：有的地方宽、有的地方缩进去。
 *   所以这里改成「沿圆周取噪声」：把角度映射成单位圆上的点，
 *   到噪声场里采样。它天然连续（绕一圈首尾闭合），但没有周期。
 * ═══════════════════════════════════════════════════════════ */

/** 沿圆周采样的连续噪声，返回约 -0.5 ~ 0.5 */
function ringNoise(a: number, radius: number, seed: number, octaves = 3) {
  let n = 0;
  let w = 1;
  let s = 1;
  for (let o = 0; o < octaves; o++) {
    n +=
      (noise3(
        Math.cos(a) * radius * s,
        Math.sin(a) * radius * s,
        (seed % 97) * 0.37 + o * 0.11,
        seed + o * 17,
      ) -
        0.5) *
      w;
    w *= 0.5;
    s *= 2.3;
  }
  return n;
}

export function leafDiscGeometry(
  R: number,
  height: number,
  lobes = 6,
  rings = 16,
  seg = 132,
  seed = 0,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const s0 = seed;

  // 轮廓的收缩：低频决定「大块缺了几口」，高频决定叶缘的碎齿。
  // lobes 只作为低频尺度的一个系数，不再是「几等分」。
  //
  // 光有噪声还是「一圈波浪」——真实的一片叶子是被撕下来的：
  // 有几个很深的缺口（深达 40% 半径），形状才不是圆形。
  // 这里按确定性的角度放 4 个缺口，用高斯脉冲挖下去；
  // 其中一个更深更窄，读起来是「被撕开的一道口子」。
  const notches = Array.from({ length: 4 }, (_, i) => {
    const r = rand32(s0 * 977 + i * 131 + 7);
    const deep = i === 0;
    return {
      a: r() * Math.PI * 2,
      w: deep ? 0.16 + r() * 0.1 : 0.3 + r() * 0.26,
      d: deep ? 0.4 + r() * 0.14 : 0.2 + r() * 0.18,
    };
  });

  const rim = (a: number) => {
    // 三层频率：大缺块（低频）、能一眼看出的波浪边（中频）、叶缘碎齿（高频）。
    // 中频那一层是「叶缘波浪」的主力 —— 只有低频时轮廓是圆乎乎的，
    // 只有高频时是锯齿，两者之间的中频才读得出「叶子」。
    let k =
      1 +
      ringNoise(a, 0.62 + lobes * 0.08, s0 * 13 + 5, 2) * 0.32 +
      ringNoise(a, 3.0, s0 * 23 + 3, 2) * 0.115 +
      ringNoise(a, 7.6, s0 * 29 + 11, 2) * 0.034;

    for (const nt of notches) {
      // 角度差要取环面上的最短距离，否则缺口会被切开成两半
      let d = Math.abs(((a - nt.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < nt.w) k *= 1 - nt.d * Math.pow(Math.cos((d / nt.w) * Math.PI * 0.5), 2);
    }
    return k;
  };

  /** 叶缘的高度起伏：绕一圈有地方垂得深、有地方几乎翘平。 */
  const edgeLift = (a: number) => ringNoise(a, 3.4, s0 * 47 + 9, 2);

  /** 每片叶的叶脉条数：7 / 6 / 5 轮流，三层的沟不一样密 */
  const veins = 5 + (s0 % 3);
  const veinPhase = s0 * 1.37;

  pos.push(0, height * 0.62, 0);
  uvs.push(0.5, 0.5);

  const rows: number[][] = [];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const ids: number[] = [];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const rr = R * Math.pow(t, 0.92) * rim(a);

      // 叶心鼓起：t=0 时最高，到叶缘降到 0
      const dome = Math.cos(t * Math.PI * 0.5) * height * 0.34;

      // 叶缘整体往下淌，挂在下一层上。
      // 乘上 edgeLift 之后，同样的下垂量在不同方位差出三倍 ——
      // 一圈均匀的裙边立刻变成「有的地方垂着、有的地方翘着」。
      //
      // ⚠️ 系数从 1.22 收到 0.72。原来一片叶子的纵向跨度是层高的 1.6 倍，
      //    三片叠在一起必然互相穿插 —— 穿插处出现的是又长又薄的交线，
      //    看着像折纸。叶片本身要「薄」，错开才看得清。
      const droop = -Math.pow(t, 1.9) * height * 0.72 * (1 + edgeLift(a) * 0.7);

      // 皱褶要给足：平滑的叶面在高光下就是一块绿色的铁皮。
      //  · 超低频做大翻边（叶面像揉过再摊开）
      //  · 中频做能看见的褶皱
      //  · 沿角度走的高频做径向叶脉沟 —— 这是「叶子」最关键的信号，
      //    缺了它，起伏再大也只是一张揉皱的纸
      //
      // ⚠️ 角度相位里带上 t（`a + t * 0.85`）：
      //    只按 a 采样噪声，等于「整条半径一起升降」——
      //    渲染出来是一片以叶心为轴的三角褶扇，每道褶都是一条笔直的
      //    径向棱。相位随半径偏移之后，褶线变成弯曲的，才像被揉过。
      const swirl = a + t * 0.85;
      const vein = Math.cos(a * veins + veinPhase + ringNoise(a, 0.9, s0 * 5 + 1, 1) * 1.4);
      const wrinkle =
        ringNoise(swirl, 1.55, s0 * 7 + 2, 3) * height * 0.52 * Math.pow(t, 0.85) +
        ringNoise(swirl * 1.0 + t * 1.7, 4.4, s0 * 31 + 7, 2) * height * 0.34 * Math.pow(t, 1.3) +
        vein * height * 0.24 * Math.pow(t, 1.7);

      pos.push(Math.cos(a) * rr, height * 0.62 + dome + droop + wrinkle, Math.sin(a) * rr);
      uvs.push(Math.cos(a) * t * 0.5 + 0.5, Math.sin(a) * t * 0.5 + 0.5);
      ids.push(pos.length / 3 - 1);
    }
    rows.push(ids);
  }

  for (let s = 0; s < seg; s++) idx.push(0, rows[0][s + 1], rows[0][s]);
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < seg; s++) {
      const A = rows[r][s];
      const B = rows[r][s + 1];
      const C = rows[r + 1][s + 1];
      const D = rows[r + 1][s];
      idx.push(A, B, C, A, C, D);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 叶尖：从饼缘探出去的一小片叶子，根部宽、末端收成尖、整体向下垂。
 *
 * 整片圆叶只能围出一圈裙边，压在面包底下就只剩一条绿带；
 * 几片探出来的叶子才是「汉堡里夹了生菜」的视觉信号。
 * 几何沿 +X 生长，UV 走径向切片，叶脉顺着叶子长。
 */
export function leafBladeGeometry(len: number, w0: number, drop: number, cup = 0.55) {
  const NX = 10;
  const NZ = 4;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= NX; i++) {
    const u = i / NX;
    // 半宽：中段保持宽，快到尖收成「钝头」而不是一个尖角。
    // 上一版 0.07 + 0.93·(…)^0.38 收到 7% 宽，末端是一个数学点 ——
    // 渲染出来就是一片三角形的塑料桨。真实的叶尖是圆钝的一小段。
    const hw =
      w0 *
      (0.3 + 0.7 * Math.pow(1 - Math.pow(u, 2.6), 0.42)) *
      (1 + Math.sin(u * 9.3 + 1.1) * 0.15) *
      (1 + Math.sin(u * Math.PI) * 0.16);

    for (let j = 0; j <= NZ; j++) {
      const v = (j / NZ) * 2 - 1;
      const x = u * len;
      const y = -Math.pow(u, 2.2) * drop + v * v * hw * cup;
      pos.push(x, y, v * hw);
      uvs.push(0.5 + u * 0.47, 0.5 + v * 0.13);
    }
  }

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const a = i * (NZ + 1) + j;
      const b = a + 1;
      const c = a + (NZ + 1);
      const e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 洋葱：从洋葱球上切下来的一大片弧形
 *
 * 之前是「一整片薄圆盘 + 26 段小弧 + 46 颗碎丁」，中间还压了一张
 * opacity 0.5 的兜底圆盘 —— 结果整层读起来是一团灰白的半透明纸屑，
 * 而且从上面看能透过它看到下层的肉。
 *
 * 真实汉堡里的洋葱是**几块厚实的弧片**：从球上纵切下来，
 * 内缘乳白、外缘带着淡紫，边缘有厚度。所以现在每块是一个
 * 有厚度的环形扇区（annular sector），沿弧长还有起伏。
 *
 * 几何用 Shape + ExtrudeGeometry（⚠️ 必须开 bevel，见
 * roundedSquareGeometry 上的那个坑），挤出方向转成 +Y。
 * ═══════════════════════════════════════════════════════════ */

export function onionWedgeGeometry(
  rIn: number,
  rOut: number,
  sweep: number,
  thickness: number,
  seed = 0,
): THREE.BufferGeometry {
  const N = 22;
  const shape = new THREE.Shape();

  // 外弧：沿弧长轻微起伏，切口不是完美圆弧
  for (let i = 0; i <= N; i++) {
    const a = -sweep / 2 + (i / N) * sweep;
    const rr = rOut * (1 + Math.sin(a * 6.5 + seed * 2.1) * 0.014);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  // 内弧：往回走。真实的切片厚度沿弧长在变 —— 一头厚一头薄
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const a = -sweep / 2 + t * sweep;
    const rr = rIn * (1 + Math.sin(a * 4.3 + seed * 1.7) * 0.05 + (t - 0.5) * 0.07);
    shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  shape.closePath();

  const bevel = Math.min(0.0042, thickness * 0.26);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, thickness * 0.4),
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);

  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const r = Math.hypot(x, z);

    // 沿弧长抬高/压低一点：一片洋葱不会严格贴在同一水平面上
    const lift = Math.sin(a * 5.5 + seed * 1.3) * thickness * 0.55 * Math.min(1, r / rOut);

    // ⚠️ 两端要收薄。
    // 挤出的扇区如果厚度处处相等，切口就是两条笔直的断面 ——
    // 七块拼起来像一堆碎瓷片。真实的洋葱片是刀切出来的楔形：
    // 中间厚、两头薄，于是端部会有一道渐隐的斜边。
    const taper = 0.45 + 0.55 * Math.cos((a / (sweep / 2)) * Math.PI * 0.5);
    p.setY(i, p.getY(i) * taper + lift);

    // UV 沿弧长/径向展开，贴图里的层理自然顺着弧走
    uv.setXY(
      i,
      (a + sweep / 2) / sweep,
      Math.max(0, Math.min(1, (r - rIn) / Math.max(0.001, rOut - rIn))),
    );
  }

  p.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * 超椭圆映射：把圆盘压成圆角方
 *
 * 鳕鱼排是五种肉里唯一一块「方的」—— 光靠颜色分不出来，
 * 剪影才是最强的辨识信号。把旋转体的每个顶点按角度重映射到
 * 超椭圆边界上，圆形就变成了圆角方，侧壁和顶盖一起跟着变。
 *
 * exponent 是 |cos| 的指数：1 保持圆形，0.66 约等于四阶超椭圆
 * （圆角方），再小就接近方块了。
 */
/**
 * 把圆盘重映射成「圆角方」——鳕鱼排的剪影。
 *
 * 上一版是 `sign(c)·|c|^0.66` 那套：沿轴方向缩到 0.9、45° 方向不变，
 * 结果是一个「略微被夹了一下的圆」，在汉堡里和牛肉饼几乎看不出差别。
 *
 * 超椭圆才对：r(θ) = 1 / (|cosθ|ⁿ + |sinθ|ⁿ)^(1/n)。
 * n 越大越方，n=6 时方角半径约为轴的 1.24 倍 —— 这才是
 * 「四个角撑出来」的方饼。轴向保持原半径，所以整块不会缩水。
 */
export function squarifyGeometry(geo: THREE.BufferGeometry, n = 6) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;

    const a = Math.atan2(z, x);
    const ca = Math.abs(Math.cos(a));
    const sa = Math.abs(Math.sin(a));
    const k = 1 / Math.pow(Math.pow(ca, n) + Math.pow(sa, n), 1 / n);

    p.setX(i, Math.cos(a) * r * k);
    p.setZ(i, Math.sin(a) * r * k);
  }

  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 薯丝：低多边形圆截面的细长条
 *
 * 方截面在近景下就是一根火柴棍，圆截面才有炸过的柔软感。
 * 中段略粗、两头收，再叠一点弯曲，才不像一盒牙签。
 * ═══════════════════════════════════════════════════════════ */

export function shredGeometry(len: number, w: number, th: number, bow = 0.01) {
  const geo = new THREE.CylinderGeometry(1, 1, len, 5, 3, false);
  geo.rotateZ(Math.PI / 2); // 轴向从 Y 改到 X
  const p = geo.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = x / len + 0.5;
    const bulge = 1 + Math.sin(u * Math.PI) * 0.08;
    p.setY(i, p.getY(i) * th * 0.5 * bulge + Math.sin(u * Math.PI) * bow);
    p.setZ(i, p.getZ(i) * w * 0.5 * bulge);
  }

  geo.computeVertexNormals();
  return geo;
}

/** 切碎的小块：Box 的直角太像骰子，把顶点按确定性随机推歪一点 */
export function chipGeometry(w: number, h: number, d: number, seed = 7) {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const rand = rand32(seed);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) * (0.86 + rand() * 0.26),
      p.getY(i) * (0.86 + rand() * 0.26),
      p.getZ(i) * (0.86 + rand() * 0.26),
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/** 不规则的一摊：酱抹在面包上不会是个正圆，半径得抖 */
export function splatGeometry(radius: number, seg = 34) {
  const geo = new THREE.CircleGeometry(radius, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.02) continue;
    const a = Math.atan2(z, x);
    const k =
      1 +
      Math.sin(a * 3 + 0.7) * 0.085 +
      Math.sin(a * 5.3 + 2.1) * 0.05 +
      Math.sin(a * 9.1) * 0.028;
    p.setX(i, x * k);
    p.setZ(i, z * k);
    p.setY(i, Math.sin(a * 4.2) * 0.004);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * 变径管：沿曲线挤出的「酱条」
 *
 * 酱是流体，必须用光滑着色 —— flat 着色的高光会碎成一段一段。
 * 半径沿 t 变化：起笔细、中段随挤出起伏、收尾提起来收尖。
 */
export function taperedTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radialSegments: number,
  radiusAt: (t: number) => number,
  flatten = 0.62,
) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = radiusAt(t);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const nx = N.x * cos + B.x * sin;
      const ny = (N.y * cos + B.y * sin) * flatten;
      const nz = N.z * cos + B.z * sin;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      uvs.push(t, j / radialSegments);
    }
  }

  for (let i = 1; i <= tubularSegments; i++) {
    for (let j = 1; j <= radialSegments; j++) {
      const a = (radialSegments + 1) * (i - 1) + (j - 1);
      const b = (radialSegments + 1) * i + (j - 1);
      const c = (radialSegments + 1) * i + j;
      const d = (radialSegments + 1) * (i - 1) + j;
      idx.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 值噪声 + 表面揉皱
 *
 * 脆衣、薯饼、肉排的「颗粒感」以前是靠往表面撒小方块假装的 ——
 * 撒出来的东西不会改变轮廓，永远浮在光滑的饼胚外面，近景一看就是
 * 一堆贴纸。真正的颗粒感必须写进几何：把顶点沿法线推出去一点，
 * 轮廓本身长出起伏，光照才会碎成颗粒。
 *
 * 用值噪声（value noise）而不是纯随机：纯随机会让相邻顶点各走各的，
 * 表面变成砂纸；值噪声有连续性，推出来的是「疙瘩」。
 * ═══════════════════════════════════════════════════════════ */

function hash3(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (seed | 0), 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 三线性插值的值噪声，返回 0–1 */
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;

  const c00 = l(hash3(xi, yi, zi, seed), hash3(xi + 1, yi, zi, seed), u);
  const c10 = l(hash3(xi, yi + 1, zi, seed), hash3(xi + 1, yi + 1, zi, seed), u);
  const c01 = l(hash3(xi, yi, zi + 1, seed), hash3(xi + 1, yi, zi + 1, seed), u);
  const c11 = l(hash3(xi, yi + 1, zi + 1, seed), hash3(xi + 1, yi + 1, zi + 1, seed), u);

  return l(l(c00, c10, v), l(c01, c11, v), w);
}

/**
 * 沿法线把表面揉皱
 *
 * amp 是世界坐标下的位移幅度，freq 是每单位长度的噪声周期数。
 * 频率要和网格密度匹配：48 段、半径 1 的旋转体，相邻顶点间距约 0.13，
 * 频率超过 12 就采不到噪声了，推出来的是锯齿而不是疙瘩。
 */
export function crinkleGeometry(
  geo: THREE.BufferGeometry,
  amp: number,
  freq: number,
  seed = 1,
  octaves = 2,
): THREE.BufferGeometry {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;

  const out = new Float32Array(pos.count * 3);
  const yMin = 0;
  const yMax = (() => {
    let m = -Infinity;
    for (let i = 0; i < pos.count; i++) m = Math.max(m, pos.getY(i));
    return m || 1;
  })();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // 两到三个八度：低频给大起伏，高频给小颗粒
    let n = 0;
    let w = 1;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      n += (noise3(x * f, y * f * 1.7, z * f, seed + o * 31) - 0.5) * w;
      w *= 0.55;
      f *= 2.13;
    }
    // 上下极（顶/底盖的中轴）几乎不动，否则盖子会被推出一个尖
    const edgeFade = Math.min(1, Math.min(y - yMin, yMax - y) / Math.max(yMax * 0.18, 0.001));

    out[i * 3] = x + nrm.getX(i) * n * amp * 2 * edgeFade;
    out[i * 3 + 1] = y + nrm.getY(i) * n * amp * 2 * edgeFade;
    out[i * 3 + 2] = z + nrm.getZ(i) * n * amp * 2 * edgeFade;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 把 UV 换成「从正上方投影」
 *
 * 旋转体自带的 UV 是柱面展开的：u 绕一圈、v 顺着轮廓。于是有两个死结：
 *  1. 圆顶的极点处所有 u 挤在同一个像素，任何有横向变化的地图
 *     都会在顶心被拉成一把扇子（就是面包顶上那圈「放射刷痕」）；
 *  2. 侧壁的 v 被压缩，贴图的点会被拉成长的横条纹。
 *
 * 这些食材都是「扁平的圆盘」，从顶上看一眼就能看到 90% 的表面积，
 * 所以直接按世界坐标 (x, z) 做一次顶视投影即可：无奇点、无拉伸、
 * 顶面与侧壁用同一套比例，颗粒大小天然一致。
 *
 * size 是投影覆盖的世界宽度。材质上的 repeat 再乘上去决定最终密度。
 */
export function projectPlanarUV(geo: THREE.BufferGeometry, size = 2.2) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / size + 0.5;
    uv[i * 2 + 1] = pos.getZ(i) / size + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * 顶视投影 + 侧壁柱面投影的混合 UV
 *
 * 纯顶视投影解决了极点扇痕，但会带来一个新问题：侧壁的顶点 (x, z) 几乎
 * 不变，整条侧壁都采样同一列纹素 —— 侧壁被拉成一圈竖条纹。
 *
 * 所以按法线分：朝上的面用顶视投影（无奇点），接近竖直的面改用柱面投影
 * （u 随角度走、v 随高度走，正好是侧壁需要的方向）。
 * 切换点放在轮廓的圆角线上，那里本来就有明暗分界，接缝看不出来。
 *
 * 柱面的 u 要乘上「周长 / size」才能和顶视投影保持同一密度，
 * 否则同一张贴图在顶面和侧壁上会出现两个数量级的颗粒差。
 */
export function projectHybridUV(geo: THREE.BufferGeometry, size = 2.2) {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const TAU = Math.PI * 2;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = Math.abs(nrm.getY(i));

    // ⚠️ 这里必须是**渐变**，不能是 if/else 的二值切换。
    //    反面朝上/朝外的法线只隔一条边，二值判断会让相邻两个顶点
    //    走完全不同的投影，UV 在接缝上一左一右地跳 —— 渲染出来
    //    就是饼底一圈「竖着小齿的条码」，看着像贴了一行字。
    const t = THREE.MathUtils.smoothstep(ny, 0.32, 0.82);

    const uTop = x / size + 0.5;
    const vTop = z / size + 0.5;
    const uCyl = ((Math.atan2(z, x) + Math.PI) / TAU) * ((TAU * 0.98) / size);
    const vCyl = y / size;

    uv[i * 2] = uTop + (uCyl - uTop) * (1 - t);
    uv[i * 2 + 1] = vTop + (vCyl - vTop) * (1 - t);
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * 让旋转体的边缘变得不规则
 *
 * 完美旋转体看起来像橡皮。频率取整数，保证 θ=0 与 θ=2π
 * 接缝处的位移一致，不会裂开。
 */
export function wobbleGeometry(geo: THREE.BufferGeometry, freq: number, amp: number, seed = 11) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.02) continue;
    const a = Math.atan2(z, x);
    // ⚠️ 不能只用 sin(freq·a)：那是**完美周期**的，一圈正好 12 个等宽花瓣，
    //    炸鸡的边看起来像一朵菊花的模具。叠加两层环面噪声之后，
    //    有的地方鼓得高、有的地方几乎平，才是「炸开的壳」。
    const k =
      1 +
      Math.sin(a * freq) * amp * 0.5 +
      ringNoise(a, freq, seed, 2) * amp * 0.8 +
      ringNoise(a, freq * 2.7, seed + 5, 1) * amp * 0.42;
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 培根：波浪形薄片
 * 沿 X 做正弦起伏，读起来是「煎到卷边」，不是一块木板。
 * ═══════════════════════════════════════════════════════════ */

export function ribbonGeometry(
  width = 1.32,
  depth = 0.3,
  amp = 0.05,
  seg = 48,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];

  for (let j = 0; j <= seg; j++) {
    const x = -width / 2 + (width * j) / seg;
    const y = amp * Math.sin((x / width) * Math.PI * 3.4);
    const taper = 1 - 0.25 * Math.pow(Math.abs(x) / (width / 2), 3);

    for (let k = 0; k < 2; k++) {
      const z = (k === 0 ? -1 : 1) * (depth / 2) * taper;
      pos.push(x, y, z);
    }
  }

  for (let j = 0; j < seg; j++) {
    const a = j * 2;
    const b = a + 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 培根：有厚度的波浪肉条
 *
 * 一开始用的是零厚度的 ribbon（平面）。正面看没问题，但它一旦被
 * 从斜上方看就会变成一条飘着的塑料带子——边缘没有厚度，也没有影子。
 * 改成薄板后，配合顶面的波浪与侧壁的焦色，才读得出「煎过的肉」。
 */
export function wavySlabGeometry(
  width: number,
  depth: number,
  thickness: number,
  amp = 0.045,
  seg = 26,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, thickness, depth, seg, 1, 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = x / width;
    // 沿长度做 S 形起伏（煎到卷边），同时横向略微收窄
    p.setY(i, p.getY(i) + Math.sin(u * Math.PI * 3.1) * amp);
    p.setZ(i, p.getZ(i) * (1 + Math.cos(u * Math.PI * 2.4) * 0.1));
  }

  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 芝士片：圆角方形
 *
 * 直角 BoxGeometry 看起来像一张裁好的黄纸。真实芝士片有四角微圆、
 * 边缘略微塌软，所以用 Shape + ExtrudeGeometry 做圆角方形。
 * 挤出方向是 +Z，绕 X 转 -90° 后 +Z 就映射成 +Y，底面落在 y=0，
 * 与「几何体底面在本地 0」的约定一致。
 *
 * ⚠️ 坑：three r175 的 ExtrudeGeometry 在 bevelEnabled: false 时，
 *    `bevelSegments` 会被置 0，而顶/底盖的三角剖分跑在
 *    `for (b = 0; b < bevelSegments; b++)` 这个循环里面 ——
 *    循环不执行，contractedContour 为空，**盖面直接不生成**。
 *    表现就是：芝士只剩四条侧壁，中间是透明的，能看到下面的番茄。
 *    所以这里必须开着倒角，用一个极小值当「零倒角」用，
 *    顺带还白得一圈柔和的边缘高光。
 * ═══════════════════════════════════════════════════════════ */

export function roundedSquareGeometry(
  size: number,
  thickness: number,
  radius = 0.09,
): THREE.BufferGeometry {
  const half = size / 2;
  const r = Math.min(radius, half * 0.8);

  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);

  const bevel = Math.min(0.008, thickness * 0.12);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(thickness - bevel * 2, thickness * 0.5),
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  // 倒角上下各多出 bevelThickness，平移回来让底面正好在 y=0
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 芝士片：一张有起伏的方片，四角垂下来
 *
 * 比挤出体更划算 —— 芝士软塌不是靠厚度，靠「角往下淌」。
 * PlaneGeometry 细分 12×12 后，边缘按 dmax 线性下坠，
 * 中间再叠两道路径极缓的波纹，看起来才像被热气烘软的一片。
 */
/**
 * 芝士片：一片**平的**方形薄板，四角圆钝，斜压成一个菱形。
 *
 * ⚠️ 这里刻意**不做“融化”**。
 *    之前做过两版“化开的芝士”：边缘塌下去、边界带噪声 —— 单看像一摊
 *    橙色的东西，放在汉堡里既不像片、也看不出是哪一层。真实的快餐吉士片
 *    是**冷压的一片**，遇热只是软，形状仍是方片；它的辨识度在
 *    「四个角从面包和生菜底下探出来」这件事上，而不在“化”。
 *    所以：顶面、底面都平，只有一圈很短的实心侧壁 —— 从任何角度
 *    都看得到一条有厚度的边，这才是“片”。
 *
 * 用极坐标而不是网格：边界要精确走超椭圆。方形网格只能把界外的顶点
 * 硬贴到边界上，四角会留下一片退化三角形，法线算出来是花的。
 *
 * · 边界 = 超椭圆（n = 4.2，方而不尖）+ 极轻微的手感波纹
 * · 尺寸给到比肉饼的对角再大一点，成品里四角才会露出来
 */
export function cheeseSliceGeometry(size: number, thickness: number) {
  const half = size / 2;
  const SEG = 144;
  const RINGS = 5;
  // 6.0：角半径 = 轴半径 × 1.26。4.2 的角太圆，读成一块「黄油块」；
  // 再高（8 以上）就成了一张带尖角的色卡纸。
  // 切出来的一片芝士，四角本来就是**接近直角**的。
  const N = 6.0;
  const TAU_ = Math.PI * 2;
  const gauge = thickness * 0.62;

  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  const push = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    // 平面 UV：贴图（bump 的细颗粒）按世界坐标铺，不会在极坐标里绕成同心圆
    uvs.push(x / size + 0.5, z / size + 0.5);
    return pos.length / 3 - 1;
  };

  const rimR = (a: number, t: number) => {
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const sup = half / Math.pow(Math.pow(c, N) + Math.pow(s, N), 1 / N);
    // 只有 1% 量级的波纹：一片压出来的芝士不会四边笔直，
    // 但超过 3% 就开始往“融化”那边走了
    return t * sup * (1 + ringNoise(a, 3.6, 911, 2) * 0.02);
  };

  // 平：只在片面上留一点点起伏，让高光不至于是一整块死平的橙
  const topY = (a: number, t: number) =>
    gauge + ringNoise(a, 1.9, 421, 2) * thickness * 0.16 * t;

  const cTop = push(0, topY(0, 0), 0);
  // 底面直接压在 y=0：芝士是**放在**料上的，不能悬空。
  // 原来底面在 thickness-gauge ≈ 0.04 的位置，侧看能看到一条缝和一道
  // 投在下一层上的影子 —— 像一片浮着的塑料。
  const cBot = push(0, 0, 0);

  const tops: number[][] = [];
  const bots: number[][] = [];
  for (let r = 1; r <= RINGS; r++) {
    const t = r / RINGS;
    const rowT: number[] = [];
    const rowB: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * TAU_;
      const rr = rimR(a, t);
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const yT = topY(a, t);
      rowT.push(push(x, yT, z));
      rowB.push(push(x, 0, z));
    }
    tops.push(rowT);
    bots.push(rowB);
  }

  // 中心扇
  for (let s = 0; s < SEG; s++) {
    const s1 = (s + 1) % SEG;
    idx.push(cTop, tops[0][s1], tops[0][s]);
    idx.push(cBot, bots[0][s], bots[0][s1]);
  }

  // 环带
  for (let r = 0; r < RINGS - 1; r++) {
    const A = tops[r];
    const B = tops[r + 1];
    const a2 = bots[r];
    const b2 = bots[r + 1];
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      idx.push(A[s], B[s1], B[s], A[s], A[s1], B[s1]);
      idx.push(a2[s], b2[s], b2[s1], a2[s], b2[s1], a2[s1]);
    }
  }

  // 侧壁：顶面外圈 → 底面外圈
  const TO = tops[RINGS - 1];
  const BO = bots[RINGS - 1];
  for (let s = 0; s < SEG; s++) {
    const s1 = (s + 1) % SEG;
    idx.push(TO[s], TO[s1], BO[s], TO[s1], BO[s1], BO[s]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 竖向烘焙渐变
 *
 * 单一色 + 扁平光照的面包看起来像塑料。真实面包的顶部受热最久、
 * 颜色最深，侧面和底部偏浅。用顶点色把这条渐变烘进几何体，
 * 不增加 draw call，也不用贴图。
 *
 * 注意：开 vertexColors 后顶点色会和材质 color 相乘，
 * 所以材质必须是白色，否则渐变会被主色吃掉。
 * ═══════════════════════════════════════════════════════════ */

export function bakeVerticalGradient(
  geo: THREE.BufferGeometry,
  bottom: THREE.Color,
  top: THREE.Color,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const bbox = new THREE.Box3().setFromBufferAttribute(pos);
  const minY = bbox.min.y;
  const span = bbox.max.y - bbox.min.y || 1;

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const f = (pos.getY(i) - minY) / span;
    // 平方：深色集中在最顶上那一段，侧面保持浅金
    c.copy(bottom).lerp(top, f * f);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 径向渐变
 *
 * 番茄切片的顶面如果只有一个颜色，就是一块红塑料。
 * 真实剖面是「中心偏浅、外圈偏深」—— 胶质在中间，果肉靠皮更红。
 * 顶点色按到 Y 轴的距离插值，一次烘进去，不吃 draw call。
 * ═══════════════════════════════════════════════════════════ */

export function bakeRadialGradient(
  geo: THREE.BufferGeometry,
  center: THREE.Color,
  edge: THREE.Color,
  /** 多大半径以内保持纯 center 色（0–1）。默认 0 表示从圆心就开始过渡 */
  inner = 0,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const bbox = new THREE.Box3().setFromBufferAttribute(pos);
  const R = Math.max(Math.abs(bbox.min.x), Math.abs(bbox.max.x), 0.001);

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const span = Math.max(1e-4, 1 - inner);

  for (let i = 0; i < pos.count; i++) {
    const r = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / R);
    // 先把 r 重映射到 [inner,1]，再用 smoothstep：
    //  · inner=0   时就是原来的行为（番茄那样「整体从中心到边缘」的过渡）
    //  · inner=0.6 时中间 60% 是纯色，只有最外一圈压深 —— 面包切面要的是这个，
    //    否则整块瓤都被压成灰褐色，看不出「中间还白着」
    const t = Math.max(0, (r - inner) / span);
    const f = t * t * (3 - 2 * t);
    c.copy(center).lerp(edge, f);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ═══════════════════════════════════════════════════════════
 * 确定性散点分布
 *
 * 用固定表而不是 Math.random —— 随机位置每次 re-render 都在跳，
 * 视觉上像在抖，截图也没法复现。
 * ═══════════════════════════════════════════════════════════ */

export interface Spot {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
}

/** 番茄：7 个心室的起始角度 */
export const TOMATO_LOBULE_ANGLES = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2 + 0.24);

/** 番茄籽：7 个心室 × 3 粒 */
export const TOMATO_SEEDS: Spot[] = (() => {
  const rand = rand32(9091);
  const out: Spot[] = [];
  for (let i = 0; i < 7; i++) {
    const base = (i / 7) * Math.PI * 2 + 0.5;
    for (let k = 0; k < 3; k++) {
      const a = base + (k - 1) * 0.135;
      const rr = 0.42 + k * 0.15;
      out.push({
        pos: [Math.cos(a) * rr, 0, Math.sin(a) * rr],
        rot: [(rand() - 0.5) * 0.6, a, (rand() - 0.5) * 0.6],
        scale: [1.5, 0.5, 1],
      });
    }
  }
  return out;
})();

/** 酸黄瓜片的位置（5 片，黄金角散布）与籽。pos[1] 是高度比例（0 = 贴着底层） */
export const PICKLE_SPOTS: [number, number, number][] = Array.from({ length: 5 }, (_, i) => {
  const angle = i * 2.399;
  const radius = 0.4 + (i % 3) * 0.16;
  return [Math.cos(angle) * radius, (i % 2) * 0.12, Math.sin(angle) * radius];
});

export const PICKLE_SEEDS: Spot[] = (() => {
  const rand = rand32(3177);
  const out: Spot[] = [];
  PICKLE_SPOTS.forEach(([x, yf, z], i) => {
    for (let k = 0; k < 4; k++) {
      const a = i * 1.7 + k * 1.57;
      out.push({
        // pos[1] 存的是「所在那一片的高度比例」，渲染时再乘 thickness
        pos: [x + Math.cos(a) * 0.15, yf, z + Math.sin(a) * 0.15],
        rot: [0, a, 0],
        scale: [0.8 + rand() * 0.4, 0.6 + rand() * 0.3, 1.1 + rand() * 0.5],
      });
    }
  });
  return out;
})();

/**
 * 洋葱片：7 块从洋葱球上切下来的大弧片
 *
 * 不再撒小丁 —— 用户要的是「大块的洋葱」，碎屑只会让整层看起来像
 * 一堆半透明的塑料纸。每块有内半径、外半径、张角三件事，
 * 沿方位角分布，彼此压着边，读起来是一整层被掰开的洋葱。
 *
 * y 是高度比例（× thickness），故意错开：真实的一层洋葱是一块压一块的。
 */
export interface OnionWedge {
  rIn: number;
  rOut: number;
  /** 张角（弧度） */
  sweep: number;
  rotY: number;
  y: number;
  seed: number;
}

export const ONION_WEDGES: OnionWedge[] = [
  // 外圈的四大段：这才是「一块洋葱」。上一版每段 1.7–2.0 rad、七段拼满，
  // 叠起来正好合成一个完整的圆盘 —— 看起来像一只有裂纹的塑料盘子。
  // 现在每段 70°–84°，段与段之间留一道缝，能看见下面的料；
  // 缝不能太大，否则整层变成一堆碎片。
  { rIn: 0.4, rOut: 0.64, sweep: 1.42, rotY: 0.15, y: 0.3, seed: 1.0 },
  { rIn: 0.43, rOut: 0.62, sweep: 1.34, rotY: 1.62, y: 0.25, seed: 2.0 },
  { rIn: 0.38, rOut: 0.62, sweep: 1.46, rotY: 3.1, y: 0.33, seed: 3.0 },
  { rIn: 0.45, rOut: 0.61, sweep: 1.22, rotY: 4.55, y: 0.23, seed: 4.0 },
  // 内圈三段：压在缺口上，把中心补出厚度，同时不把缺口全堵死
  { rIn: 0.1, rOut: 0.34, sweep: 1.45, rotY: 0.95, y: 0.56, seed: 5.0 },
  { rIn: 0.12, rOut: 0.36, sweep: 1.3, rotY: 2.55, y: 0.63, seed: 6.0 },
  { rIn: 0.08, rOut: 0.32, sweep: 1.25, rotY: 4.1, y: 0.51, seed: 7.0 },
];

/**
 * 脆衣表面的碎屑：只挂在侧壁上
 *
 * 顶面的碎屑没法跟着旋转体的弧面走 —— 铺在 0.96h 的平面上，
 * 而半径 0.9 处的顶面实际只到 0.9h，于是每一颗都悬在半空。
 * 顶面的颗粒感现在交给 crinkleGeometry 做进轮廓里，
 * 碎屑只负责「侧壁上炸出来的毛刺」这一件事。
 */
export const CRUMB_BITS: Spot[] = (() => {
  const rand = rand32(6621);
  return Array.from({ length: 72 }, () => {
    const a = rand() * Math.PI * 2;
    // 半径收在 0.93 以内：踩到轮廓线外，碎屑就会悬在饼缘外面，
    // 像几颗撒在空气里的方糖
    const r = 0.925 + rand() * 0.02;
    return {
      pos: [Math.cos(a) * r, 0.3 + rand() * 0.5, Math.sin(a) * r] as [number, number, number],
      rot: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI] as [number, number, number],
      scale: [0.5 + rand() * 0.7, 0.4 + rand() * 0.5, 0.5 + rand() * 0.7] as [
        number,
        number,
        number,
      ],
    };
  });
})();

/**
 * 炸鸡外壳的「边角块」：把剪影打毛
 *
 * 碎屑（CRUMB_BITS）只有 0.05 大小，远看是一层毛边，轮廓依旧是
 * 一条干净的圆弧 —— 于是整块炸鸡读成「一张刷了层颗粒的饼」。
 * 炸鸡真正好认的地方是**边缘鼓出来的几疙瘩面衣**：
 * 所以这里放大三倍，半径压到 0.9–0.975，让它正好骑在轮廓线上。
 */
export const CRUST_LUMPS: Spot[] = (() => {
  const rand = rand32(3377);
  return Array.from({ length: 44 }, () => {
    const a = rand() * Math.PI * 2;
    // 0.87–0.95：大半埋在饼体里，只鼓出来一点。
    // 上一版放到 0.9–0.975 还放大三倍，结果是一圈插在边缘的纸片。
    const r = 0.87 + rand() * 0.08;
    return {
      pos: [Math.cos(a) * r, 0.1 + rand() * 0.76, Math.sin(a) * r] as [number, number, number],
      rot: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI] as [number, number, number],
      scale: [0.9 + rand() * 0.6, 0.7 + rand() * 0.5, 0.9 + rand() * 0.6] as [
        number,
        number,
        number,
      ],
    };
  });
})();

/**
 * 炸鸡顶面的碎壳：贴在**面**上，不是只有一圈毛边
 *
 * 之前所有的碎屑都只挂在侧壁上（理由是「顶面的碎屑会悬空」）——
 * 于是顶面只剩下 crinkle 推出来的细密噪声，远看是一张撒了燕麦的饼干。
 * 真实炸鸡的顶面是一层一层翻起来的壳。
 *
 * 位置直接铺在轮廓平顶下面一点点：脆衣的轮廓在 r≤0.85 处已经接近 y=0.95h，
 * 所以这一批放在 0.9–0.96h，一半埋进壳里、一半翻出来。
 */
export const TOP_CRUST: Spot[] = (() => {
  const rand = rand32(9013);
  return Array.from({ length: 54 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 0.14 + Math.sqrt(rand()) * 0.72;
    return {
      pos: [Math.cos(a) * r, 0.9 + rand() * 0.06, Math.sin(a) * r] as [number, number, number],
      rot: [(rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7] as [
        number,
        number,
        number,
      ],
      scale: [0.75 + rand() * 0.85, 0.55 + rand() * 0.4, 0.75 + rand() * 0.85] as [
        number,
        number,
        number,
      ],
    };
  });
})();

/**
 * 薯饼上的三级薯丝：底层长丝、粗丝、细丝
 *
 * 上一版是所有薯丝都摞在饼胚顶上、长度还到了半径的一半，
 * 结果薯饼变成一个「鸟窝」。真实的薯饼是压实的：
 * 丝要短、要嵌进饼体里、要从缝里透出来，不是铺在表面。
 * pos[1] 现在存的是「高度比例」（0 = 饼底、1 = 顶面），渲染时乘 thickness。
 */
export function hashShreds(seed: number, count: number): Spot[] {
  const rand = rand32(seed);
  return Array.from({ length: count }, () => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.86;
    // 一半顺着切线、一半斜着乱插：全顺切线是一层「纤维板」，
    // 全随机又变成一撮稻草。混着来才是压实的薯丝。
    const tangential = rand() > 0.42;
    return {
      pos: [Math.cos(a) * r, 0.55 + rand() * 0.46, Math.sin(a) * r] as [number, number, number],
      rot: [
        (rand() - 0.5) * 0.34,
        tangential ? a + Math.PI / 2 + (rand() - 0.5) * 1.7 : rand() * Math.PI * 2,
        (rand() - 0.5) * 0.26,
      ] as [number, number, number],
      scale: [0.55 + rand() * 0.7, 1, 1] as [number, number, number],
    };
  });
}

/** 肉排的炙烤纹：三条 */
export const GRILL_MARKS: { z: number; rot: number }[] = [
  { z: -0.46, rot: 0.32 },
  { z: 0, rot: 0.32 },
  { z: 0.46, rot: 0.32 },
];

export interface SeedSpot {
  pos: [number, number, number];
  rot: [number, number, number];
}

/**
 * 上层面包的芝麻
 *
 * 老做法是把芝麻撒在半径 0.95 的半球上 —— 但面包是「压扁的旋转体」，
 * 半球在圆顶肩部远在面包外面、在靠近顶心处又整个埋进面包里，
 * 结果 26 粒只有顶点那一粒露出来。
 *
 * 现在沿轮廓本身取样：位置直接落在旋转面上，朝向用该点的外法线，
 * 于是每一粒都严丝合缝地贴着面包。
 */
export function sesameSpots(thickness: number, count = 42): SeedSpot[] {
  const GOLD = 2.39996; // 黄金角，螺旋铺开不会出现明显的行列感
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const e = new THREE.Euler();
  const rand = rand32(2024);

  // 轮廓第 4 点起：再往下法线接近水平，芝麻会像钉子一样扎在侧壁上
  const uStart = 4 / (BUN_TOP.length - 1);
  const uEnd = 0.94;

  const out: SeedSpot[] = [];
  for (let i = 0; i < count; i++) {
    const u = uStart + (uEnd - uStart) * (i / (count - 1));
    const [r, yf] = sampleProfile(BUN_TOP, u);
    const [nr, ny] = surfaceNormal(BUN_TOP, u, thickness);
    const a = i * GOLD;

    n.set(Math.cos(a) * nr, ny, Math.sin(a) * nr).normalize();
    q.setFromUnitVectors(up, n);
    spin.setFromAxisAngle(n, i * 1.71); // 绕法线自转，避免看起来像排好的网格
    q.premultiply(spin);
    e.setFromQuaternion(q);

    out.push({
      // 半径 1.03 是 BUN_TOP 的最大半径
      pos: [Math.cos(a) * r * 1.005, yf * thickness + 0.004 + rand() * 0.002, Math.sin(a) * r * 1.005],
      rot: [e.x, e.y, e.z],
    });
  }
  return out;
}

/** 酱料的螺旋路径：手挤的酱不会像弹簧 */
export function sauceCurve(radius = 0.6, height = 0.06) {
  const pts: THREE.Vector3[] = [];
  const turns = 3.1;

  for (let i = 0; i <= 34; i++) {
    const t = i / 36;
    const a = 0.5 + t * turns * Math.PI * 2;
    // 圈距不均匀，整条螺旋还稍微偏心
    const r = 0.12 + t * (radius - 0.12) + Math.sin(t * 7.4) * 0.018;
    const cx = Math.sin(t * 3.1 + 0.6) * 0.032;
    const cz = Math.cos(t * 2.6) * 0.026;
    pts.push(
      new THREE.Vector3(
        Math.cos(a) * r + cx,
        height * 0.55 + Math.sin(t * 9.4) * height * 0.09,
        Math.sin(a) * r + cz,
      ),
    );
  }

  // 收尾往外拖一小段，挤完提起来的那一下
  const aEnd = 0.5 + turns * Math.PI * 2;
  const tail = 0.11;
  pts.push(
    new THREE.Vector3(
      Math.cos(aEnd) * (radius - 0.04) + Math.cos(aEnd + 1.4) * tail,
      height * 0.58,
      Math.sin(aEnd) * (radius - 0.04) + Math.sin(aEnd + 1.4) * tail,
    ),
  );

  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

/** 酱滴：散在螺旋空隙里的小溅落 */
export const SAUCE_DROPS: Spot[] = (() => {
  const rand = rand32(4455);
  return Array.from({ length: 9 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 0.16 + rand() * 0.5;
    const s = 0.028 + rand() * 0.027;
    return {
      pos: [Math.cos(a) * r, s * 0.26, Math.sin(a) * r] as [number, number, number],
      rot: [0, rand() * Math.PI * 2, 0] as [number, number, number],
      scale: [s * (0.8 + rand() * 0.8), s * 0.28, s * (0.8 + rand() * 0.8)] as [
        number,
        number,
        number,
      ],
    };
  });
})();

/** 生菜叶尖：探出饼缘的叶子。数量比之前多、单片更短，
 *  一整圈看过去才是「卷起来的生菜」而不是七片突出的塑料叶 */
export const LETTUCE_BLADES: Spot[] = (() => {
  const rand = rand32(7712);
  // 11 → 5：绕一圈插满叶尖，加上三片叶盘自己的波浪边，
  // 远看就是一圈「草」，而且大半被叶盘压住，只露出一截白绿色的尖 ——
  // 那不是叶尖，那是碎屑。留 5 片、抬到叶盘表面之上，才读成叶子。
  return Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + (rand() - 0.3) * 0.9;
    const r0 = 0.58 + rand() * 0.18;
    return {
      pos: [Math.cos(a) * r0, 0, Math.sin(a) * r0] as [number, number, number],
      // 叶尖朝外：几何沿 +X 长出，绕 Y 转 -a 才对得上方位角
      rot: [(rand() - 0.5) * 0.3, -a, (rand() - 0.5) * 0.3] as [number, number, number],
      scale: [0.4 + rand() * 0.22, 1, 1.0 + rand() * 0.45] as [number, number, number],
    };
  });
})();
