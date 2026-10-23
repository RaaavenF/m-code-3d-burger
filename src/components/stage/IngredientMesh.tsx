'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import type { Ingredient } from '@/types/burger';
import {
  BUN_BOTTOM_PROFILE,
  BUN_TOP_PROFILE,
  CRUMB_BITS,
  CRUST_LUMPS,
  TOP_CRUST,
  LETTUCE_BLADES,
  ONION_WEDGES,
  PICKLE_SEEDS,
  PICKLE_SPOTS,
  PROFILE_BY_KIND,
  SAUCE_DROPS,
  bakeRadialGradient,
  bakeVerticalGradient,
  chipGeometry,
  crinkleGeometry,
  hashShreds,
  latheFromProfile,
  leafBladeGeometry,
  leafDiscGeometry,
  cheeseSliceGeometry,
  onionWedgeGeometry,
  projectHybridUV,
  squarifyGeometry,
  wavySlabGeometry,
  sauceCurve,
  sesameSpots,
  shredGeometry,
  splatGeometry,
  taperedTubeGeometry,
  wobbleGeometry,
  type SeedSpot,
} from './geometry';
import {
  baconTexture,
  grainTexture,
  grillTexture,
  leafTexture,
  onionTexture,
  speckleTexture,
  tomatoTexture,
  type SpeckKind,
} from './textures';

/**
 * 材质共享
 *
 * 15 层汉堡若每层新建 material，会多出 15 个 shader program 变体。
 * 按「颜色 + 粗糙度 + 面朝向 + 纹理」做模块级缓存，同参数只建一次。
 */
const materialCache = new Map<string, THREE.MeshStandardMaterial>();

interface MatOpts {
  roughness?: number;
  grain?: 'fine' | 'coarse' | 'char' | 'leaf' | 'none';
  bumpScale?: number;
  side?: THREE.Side;
  /** 顶点色渐变：材质主色必须给白色，否则会乘掉渐变 */
  vertexColors?: boolean;
  /** 彩色斑点贴图：给了它就不要再用食材主色，否则颜色会被乘两次 */
  speck?: SpeckKind;
  /** 叶脉贴图（生菜专用） */
  leafMap?: boolean;
  /** 培根的脂肪纹贴图（0/1/2 三套走向，三条各用一套） */
  baconMap?: 0 | 1 | 2;
  /** 番茄横切面贴图 */
  tomatoMap?: boolean;
  /** 洋葱同心层理贴图（UV 沿半径方向展开） */
  onionMap?: boolean;
  /** 炙烤纹 / 铁板压痕贴图 */
  grillMap?: 'beef' | 'grilled';
  metallic?: number;
  /** 透明薄膜（酱料打底） */
  opacity?: number;
}

function getMaterial(color: string, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const {
    roughness = 0.7,
    grain = 'none',
    bumpScale = 0.06,
    side = THREE.FrontSide,
    vertexColors = false,
    speck,
    leafMap = false,
    baconMap,
    tomatoMap = false,
    onionMap = false,
    grillMap,
    metallic = 0.02,
    opacity = 1,
  } = opts;
  const key = [
    color,
    roughness,
    grain,
    bumpScale,
    side,
    vertexColors ? 'vc' : '',
    speck ?? '',
    leafMap ? 'leaf' : '',
    baconMap !== undefined ? `bacon${baconMap}` : '',
    tomatoMap ? 'tomato' : '',
    onionMap ? 'onion' : '',
    grillMap ?? '',
    metallic,
    opacity,
  ].join('|');

  const hit = materialCache.get(key);
  if (hit) return hit;

  const bacon = baconMap !== undefined ? baconTexture(baconMap) : null;
  const grill = grillMap ? grillTexture(grillMap) : null;
  const map = speck
    ? speckleTexture(speck)
    : bacon
      ? bacon
      : grill
        ? grill
        : tomatoMap
          ? tomatoTexture()
          : onionMap
            ? onionTexture()
            : leafMap
              ? leafTexture()
              : null;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(map ? '#FFFFFF' : color),
    roughness,
    metalness: metallic,
    side,
    vertexColors,
    // 平滑着色 + 法线微起伏，比 flatShading 更像食物；
    // 只有脆衣类保留平面着色，那是「面包糠颗粒」该有的样子。
    flatShading: false,
    // 传 null 而不是 undefined：THREE 的 setValues 遇到 undefined 会打警告
    map: map ?? null,
    bumpMap: speck
      ? speckleTexture(speck)
      : bacon
        ? bacon
        : grill
          ? grill
          : tomatoMap
            ? tomatoTexture() ?? null
            : grainTexture(grain) ?? null,
    bumpScale,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });

  materialCache.set(key, mat);
  return mat;
}

/** 芝士片做成 1.74 见方的方片。
 *
 *  这一版是「片」，不是「化开的一摊」：四角必须能从面包、生菜底下探出来，
 *  这是它在成品汉堡里唯一的辨识信号。
 *
 *  算一下：超椭圆（n=4.2）的角半径是轴半径的 1.189 倍。
 *    size 1.18 → 角半径 0.70 —— 连番茄片（0.78）都盖得住，永远看不见
 *    size 1.74 → 角半径 1.035 —— 刚好压过面包（1.0）一线，露一角
 *  再大就会伸出汉堡轮廓之外，变成一张飞在旁边的黄纸。
 */
const CHEESE_SIZE = 1.62;

/** 培根：三条有厚度的波浪肉条，模块级建一次就够。
 *  长度收在 1.12 以内 —— 探出肉排太多会像几根薯条横在汉堡上。
 *  厚度收到 0.026：0.034 时侧边太厚，侧面看像三块塑料瓦。 */
