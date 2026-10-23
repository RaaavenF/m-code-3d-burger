/**
 * MCP 数据 → 领域模型 的映射层
 *
 * 这一层是整个项目最容易出 bug 也最有价值的地方：
 * MCP 返回的是「中文餐品名 + 中文配料名」，3D 舞台需要的是「食材 ID 序列」。
 * 映射错了，用户叠出来的官方堡永远匹配不上。
 *
 * 所有字段访问都用可选链 + 兜底，因为不同门店 / 不同版本 MCP 的
 * 返回结构会有细微差异，不能假定某个字段一定存在。
 */
import { CATEGORY_STACK_ORDER, INGREDIENTS } from '@/lib/ingredients';
import { lookupNutrition, type NutritionFacts } from '@/lib/nutrition';
import type { BurgerRecipe, McModification } from '@/types/burger';

/* ═══════════════ 1. 剥壳 ═══════════════ */

/**
 * 剥掉 { code, message, data } 这类外壳，最多剥 3 层。
 * MCP 各工具的外壳层级不一致，统一在这里抹平。
 */
export function unwrapEnvelope(input: unknown): any {
  let v: any = input;
  for (let i = 0; i < 3; i++) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'data' in v && v.data != null) {
      v = v.data;
    } else break;
  }
  return v;
}

/**
 * 解析「以元为单位」的金额字段。
 *
 * ⚠️ MCP 各工具的金额单位并不统一，单位必须由调用方按来源决定，不能猜：
 *
 * | 工具 | 字段 | 单位 |
 * |---|---|---|
 * | `query-meals` | `currentPrice: "22.5"` | 元（字符串） |
 * | `query-meal-detail` | `values[].price: 0` | 元 |
 * | `calculate-price` | `price: 2250` | **分** |
 *
 * 上一版用「>= 1000 视为分」来猜：圆筒冰淇淋 500 分 = 5 元，被误判成 500 元
 * （实测门店 1950564 返回 `price: 500`）。现在这里只处理元，
 * `calculate-price` 的分由 RecipePanel 单独 ÷100，不经过本函数。
 */