const BACON_GEO_A = wavySlabGeometry(1.04, 0.26, 0.024, 0.042, 28);
const BACON_GEO_B = wavySlabGeometry(0.92, 0.22, 0.022, 0.038, 24);
const BACON_GEO_C = wavySlabGeometry(0.8, 0.19, 0.02, 0.034, 22);

interface Geo {
  points: THREE.Vector2[];
  bunBody: THREE.BufferGeometry | null;
  bunFace: THREE.BufferGeometry | null;
  sesame: SeedSpot[];
  body: THREE.BufferGeometry | null;
  leafOuter: THREE.BufferGeometry | null;
  leafMid: THREE.BufferGeometry | null;
  leafInner: THREE.BufferGeometry | null;
  leafBlade: THREE.BufferGeometry | null;
  cheese: THREE.BufferGeometry | null;
  sauceTube: THREE.BufferGeometry | null;
  sauceFilm: THREE.BufferGeometry | null;
  tomatoWall: THREE.BufferGeometry | null;
  tomatoFace: THREE.BufferGeometry | null;
  pickleBody: THREE.BufferGeometry | null;
  pickleFace: THREE.BufferGeometry | null;
  onionWedges: THREE.BufferGeometry[];
  crumb: THREE.BufferGeometry | null;
  shredLong: THREE.BufferGeometry | null;
  shredCoarse: THREE.BufferGeometry | null;
  shredFine: THREE.BufferGeometry | null;
  shredWall: THREE.BufferGeometry | null;
}

const EMPTY: Geo = {
  points: [],
  bunBody: null,
  bunFace: null,
  sesame: [],
  body: null,
  leafOuter: null,
  leafMid: null,
  leafInner: null,
  leafBlade: null,
  cheese: null,
  sauceTube: null,
  sauceFilm: null,
  tomatoWall: null,
  tomatoFace: null,
  pickleBody: null,
  pickleFace: null,
  onionWedges: [],
  crumb: null,
  shredLong: null,
  shredCoarse: null,
  shredFine: null,
  shredWall: null,
};

/** 把几何整体抬到「底面在 y=0」——叶片的翻边会垂到 0 以下 */
function groundGeo(geo: THREE.BufferGeometry, lift = 0) {
  geo.computeBoundingBox();
  const minY = geo.boundingBox?.min.y ?? 0;
  geo.translate(0, -minY + lift, 0);
  return geo;
}

/**
 * 按食材类型生成几何。
 * 一次性算好，几何只依赖 (geometry, h)，不随交互变化。
 */
function buildGeometry(geometry: Ingredient['geometry'], h: number): Geo {
  const g: Geo = { ...EMPTY };

  switch (geometry) {
    /* ── 面包 ── */
    case 'bunTop': {
      // 轮廓只维护一份，就在 geometry.ts —— 芝麻也要沿同一条曲线取样，
      // 两处各抄一份迟早会错位
      const body = new THREE.LatheGeometry(
        latheFromProfile(BUN_TOP_PROFILE, h, 64),
        64,
      );
      // ⚠️ 这里同时挂了 speck 贴图和顶点色，THREE 会把两者**相乘**。
      //    上一版渐变给的是 #E9B675 → #C07B33，乘上贴图底色 #E0A05A，
      //    顶面只剩 (#C07B33 × #E0A05A) ≈ #A85A12 —— 一个全麦面包。
      //    所以顶点色在这里只能当「轻微压暗」的乘子用：
      //    底部接近白、顶面压到 0.9 左右，颜色交给贴图。
      g.bunBody = bakeVerticalGradient(
        projectHybridUV(body, 2.1),
        new THREE.Color('#FFFBF4'),
        new THREE.Color('#E8BC8C'),
      );
      g.points = latheFromProfile([[0, 0], [1, 1]], h, 8);
      g.sesame = sesameSpots(h, 96);
      break;
    }

    case 'bunBottom': {
      // 下层面包的顶面必须是一块「切开的平顶」，不是圆顶。
      // 圆穹会在切面之外顶出一圈被拉成竖条纹的外皮，像贝果的内壁。
      g.bunBody = projectHybridUV(
        new THREE.LatheGeometry(latheFromProfile(BUN_BOTTOM_PROFILE, h, 64), 64),
        2.1,
      );
      // 平切面：一张圆片压在平顶之上一点点。
      //
      // ⚠️ 半径必须**盖满**平顶（轮廓最后收到 0.84），并且略微多出一点。
      //    上一版给 0.835，比平顶窄了 0.005 —— 那一道缝里露出的是
      //    外皮材质，在顶面围出一圈浅色细环；再叠一个烤褐 Torus，
      //    就成了「面包片上画了一个圈」。切面自己贴满到边，圈自然消失。
      const face = new THREE.CircleGeometry(0.843, 64);
      face.rotateX(-Math.PI / 2);
      // 瓤的「立体感」靠三样东西，缺一样就退回「一块奶油」：
      //  ① 贴图里有真的气孔（见 textures.ts / crumb 的 repeat 说明）
      //  ② bump 让孔有深浅 —— 0.006 几乎看不出来，面包瓤其实是蓬松不平的
      //  ③ 顶点色从圆心到边缘压深一档：切开的面包最外圈是**被压实的瓤**，
      //     颜色比中心深半档，也正好和一圈外皮接上，不会「飘」在上面
      g.bunFace = bakeRadialGradient(
        face,
        new THREE.Color('#FFFAF0'),
        new THREE.Color('#C89A63'),
        0.55,
      );
      g.bunFace.translate(0, h * 1.0015, 0);
      g.points = latheFromProfile([[0, 0], [1, 1]], h, 8);
      break;
    }

    /* ── 生菜 ── */
    case 'lettuce': {
      // 叶盘自己会「叶心鼓起 + 叶缘下塌」，铺开后总高度约是参数高度的 1.5 倍，
      // 所以这里给的参数比 thickness 略小，正好收在层高附近。
      // 三层而不是两层：一层太薄的绿片在汉堡里几乎看不见，
      // 三层错开角度、逐层变小变亮，才读得出「一卷生菜」的厚度。
      //
      // 三层的颜色差异全靠顶点色：材质上有 leafMap 时主色会被强制成白，
      // 三个 mesh 传不同颜色参数是无效的。所以这里烘三层不同的
      // 「叶心白 → 叶缘压暗」乘子 —— 外层压得最狠（它被压在最下面），
      // 内层几乎不压（叶心最亮）。
      // 三层不是「三个同心圆盘」，而是**三片错开的叶子**。
      //
      // 同心圆盘就算每层种子不同、颜色分档，叠起来的外轮廓仍是一个圆 ——
      // 远看就是「一大片叶子」，看不出有叶片。真实的汉堡生菜是两三片
      // 整叶被压弯了摊在一起：每片有自己的边、自己的朝向，圆心也各不相同。
      // 所以真正的区分手段是**偏心 + 旋转 + 在 z 向拍扁成椭圆**，
      // 而不是换颜色（位移写在渲染那段，几何只负责叶形本身）。
      //
      // 三层叶心的「乘子」仍一档比一档浅：外层被压在最下面、浸着肉汁，
      // 内层是刚翻出来的新叶。
      const white = new THREE.Color('#DEEFBE');
      g.leafOuter = groundGeo(
        bakeRadialGradient(
          leafDiscGeometry(0.9, h * 0.52, 8, 24, 208, 0),
          white,
          new THREE.Color('#8FB548'),
        ),
        h * 0.02,
      );
      g.leafMid = groundGeo(
        bakeRadialGradient(
          leafDiscGeometry(0.87, h * 0.5, 6, 22, 188, 2.6),
          white,
          new THREE.Color('#A6CA5E'),
        ),
        h * 0.02,
      );
      g.leafInner = groundGeo(
        bakeRadialGradient(
          leafDiscGeometry(0.63, h * 0.46, 5, 18, 156, 4.9),
          new THREE.Color('#F2FADC'),
          new THREE.Color('#C3DB84'),
        ),
        h * 0.02,
      );
      // 叶尖只探出饼缘一点点。太长会变成一圈绿花环；
      // cup 压到 0.2，叶片几乎是平铺的，才不像从碗里插出来的塑料桨。
      // 长度 0.34 → 0.30、半宽 0.16 → 0.2：细长的尖端在暖光下就是一根草，
      // 宽一点的钝尖才读成「一片叶子的边」。
      g.leafBlade = leafBladeGeometry(0.3, 0.2, h * 0.85, 0.2);
      break;
    }

    /* ── 芝士 ── */
    case 'cheese': {
      // 芝士片本身的颜色就用顶点色烘进去（中心偏亮、四角偏深），
      // 不再挂彩色斑点贴图 —— 一张均匀的橙黄片上撒高对比颗粒，
      // 远看像一块苏打饼干，不像一片正在化的芝士。
      g.cheese = bakeRadialGradient(
        cheeseSliceGeometry(CHEESE_SIZE, h),
        // 芝士片是饱和的橙黄，不是奶黄。
        // #FFCF54 那版在 1.0 曝光 + ACES 下被推成一团奶油色，
        // 夹在汉堡里像一块「煎蛋皮」。
        //
        // 中心到边缘只差一档（#FFC63E → #F2A61A）：
        // 原来的 #FFC23A → #E28A0B 落在一片**平**的方片上，
        // 那圈很重的暗边会被读成「中间鼓起来了」—— 片就又不平了。
        new THREE.Color('#FFD04A'),
        new THREE.Color('#F2A619'),
      );
      break;
    }

    /* ── 番茄 ── */
    case 'tomato': {
      // 半径 0.78：比面包（0.93）小一圈，否则番茄会变成一个红碗，
      // 把上面的芝士和培根全兜在里面。但也别太小 —— 0.72 那版
      // 夹在生菜下面只剩一道红边，用户以为没加上。
      const R = 0.78;
      // 侧壁 0.86h、切面 0.9h：番茄片要「薄」。
      // 侧壁一旦高过切面，从斜角看就是一只深红色的碗，不是一片番茄。
      g.tomatoWall = new THREE.CylinderGeometry(R, R * 0.99, h * 0.86, 44, 1, true);
      g.tomatoWall.translate(0, h * 0.43, 0);

      // 切面只留一张圆片 + 一条贴图。心室、隔膜、籽、果心全画在图里 ——
      // 用几何拼出来的楔形是硬边等宽的，一圈排下来像风车 logo。
      const face = new THREE.CircleGeometry(R, 56);
      face.rotateX(-Math.PI / 2);
      g.tomatoFace = face;
      g.tomatoFace.translate(0, h * 0.9, 0);
      break;
    }

    /* ── 酸黄瓜 ── */
    case 'pickle': {
      const R = 0.2;
      g.pickleBody = wobbleGeometry(
        new THREE.CylinderGeometry(R, R, h, 18, 1, false),
        8,
        0.07,
      );
      const face = new THREE.CircleGeometry(R * 0.93, 18);
      face.rotateX(-Math.PI / 2);
      g.pickleFace = face;
      break;
    }

    /* ── 洋葱 ── */
    case 'onion': {
      // 每块是一个有厚度的环形扇区。厚度取层高的 1/4 ——
      // 再薄就成了一张纸，再厚就叠不出「一块压一块」的层次。
      //
      // 顶点色负责「内缘乳白 → 外缘暖褐」：洋葱的层理是从球心往外的
      // 一圈圈细胞，单纯一个颜色只能读成塑料片。
      //
      // 外缘原来是 #E7C3D2 —— 一个偏冷、偏紫的浅粉。配上 roughness 0.32
      // 的镜面高光，整块读成「白瓷片」：瓷器就是冷白 + 强高光。
      //
      // 但暖色也不能压过头：上一版压到 #DBB195，中段（顶点色混到 50%）
      // 就落在 #EDD6C3 这个「焦糖色」上，洋葱读成了刨花。
      // 现在只把**色相**往暖里推、明度基本不动（#EBCFB4），
      // 高光交给材质 —— 洋葱的「暖」应该来自它对着光的通透感，
      // 而不是来自一层深色。
      g.onionWedges = ONION_WEDGES.map(w =>
        groundGeo(
          bakeRadialGradient(
            onionWedgeGeometry(w.rIn, w.rOut, w.sweep, h * 0.32, w.seed),
            new THREE.Color('#FFFCF3'),
            new THREE.Color('#E5C4A6'),
          ),
        ),
      );
      break;
    }

    /* ── 脆衣类（脆鸡排 / 麦辣鸡腿排）── */
    case 'pattyCrispy':
    case 'pattySpicy': {
      const isSpicy = geometry === 'pattySpicy';
      // 段数从 48 提到 80：颗粒感要靠顶点位移做出来，
      // 网格不够密，噪声采样不到点上，推出来是锯齿不是面包糠
      const body = new THREE.LatheGeometry(
        latheFromProfile(
          isSpicy ? PROFILE_BY_KIND.pattySpicy! : PROFILE_BY_KIND.pattyCrispy!,
          h,
          80,
          isSpicy ? 0.975 : 0.99,
        ),
        80,
      );
      // 麦辣鸡腿排是「一整块鸡腿肉」：沿一个方向略长、另一个方向略窄。
      // 不压这一下，它和脆鸡排的剪影一模一样，只有颜色深浅之分。
      if (isSpicy) body.scale(1.055, 1, 0.955);

      // 炸衣的疙瘩：两层噪声，低频做大块起伏，高频做小颗粒。
      // 麦辣的壳更厚更粗（整块腿肉裹粉），振幅给到 0.021。
      crinkleGeometry(body, isSpicy ? 0.021 : 0.019, isSpicy ? 9.4 : 8.5, isSpicy ? 17 : 13, 3);
      // 顶视投影 UV：柱面 UV 在顶心会把贴图挤成一把扇子。
      //
      // ⚠️ 轮廓抖动幅度从 0.022 提到 0.042、频率 7→12：
      //    炸鸡之所以是炸鸡，先看剪影。0.022 在半径 1.0 上只有 2%，
      //    远看还是一条干净的弧线 —— 看起来就是一张刷了颗粒的饼。
      g.body = wobbleGeometry(
        projectHybridUV(body, 2.1),
        isSpicy ? 11 : 12,
        isSpicy ? 0.038 : 0.044,
      );
      g.crumb = chipGeometry(0.05, 0.038, 0.046, 77);
      break;
    }

    /* ── 薯饼 ── */
    case 'hashbrown': {
      const body = new THREE.LatheGeometry(
        // 轮廓的高度一律归一化到 0–1，最后乘以 thickness，
        // 否则「数据里 0.21、模型只有 0.03」这种错位迟早会踩到
        latheFromProfile(PROFILE_BY_KIND.hashbrown!, h, 76, 1.0),
        76,
      );
      // 压实的薯泥表面：细密的小起伏，和薯丝的粗颗粒形成两层质感
      crinkleGeometry(body, 0.008, 14, 41, 2);
      // 齿边：压模切出来的薯饼边缘不是光滑的圆。
      // 频率 14、幅度 0.024 —— 频率低于 10 会读成「被咬了一口的圆饼」，
      // 高于 24 在 76 段上又采不到点，退化成锯齿。
      g.body = wobbleGeometry(projectHybridUV(body, 2.1), 14, 0.024);
      // 三级薯丝：长度收短（长丝会伸到饼缘外，整块变成鸟窝），
      // 但**粗细要提上来**：0.024 的丝在 600px 的画面里只剩一根头发，
      // 薯饼的光板感就是这么来的。
      g.shredLong = shredGeometry(0.15, 0.028, 0.019, 0.008);
      g.shredCoarse = shredGeometry(0.105, 0.03, 0.022, 0.011);
      g.shredFine = shredGeometry(0.075, 0.019, 0.014, 0.009);
      g.shredWall = shredGeometry(0.06, 0.017, 0.013, 0.007);
      break;
    }

    /* ── 肉排（牛 / 板烧 / 鳕鱼）── */
    case 'pattyBeef':
    case 'pattyGrilled':
    case 'pattyFish': {
      const isFish = geometry === 'pattyFish';
      const isGrilled = geometry === 'pattyGrilled';

      const body = new THREE.LatheGeometry(
        latheFromProfile(
          PROFILE_BY_KIND[geometry]!,
          h,
          72,
          // 牛肉饼比顶包略宽一点点就够了。
          // 0.99 那版比上下两片面包都宽一圈，从正面看像夹了一块轮胎。
          isFish ? 0.94 : isGrilled ? 1.0 : 0.94,
        ),
        72,
      );

      // 鳕鱼排是圆角方：超椭圆重映射。
      // 五种肉里只有它是方的 —— 剪影是最强的辨识信号，
      // 光靠颜色分，用户永远记不住哪块是哪块。
      if (isFish) {
        squarifyGeometry(body, 6);
        // 斜着摆 24°：正对着看是「田字格」，斜过来才像一块鱼排
        body.rotateY(0.42);
      }
      // 板烧被铁板压成椭圆：长轴顺着汉堡的左右方向
      if (isGrilled) body.scale(1.05, 1, 0.92);

      // 肉表面的「手压感」：
      //  · 牛肉最粗（绞肉的颗粒 + 烤裂）
      //  · 鳕鱼的面衣细密（裹粉再炸，颗粒比鸡排细）
      //  · 板烧被铁板压过，几乎是光的 —— 振幅 0.005 只够留一点组织纹理
      crinkleGeometry(
        body,
        isFish ? 0.008 : isGrilled ? 0.005 : 0.0145,
        isFish ? 11 : 7,
        isFish ? 31 : 23,
        2,
      );
      g.body = wobbleGeometry(
        projectHybridUV(body, 2.1),
        // 方形的边缘不能再抖动，一抖角就糊了
        isFish ? 2 : isGrilled ? 3 : 6,
        isFish ? 0.002 : isGrilled ? 0.012 : 0.024,
      );
      break;
    }

    /* ── 酱料 ── */
    case 'sauce': {
      const curve = sauceCurve(0.6, h);
      const hh = h;
      g.sauceTube = taperedTubeGeometry(curve, 150, 12, t => {
        if (t < 0.06) return 0.03 + (t / 0.06) * 0.022;
        if (t > 0.88) return Math.max(0.0015, 0.05 * (1 - (t - 0.88) / 0.12));
        return 0.05 + Math.sin(t * 8.2) * 0.004;
      });
      // 酱条中心在 0.55h 附近，整体压到 0..h 之间
      g.sauceTube.translate(0, hh * 0.18, 0);
      g.sauceFilm = splatGeometry(0.56, 34);
      g.sauceFilm.translate(0, hh * 0.02, 0);
      break;
    }

    default:
      g.points = latheFromProfile([[0, 0], [1, 1]], h, 8);
      g.body = new THREE.LatheGeometry(g.points, 40);
  }

  return g;
}