function parseYuan(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/* ═══════════════ 2. 配料名 → 食材 ID ═══════════════ */

/**
 * 同义词表。key 是食材 ID，value 是可能出现在 MCP 返回里的中文名片段。
 * 匹配策略：按 value 长度降序做「包含」判断，
 * 这样「芥末沙拉酱」会先命中 sauce_mustard_salad 而不是 sauce_mustard。
 */
const ALIASES: Record<string, string[]> = {
  sauce_mayo: ['麦香鸡酱', '麦香鱼酱', '塔塔酱'],
  sauce_mustard_salad: ['芥末沙拉酱'],
  sauce_mustard: ['芥末酱'],
  sauce_spicy: ['辣椒黄油风味酱', '香辣酱', '辣椒黄油'],
  sauce_bbq: ['烤味酱', '烧烤酱', '板烧酱'],
  sauce_ketchup: ['番茄酱', '茄汁'],
  sauce_big: ['巨无霸酱', '大麦克酱'],
  cheese: ['吉士', '芝士', '干奶酪'],
  lettuce: ['切块生菜', '生菜', '球生菜', '莴苣'],
  tomato: ['番茄片', '番茄', '西红柿'],
  onion: ['洋葱粒', '洋葱'],
  pickle: ['酸黄瓜', '青瓜'],
  bacon: ['培根', '烟肉'],
  hashbrown: ['薯饼', '薯饼排'],
};

/** 展开成 [食材ID, 别名] 列表并按别名长度降序 */
const ALIAS_INDEX: { id: string; alias: string }[] = Object.entries(ALIASES)
  .flatMap(([id, list]) => list.map(alias => ({ id, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function nameToIngredientId(rawName: string): string | null {
  const name = String(rawName || '').replace(/\s+/g, '');
  if (!name) return null;
  for (const { id, alias } of ALIAS_INDEX) {
    if (name.includes(alias)) return id;
  }
  return null;
}

/* ═══════════════ 3. 产品名 → 肉排层 ═══════════════ */

/** 顺序敏感：先匹配更具体的关键词（「麦辣鸡腿」优先于「鸡」） */
const PATTY_RULES: { keywords: string[]; id: string }[] = [
  { keywords: ['麦辣鸡腿', '麦辣鸡'], id: 'patty_spicy' },
  { keywords: ['龙焰'], id: 'patty_spicy' },
  { keywords: ['板烧'], id: 'patty_grilled' },
  { keywords: ['鳕鱼', '深海'], id: 'patty_fish' },
  { keywords: ['脆鸡', '麦香鸡'], id: 'patty_crispy' },
  { keywords: ['巨无霸', '不素之霸', '牛', '吉士'], id: 'patty_beef' },
];

/** 层数前缀 */
function pattyCount(name: string): number {
  if (/三层|三重/.test(name)) return 3;
  if (/双层|两层|双重/.test(name)) return 2;
  return 1;
}

function pattiesFromName(name: string): string[] {
  for (const rule of PATTY_RULES) {
    if (rule.keywords.some(k => name.includes(k))) {
      return Array.from({ length: pattyCount(name) }, () => rule.id);
    }
  }
  // 兜底：名字里没有可识别的肉排 → 视为牛肉（吉士汉堡、双层牛堡等）
  return Array.from({ length: pattyCount(name) }, () => 'patty_beef');
}

/* ═══════════════ 4. 组装配方 ═══════════════ */

/**
 * 收集 `query-meal-detail` 里的所有特调项（可加 / 可去的配料）。
 *
 * 不同 SKU 的结构完全不同，下面是 2026-10 实测（门店 1950564，单品 `1440`）：
 *
 * ① **单品**：`rounds` 是空数组，特调在**顶层**，而且是「组 → 值」两层：
 *    ```jsonc
 *    { "code": "1440", "name": "麦辣鸡腿汉堡", "rounds": [], "supportModify": true,
 *      "modification": { "items": [ { "maxValues": 2, "minValues": 0,
 *        "values": [
 *          { "code":"100136", "name":"麦香鸡酱", "selectedQuantity":1,
 *            "selectedKey":"0-1", "unselectedKey":"0-0" },
 *          { "code":"120512", "name":"切块生菜", "selectedQuantity":1,
 *            "selectedKey":"0-1", "unselectedKey":"0-0" } ] } ] } }
 *    ```
 *
 * ② **套餐 / 旧版**：`rounds[].choices[].modification`，或顶层 `choice[]` / `choices[]`
 *    里每一 choice 自带一个 `modification` 数组。
 *
 * 上一版只认 ②，于是每个单品汉堡都只解析出「面包 + 肉排 + 面包」——
 * 酱和生菜全丢了，用户照着官方配方叠反而永远匹配不上。
 */
function collectModValues(body: any): any[] {
  const groups: any[][] = [];

  const fromModification = (mod: any) => {
    if (Array.isArray(mod)) {
      groups.push(mod);
      return;
    }
    if (mod && Array.isArray(mod.items)) {
      for (const g of mod.items) {
        if (Array.isArray(g?.values)) groups.push(g.values);
      }
    }
  };

  // ① 顶层（单品）
  fromModification(body?.modification);

  // ② 选择项（choice / choices / rounds[].choices）
  const choices: any[] = [
    ...(Array.isArray(body?.choice) ? body.choice : []),
    ...(Array.isArray(body?.choices) ? body.choices : []),
    ...(Array.isArray(body?.rounds)
      ? body.rounds.flatMap((r: any) => (Array.isArray(r?.choices) ? r.choices : []))
      : []),
  ];
  for (const c of choices) fromModification(c?.modification);

  // 同一个特调项可能出现在多个组里（如套餐里两处都有「芝士」），按 code + name 去重
  const seen = new Set<string>();
  const out: any[] = [];
  for (const v of groups.flat()) {
    const key = `${v?.code ?? ''}|${v?.name ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * 把 query-meal-detail 的返回体映射成 BurgerRecipe。
 *
 * 层序规则（工厂默认值，不是官方公布的真实堆叠顺序）：
 *   下层面包 → 肉排 ×N → 芝士 → 蔬菜 → 配菜 → 酱料 → 上层面包
 *
 * 之所以按这个顺序而不是照搬 App 里的展示顺序：
 * App 的圆形图标排列是「配料种类」而不是「堆叠次序」，
 * 只有按类别分组才能得到一个稳定、可复现、用户也猜得到的层序。
 * DIY 模式下的官方配方与用户操作共用同一套规则，因此匹配是自洽的。
 */
export function toBurgerRecipe(
  detailRaw: unknown,
  fallbackCode = '',
  source: BurgerRecipe['source'] = 'mcp',
  nutrition: NutritionFacts[] = [],
  /** 菜单列表里带回来的单价（元）。详情体通常不含价格，逐层加总会高估。 */
  priceHint?: number,
): BurgerRecipe | null {
  const body = unwrapEnvelope(detailRaw);
  if (!body || typeof body !== 'object') return null;

  const name = String(body.name ?? body.productName ?? body.title ?? '').trim();
  const productCode = String(body.code ?? body.productCode ?? fallbackCode ?? '').trim();
  if (!name && !productCode) return null;

  /* 4.1 收集所有特调项 */
  const rawMods = collectModValues(body);

  const modifications: McModification[] = rawMods.map(m => {
    const mName = String(m?.name ?? m?.itemName ?? '');
    const ingredientId = nameToIngredientId(mName);
    // 选中状态有两种表达，别混：
    //   · values[]（实测单品）用 selectedQuantity：1 = 默认勾上，0 = 未勾
    //   · choice[]（旧 / 套餐结构）用 isDefault
    const qty = Number(m?.selectedQuantity);
    const defaultOn = Number.isFinite(qty)
      ? qty > 0
      : !(m?.isDefault === 0 || m?.isDefault === '0' || m?.isDefault === false);
    return {
      name: mName,
      code: String(m?.code ?? ''),
      selectedKey: m?.selectedKey != null ? String(m.selectedKey) : undefined,
      unselectedKey: m?.unselectedKey != null ? String(m.unselectedKey) : undefined,
      ingredientId,
      defaultOn,
      priceDelta: parseYuan(m?.price ?? m?.priceDelta),
    };
  });

  /* 4.2 拼层序列 */
  const middle: string[] = [];

  // 肉排层
  middle.push(...pattiesFromName(name));

  // 配料层：只取默认选中的，且必须能映射到已知食材
  for (const m of modifications) {
    if (!m.defaultOn || !m.ingredientId) continue;
    const item = INGREDIENTS[m.ingredientId];
    if (!item) continue;
    // 面包类特调（如「换全麦面包」）不进中间层
    if (item.category === 'bread') continue;
    middle.push(m.ingredientId);
  }

  // 按类别稳定排序（同类别内保持 MCP 给出的顺序）
  middle.sort((a, b) => {
    const ca = INGREDIENTS[a]?.category;
    const cb = INGREDIENTS[b]?.category;
    return (CATEGORY_STACK_ORDER[ca] ?? 9) - (CATEGORY_STACK_ORDER[cb] ?? 9);
  });

  const layers = ['bun_bottom', ...middle, 'bun_top'];

  /* 4.3 价格 / 热量
     `query-meal-detail` 的返回体里**没有价格字段**，所以优先用菜单列表带回来的
     真实单价（priceHint）；只有拿不到时才退化成逐层加总，那样会明显偏高。 */
  const listPrice =
    parseYuan(body.price ?? body.salePrice ?? body.originalPrice) ??
    parseYuan(priceHint) ??
    layers.reduce((s, id) => s + (INGREDIENTS[id]?.price ?? 0), 0);

  const officialKcal = (() => {
    // ① 详情体自带营养字段（部分版本会有）
    const k = Number(body.calorie ?? body.kcal ?? body.energyKcal);
    if (Number.isFinite(k) && k > 0) return Math.round(k);
    // ② 用 list-nutrition-foods 的表按产品名匹配 —— 这是主路径
    const hit = lookupNutrition(name, nutrition);
    return hit ? Math.round(hit.energyKcal) : undefined;
  })();

  return {
    id: productCode || name,
    productCode,
    name: name || productCode,
    layers,
    listPrice: Math.round(listPrice * 10) / 10,
    officialKcal,
    description: String(body.description ?? body.desc ?? '') || undefined,
    badge: String(body.badge ?? body.tag ?? '') || undefined,
    imageUrl: String(body.imageUrl ?? body.img ?? '') || undefined,
    modifications,
    source,
  };
}

/* ═══════════════ 5. 菜单里筛汉堡 ═══════════════ */

export interface MealLite {
  productCode: string;
  name: string;
  price?: number;
  imageUrl?: string;
  categoryName?: string;
}

/**
 * 从 `query-meals` 的返回体里抽出扁平餐品列表。
 *
 * ⚠️ 真实结构（2026-10 实测）是**两张表分开**的，这一点最容易看漏：
 *
 * ```jsonc
 * {
 *   "categories": [ { "name": "鸡肉汉堡/卷",
 *                     "meals": [ { "code": "1440", "tags": ["单品"] } ] } ],   // ← code 在这里
 *   "meals": { "1440": { "name": "麦辣鸡腿汉堡",                              // ← name 和价格在这里
 *                       "currentPrice": "22.5", "image": "https://..." } }
 * }
 * ```
 *
 * **code 在 `categories` 里，name 在 `meals` 字典的 value 里，两者不在一处。**
 * 上一版只做「递归找同时带 code + name 的节点」，两条路都走不通 ——
 * 结果是永远返回空数组，整个应用静默退化成内置快照，而且不报错。
 * 这类 bug 只看代码看不出来，必须拿真实响应跑一遍。
 *
 * 同时保留递归兜底，兼容部分门店版本的扁平 / `categoryList` / `productList` 结构。
 */
export function flattenMeals(input: unknown): MealLite[] {
  const body = unwrapEnvelope(input);
  const out: MealLite[] = [];
  const seen = new Set<string>();

  const push = (
    code: unknown,
    name: unknown,
    price: unknown,
    imageUrl: unknown,
    categoryName?: string,
  ) => {
    const key = code == null ? '' : String(code);
    const label = typeof name === 'string' ? name.trim() : '';
    if (!key || !label || seen.has(key)) return;
    seen.add(key);
    out.push({
      productCode: key,
      name: label,
      price: parseYuan(price),
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
      categoryName,
    });
  };

  /* ① 真实形态：categories[] 提供「类目 + code」，meals{} 提供「name + 价格」 */
  const dict = body?.meals;
  if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
    const categoryOf = new Map<string, string>();
    for (const cat of Array.isArray(body?.categories) ? body.categories : []) {
      const catName = typeof cat?.name === 'string' ? cat.name.replace(/\s+/g, '') : '';
      for (const m of Array.isArray(cat?.meals) ? cat.meals : []) {
        if (m?.code != null) categoryOf.set(String(m.code), catName);
      }
    }
    for (const [code, v] of Object.entries(dict as Record<string, any>)) {
      push(
        code,
        v?.name,
        v?.currentPrice ?? v?.price ?? v?.salePrice,
        v?.image ?? v?.imageUrl,
        categoryOf.get(code),
      );
    }
  }

  /* ② 兜底：递归找自带 code + name 的节点 */
  const walk = (node: any, depth: number) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;

    const code = node.productCode ?? node.code;
    const name = node.name ?? node.productName;
    push(
      code,
      name,
      node.currentPrice ?? node.price ?? node.salePrice,
      node.imageUrl ?? node.image,
      typeof node.categoryName === 'string' ? node.categoryName : undefined,
    );

    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };

  walk(body, 0);
  return out;
}

/**
 * 从餐品列表里挑出「可以直接做 3D 堆叠」的汉堡单品。
 *
 * 排除套餐 / 组合包：它们的 `query-meal-detail` 返回的是
 * 「主食 + 小食 + 饮料」的 `rounds`，不是汉堡的配料，
 * 拿去建 3D 会得到一座由薯条和可乐组成的怪物。
 */
export function pickBurgers(meals: MealLite[], limit = 12): MealLite[] {
  const EXCLUDE = /套餐|件套|组合|随心选|随心配|分享餐|双人餐|单人餐|乐园餐|拼盘|精选/;
  const burgers = meals.filter(m => /堡/.test(m.name) && !EXCLUDE.test(m.name));
  return (burgers.length > 0 ? burgers : meals).slice(0, limit);
}