interface Props {
  ingredient: Ingredient;
}

/**
 * 单个食材的 3D 外形。
 *
 * 约定：几何体底面始终在本地 y = 0，顶面在 y = thickness。
 * 这样上层组的 scale.y 压缩时底部不会位移，「压扁」才成立。
 *
 * ⚠️ 所有 hook 必须在分支之前无条件调用 —— 食材类型是运行期才确定的，
 * 一旦把 useMemo 写进 if 里，层数变化导致分支切换时 hook 顺序就乱了。
 */
export function IngredientMesh({ ingredient }: Props) {
  const { geometry, thickness, color } = ingredient;
  const h = thickness;

  const g = useMemo(() => buildGeometry(geometry, h), [geometry, h]);

  /* ═════════ 上层面包：圆顶 + 芝麻 ═════════ */
  if (geometry === 'bunTop') {
    return (
      <group>
        <mesh
          geometry={g.bunBody!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', {
            roughness: 0.62,
            speck: 'bunTop',
            bumpScale: 0.02,
            vertexColors: true,
          })}
        />

        <Instances limit={g.sesame.length} castShadow>
          {/* 芝麻是扁椭球：长 0.06、厚 0.012。
              之前半径 0.03、长轴放大 1.55，单粒长到 0.093 —— 接近面包
              半径的 10%，配上纯白的高光，看起来是一圈贴上去的白色糖片。
              真实芝麻大约只有面包直径的 3%，而且颜色是暖米色不是白色，
              数量也远不止 50 粒。 */}
          <sphereGeometry args={[0.017, 6, 4]} />
          <meshStandardMaterial color="#D9BB80" roughness={0.62} />
          {/* 每粒大小略不同：等大等距的一圈白点看起来是印上去的 */}
          {g.sesame.map((s, i) => (
            <Instance
              key={i}
              position={s.pos}
              rotation={s.rot}
              scale={[0.82 + (i % 5) * 0.07, 0.34, 1.2 + (i % 4) * 0.14]}
            />
          ))}
        </Instances>
      </group>
    );
  }

  /* ═════════ 下层面包：外皮 + 浅色切面 ═════════ */
  if (geometry === 'bunBottom') {
    return (
      <group>
        <mesh
          geometry={g.bunBody!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', { roughness: 0.8, speck: 'bunBottom', bumpScale: 0.018 })}
        />
        <mesh
          geometry={g.bunFace!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', {
            roughness: 0.92,
            speck: 'crumb',
            bumpScale: 0.018,
            vertexColors: true,
            side: THREE.DoubleSide,
          })}
        />
      </group>
    );
  }

  /* ═════════ 番茄片：一张画好的横切面 ═════════ */
  if (geometry === 'tomato') {
    return (
      <group>
        {/* 果皮侧壁：开口圆柱，双面渲染，从任何角度都不会看穿。
            侧壁用比切面更深的红，切面才有「皮」这一层。 */}
        <mesh
          geometry={g.tomatoWall!}
          castShadow
          material={getMaterial('#B0301A', { roughness: 0.5, side: THREE.DoubleSide })}
        />

        {/* 切面：心室、隔膜、籽、果心全画在贴图里。
            几何拼出来的楔形是硬边等宽的，一圈排下来像风车 logo。
            粗糙度 0.42 —— 番茄汁会反光，反射太强就成塑料片了。 */}
        <mesh
          geometry={g.tomatoFace!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', {
            roughness: 0.42,
            tomatoMap: true,
            bumpScale: 0.006,
          })}
        />
      </group>
    );
  }

  /* ═════════ 芝士：有厚度的融化薄板，四角热塌 ═════════ */
  if (geometry === 'cheese') {
    return (
      <mesh
        geometry={g.cheese!}
        rotation-y={Math.PI / 4}
        castShadow
        receiveShadow
        material={getMaterial('#FFFFFF', {
          // 0.36 + metalness 0.06 是一层「釉」：高光小而锐，加上一点点金属反射，
          // 整片读成塑料奖牌。真实的芝士片是油润的、不是镜面的 ——
          // 0.46 让高光摊成一条宽亮带，metalness 归零（芝士不是金属）。
          roughness: 0.42,
          speck: 'cheese',
          grain: 'fine',
          // bump 从 0.018 降到 0.008：0.018 那版把细颗粒放得很大，
          // 在纯平的面上像一层磨砂贴膜；芝士的表面是光滑的，
          // 只需要一点点起伏让高光稍微断开。
          bumpScale: 0.012,
          metallic: 0,
          // 几何已经是闭合的薄板，不再需要双面 —— 双面会让背面法线
          // 指向反方向，塌下去的角上就出现一块莫名其妙的暗斑
          side: THREE.FrontSide,
          vertexColors: true,
        })}
      />
    );
  }

  /* ═════════ 培根：三条波浪薄片（脂肪纹走贴图） ═════════ */
  if (geometry === 'bacon') {
    /**
     * 三条要「并排错开」，不能「上下对齐」——
     * 三个条都居中、只是 y 差 0.04，结果糊成一张波浪纸。
     * 现在 z 各错 0.24，再给一点绕 Y 的转角，才读得出是三条。
     * 脂肪纹也必须各用一套贴图，否则三条看起来是同一张印花塑料。
     */
    const strips = [
      { geo: BACON_GEO_A, v: 0 as const, pos: [0, h * 0.05, -0.17] as const, rot: 0.05 },
      { geo: BACON_GEO_B, v: 1 as const, pos: [0.02, h * 0.38, 0.05] as const, rot: 0.24 },
      { geo: BACON_GEO_C, v: 2 as const, pos: [-0.03, h * 0.7, 0.24] as const, rot: -0.12 },
    ];

    return (
      <group>
        {strips.map((s, i) => (
          <group key={i} position={s.pos} rotation-y={s.rot}>
            <mesh
              geometry={s.geo}
              castShadow
              material={getMaterial('#FFFFFF', {
                roughness: 0.6,
                baconMap: s.v,
                bumpScale: 0.03,
                side: THREE.DoubleSide,
              })}
            />
          </group>
        ))}
      </group>
    );
  }

  /* ═════════ 酸黄瓜：5 片带棱的厚片 ═════════ */
  if (geometry === 'pickle') {
    return (
      <group>
        {PICKLE_SPOTS.map(([x, yf, z], i) => (
          <group key={i} position={[x, yf * h, z]} rotation-y={i * 1.7}>
            <mesh geometry={g.pickleBody!} castShadow material={getMaterial('#6E9F4A', { roughness: 0.46 })} />
            <mesh
              geometry={g.pickleFace!}
              position-y={h * 0.99}
              material={getMaterial('#9DC96E', { roughness: 0.28 })}
            />
          </group>
        ))}

        <Instances limit={PICKLE_SEEDS.length}>
          <sphereGeometry args={[0.012, 6, 4]} />
          <meshStandardMaterial color="#EEF3C9" roughness={0.42} />
          {PICKLE_SEEDS.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], s.pos[1] * h + h * 1.02, s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>
      </group>
    );
  }

  /* ═════════ 洋葱：7 块大弧片，一块压一块 ═════════ */
  if (geometry === 'onion') {
    // 完全不做透明：半透明的洋葱片一层叠一层，排序只会在穿插处
    // 闪出深浅不一的方块；而「半透」这个感觉用淡紫 + 低粗糙度就够了。
    // 上一版被骂的就是那张 opacity 0.5 的兜底圆盘 —— 整层灰白一片。
    const onionMat = getMaterial('#FFFFFF', {
      // 0.32 是瓷器的值：那么锐的高光在暖光下就是一层釉。
      // 但也不能一路哑到 0.42 —— 洋葱片是湿的，完全哑光就变成木片。
      // 0.34 留一层薄薄的、摊得很开的亮，才既是暖的又还是「生」的。
      roughness: 0.34,
      // 同心层理画在贴图里（UV 的 v 就是半径方向）。
      // 之前只给明度渐变，读出来是一块浅色塑料片 —— 洋葱没有「层」
      // 就不成立，和颜色暖不暖无关。
      onionMap: true,
      // 层线的 bump 只留 0.008：0.02 时每道线都鼓起一道棱，
      // 整片变成压花铁皮。洋葱的层是「薄厚差」，不是「槽」。
      bumpScale: 0.008,
      vertexColors: true,
      metallic: 0.04,
      side: THREE.DoubleSide,
    });

    return (
      <group>
        {g.onionWedges.map((geo, i) => (
          <mesh
            key={i}
            geometry={geo}
            position-y={ONION_WEDGES[i].y * h}
            rotation-y={ONION_WEDGES[i].rotY}
            castShadow
            receiveShadow
            material={onionMat}
          />
        ))}
      </group>
    );
  }

  /* ═════════ 薯饼：饼胚 + 三级薯丝 ═════════ */
  if (geometry === 'hashbrown') {
    const long = hashShreds(2001, 320);
    const coarse = hashShreds(3002, 230);
    // 细丝这一层要**铺在面上**：薯饼好认的地方是顶面那层密实的丝，
    // 不是饼体本身。原来它和粗丝挤在同一个高度带，被饼体吃掉了一半。
    const fine = hashShreds(4003, 460);
    const wall = hashShreds(5004, 150);

    return (
      <group>
        <mesh
          geometry={g.body!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', { roughness: 0.92, speck: 'hash', bumpScale: 0.02 })}
        />

        {/* 薯丝是「嵌进饼里」的，pos[1] 是高度比例 —— 不是全摞在顶上 */}
        <Instances limit={long.length} geometry={g.shredLong!} castShadow>
          <meshStandardMaterial color="#C9944A" roughness={0.9} />
          {long.map((s, i) => (
            <Instance
              key={i}
              // 逐根换色：同一层丝如果颜色完全一致，读起来是一块压花板
              color={['#DCA85C', '#B87B2E', '#E8BC74'][i % 3]}
              position={[s.pos[0], h * s.pos[1], s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        <Instances limit={coarse.length} geometry={g.shredCoarse!} castShadow>
          <meshStandardMaterial color="#D8A858" roughness={0.86} />
          {coarse.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], h * s.pos[1] * 0.96, s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        <Instances limit={fine.length} geometry={g.shredFine!}>
          <meshStandardMaterial color="#B8792A" roughness={0.92} />
          {fine.map((s, i) => (
            <Instance
              key={i}
              color={['#D9A24E', '#A96A1E', '#E7BE76'][i % 3]}
              position={[s.pos[0], h * (0.9 + s.pos[1] * 0.14), s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        {/* 侧壁丝头：不铺这一圈，从侧面看就是一块光板 */}
        <Instances limit={wall.length} geometry={g.shredWall!}>
          <meshStandardMaterial color="#9E6C24" roughness={0.94} />
          {wall.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0] * 1.06, h * s.pos[1] * 0.8, s.pos[2] * 1.06]}
              rotation={[0, s.rot[1], Math.PI / 2]}
              scale={s.scale}
            />
          ))}
        </Instances>
      </group>
    );
  }

  /* ═════════ 脆衣类（脆鸡排 / 麦辣鸡腿排）═════════ */
  if (geometry === 'pattyCrispy' || geometry === 'pattySpicy') {
    const isSpicy = geometry === 'pattySpicy';

    return (
      <group>
        <mesh
          geometry={g.body!}
          castShadow
          receiveShadow
          material={getMaterial('#FFFFFF', {
            roughness: isSpicy ? 0.92 : 0.9,
            speck: isSpicy ? 'spicy' : 'crispy',
            bumpScale: isSpicy ? 0.038 : 0.03,
          })}
        />

        {/* 炸衣碎屑：脆鸡排是金黄的面包糠，麦辣是更深的红褐壳 */}
        <Instances limit={CRUMB_BITS.length} geometry={g.crumb!} castShadow>
          <meshStandardMaterial color={isSpicy ? '#A95620' : '#C9812E'} roughness={0.88} />
          {CRUMB_BITS.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], s.pos[1] * h, s.pos[2]]}
              rotation={s.rot}
              scale={[s.scale[0] * 1.1, s.scale[1] * 0.9, s.scale[2] * 1.1]}
            />
          ))}
        </Instances>

        {/* 顶面翻起来的壳片：脆衣顶面的「一层层」全靠它 */}
        <Instances limit={TOP_CRUST.length} geometry={g.crumb!} castShadow receiveShadow>
          <meshStandardMaterial color={isSpicy ? '#B25E24' : '#D08C34'} roughness={0.9} />
          {TOP_CRUST.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], s.pos[1] * h, s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        {/* 边角块：骑在轮廓线上，把剪影打毛。
            没有它，炸鸡的侧面是一条干净的弧线，读起来是一张饼。 */}
        <Instances limit={CRUST_LUMPS.length} geometry={g.crumb!} castShadow>
          <meshStandardMaterial color={isSpicy ? '#96481A' : '#B96F26'} roughness={0.9} />
          {CRUST_LUMPS.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], s.pos[1] * h, s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        {/* 麦辣鸡腿排的辣椒碎：面衣里透出来的暗红颗粒。
            只取前 26 个位置，让它们散在别的地方，不跟碎屑重合 */}
        {isSpicy && (
          <Instances limit={26} geometry={g.crumb!}>
            <meshStandardMaterial color="#8E2110" roughness={0.8} />
            {CRUMB_BITS.slice(0, 26).map((s, i) => (
              <Instance
                key={i}
                position={[s.pos[2] * 0.86, (1 - s.pos[1]) * h * 0.94, -s.pos[0] * 0.86]}
                rotation={[s.rot[1], s.rot[0], s.rot[2]]}
                scale={[0.55, 0.42, 0.6]}
              />
            ))}
          </Instances>
        )}
      </group>
    );
  }

  /* ═════════ 肉排（牛 / 板烧 / 鳕鱼）═════════ */
  if (geometry.startsWith('patty')) {
    const isFish = geometry === 'pattyFish';
    const isGrilled = geometry === 'pattyGrilled';

    /**
     * 三块肉不再共用一套材质：
     *  · 牛肉 —— 深褐 + 炙烤焦带，粗糙（绞肉的颗粒会硌光）
     *  · 板烧 —— 浅一档的琥珀，粗糙度压到 0.6，表面有油光
     *  · 鳕鱼 —— 浅金面衣 + 白色的鱼肉斑，最接近「裹粉炸」
     *
     * 焦边和炙烤纹现在都在贴图里：贴在顶面的薄片必然和自己浮空，
     * 而顶视投影的 UV 天然贴着曲面走。
     */
    const mat = isFish
      ? getMaterial('#FFFFFF', { roughness: 0.82, speck: 'fish', bumpScale: 0.032 })
      : isGrilled
        ? // 板烧的关键是「油」：粗糙度压到 0.5，肩部才会反出一道亮边，
          // 它和牛肉饼的另一个分野就在这 —— 一个干、一个油
          getMaterial('#FFFFFF', {
            roughness: 0.5,
            grillMap: 'grilled',
            bumpScale: 0.01,
            metallic: 0.06,
          })
        : getMaterial('#FFFFFF', {
            // 牛肉要有油光：0.8 的粗糙度在暖光下是一块亚光的皮革
            roughness: 0.72,
            grillMap: 'beef',
            bumpScale: 0.034,
          });

    return (
      <group>
        <mesh geometry={g.body!} castShadow receiveShadow material={mat} />
      </group>
    );
  }

  /* ═════════ 酱料：一条挤酱螺旋 + 溅落 + 打底薄膜 ═════════ */
  if (geometry === 'sauce') {
    return (
      <group>
        <mesh
          geometry={g.sauceTube!}
          castShadow
          material={getMaterial(color, { roughness: 0.26, metallic: 0.05 })}
        />

        <Instances limit={SAUCE_DROPS.length}>
          <sphereGeometry args={[1, 9, 6]} />
          <meshStandardMaterial color={color} roughness={0.26} />
          {SAUCE_DROPS.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], h * 0.35 + s.pos[1], s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>

        {/* 打底：边缘不规则的一层薄酱，透出下面的料 */}
        <mesh
          geometry={g.sauceFilm!}
          material={getMaterial(color, {
            roughness: 0.24,
            side: THREE.DoubleSide,
            opacity: 0.34,
          })}
        />
      </group>
    );
  }

  /* ═════════ 生菜：三层叶盘 + 探出饼缘的叶尖 ═════════ */
  if (geometry === 'lettuce') {
    // roughness 给到 0.86：0.6 左右的叶面在 1.6 强度的主光下会糊成
    // 一团白高光，整片叶子看起来像上过漆的塑料。
    //
    // bumpScale 从默认的 0.06 提到 0.1：叶脉贴图同时当 bumpMap，
    // 系数太小的话那些叶脉只在颜色上留一道痕，光照完全不响应 ——
    // 这就是「塑料叶」的第二个来源（第一个是叶缘太圆）。
    const leafMat = getMaterial('#FFFFFF', {
      // 0.86 还是太滑：叶面中段那块高光在浅背景上直接糊成一片奶绿。
      // 0.92 之后高光被摊平，叶脉的 bump 才接得住光。
      roughness: 0.92,
      leafMap: true,
      bumpScale: 0.1,
      side: THREE.DoubleSide,
      vertexColors: true,
    });

    return (
      <group>
        {/* 三片叶子各自偏心、各自朝向，并在 z 向拍扁成椭圆。
            实测：只靠换种子/换色调，叠起来的外轮廓仍是一个圆，
            远看就是「一大片叶子」；偏心 0.13–0.15 之后，剪影上
            能数出两三瓣不同曲率的边，才读成「两三片生菜」。

            抬升量也拉到了 0 / 0.32h / 0.58h。
            叶盘的裙边会往下垂 0.36h，所以「每片的裙边」正好压在
            「下一片的面」上 —— 这才是三片叶子摞在一起的样子。
            上一版只抬 0.05h / 0.13h，三片的裙边全埋在下面那片的
            叶面里，交界处一条线都看不见，于是又糊成一片。 */}
        <mesh
          geometry={g.leafOuter!}
          position={[0.13, 0, -0.05]}
          rotation-y={0.32}
          scale={[1, 1, 0.86]}
          castShadow
          receiveShadow
          material={leafMat}
        />

        {/* 第二片：往反方向偏，压在第一片上面一点，亮一档（顶点色给） */}
        <mesh
          geometry={g.leafMid!}
          position={[-0.15, h * 0.32, 0.09]}
          rotation-y={2.46}
          scale={[0.97, 1, 0.84]}
          castShadow
          receiveShadow
          material={leafMat}
        />

        {/* 第三片：小叶，叶心最亮，压在最上面 */}
        <mesh
          geometry={g.leafInner!}
          position={[0.03, h * 0.58, 0.0]}
          rotation-y={4.7}
          scale={[1, 1, 0.92]}
          castShadow
          receiveShadow
          material={leafMat}
        />

        {/* 叶尖：探出饼缘的叶子，末端往下打弯盖住下一层。
            整片圆叶只能围出一圈裙边，几片探出来的叶子才是
            「汉堡里夹了生菜」的视觉信号。 */}
        <Instances limit={LETTUCE_BLADES.length} geometry={g.leafBlade!} castShadow>
          <meshStandardMaterial
            // 不能用奶白去乘贴图：leafTexture 本身就是饱和的黄绿，
            // 再乘一层 #E4F5C8 只会把它洗成塑料薄荷
            color="#E8F2CE"
            map={leafTexture() ?? undefined}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
          {LETTUCE_BLADES.map((s, i) => (
            <Instance
              key={i}
              position={[s.pos[0], h * 0.72, s.pos[2]]}
              rotation={s.rot}
              scale={s.scale}
            />
          ))}
        </Instances>
      </group>
    );
  }

  /* ═════════ 兜底：旋转成型圆盘 ═════════ */
  return (
    <mesh castShadow receiveShadow material={getMaterial(color, { roughness: 0.7 })}>
      <latheGeometry args={[g.points, 40]} />
    </mesh>
  );
}
