/**
 * 营养数据
 *
 * 事实修正：MCP **确实**提供营养接口 —— `list-nutrition-foods`，
 * 无入参，一次返回全部餐品的能量/蛋白质/脂肪/碳水/钠/钙。
 * 之前按「接口名推断」认为不存在是错的，这里以真实返回为准。
 *
 * 该工具返回的 data 是一段类表格字符串：
 *   [160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:
 *     猪柳麦满分,null,1288,308,16,16,24,781,213
 *     ...
 *
 * 因此需要：① 解析这张表；② 用产品名做模糊匹配；③ 本地留一份快照兜底。
 */

export interface NutritionFacts {
  productName: string;
  /** 千焦 */
  energyKj?: number;
  /** 千卡 —— UI 上展示这个 */
  energyKcal: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  sodium?: number;
  calcium?: number;
  /** 数据来源：mcp = 实时拉取，snapshot = 本地快照 */
  source?: 'mcp' | 'snapshot';
}

/**
 * 本地快照（摘自 list-nutrition-foods 的真实返回，2026-10 拉取）
 * 只保留汉堡与高频小食，用于 MCP 不可达时的降级。
 */
const SNAPSHOT_RAW: [string, number, number, number, number, number, number, number][] = [
  // name, kJ, kcal, protein, fat, carb, sodium, calcium
  ['汉堡包', 1039, 248, 13, 8, 29, 492, 61],
  ['吉士汉堡包', 1231, 294, 16, 12, 30, 673, 144],
  ['双层吉士汉堡', 1796, 429, 27, 22, 31, 1017, 232],
  ['麦香鸡', 1546, 369, 15, 17, 39, 731, 73],
  ['麦香鱼', 1359, 325, 16, 13, 35, 556, 99],
  ['麦辣鸡腿汉堡', 2029, 485, 24, 24, 42, 1208, 154],
  ['板烧鸡腿堡', 1638, 391, 23, 17, 35, 1041, 93],
  ['巨无霸', 2146, 513, 27, 26, 42, 961, 171],
  ['培根蔬萃双层牛堡', 1850, 442, 24, 23, 34, 728, 73],
  ['不素之霸双层牛堡', 2062, 493, 28, 27, 34, 1012, 75],
  ['双层深海鳕鱼堡', 2029, 485, 28, 21, 46, 917, 147],
  ['儿童鱼排堡', 1126, 269, 15, 6, 36, 442, 58],
  ['培根安格斯厚牛堡', 2959, 707, 34, 44, 43, 1037, 161],
  ['芝士安格斯厚牛堡', 2914, 696, 32, 44, 43, 897, 150],
  ['芝士双层安格斯厚牛堡', 4195, 1003, 58, 65, 46, 1373, 251],
  ['培根双层安格斯厚牛堡', 4128, 987, 55, 64, 46, 1191, 226],
  ['原味板烧鸡腿麦满分', 1029, 246, 15, 9, 25, 611, 133],
  ['双层原味板烧鸡腿麦满分', 1486, 355, 23, 17, 27, 984, 138],
  ['猪柳麦满分', 1288, 308, 16, 16, 24, 781, 213],
  ['猪柳蛋麦满分', 1618, 387, 23, 21, 25, 846, 243],
  ['大脆鸡扒麦满分', 1510, 361, 16, 17, 35, 804, 130],
  ['那么大鸡排', 1612, 385, 24, 21, 24, 996, 13],
  ['酥酥多笋卷', 1431, 342, 14, 15, 36, 1044, 41],
  ['麦麦脆汁鸡-琵琶腿', 1372, 328, 21, 20, 16, 905, 24],
  ['绝代双翅', 1964, 469, 32, 27, 23, 1167, 34],
  ['麦乐鸡5块', 890, 213, 12, 12, 13, 422, 9],
  ['中薯条', 1210, 289, 4, 12, 38, 165, 18],
  ['大薯条', 1587, 379, 6, 16, 50, 216, 23],
  ['小薯条', 877, 210, 3, 9, 28, 120, 13],
  ['脆薯饼', 612, 146, 1, 9, 14, 311, 7],
  ['可乐中杯', 616, 147, 0, 0, 36, 0, 10],
  ['雪碧中杯', 440, 105, 0, 0, 26, 29, 0],
];

export const NUTRITION_SNAPSHOT: NutritionFacts[] = SNAPSHOT_RAW.map(
  ([name, kj, kcal, protein, fat, carb, sodium, calcium]) => ({
    productName: name,
    energyKj: kj,
    energyKcal: kcal,
    protein,
    fat,
    carbohydrate: carb,
    sodium,
    calcium,
    source: 'snapshot' as const,
  }),
);

/**
 * 解析 list-nutrition-foods 的返回。
 * 兼容三种形态：直接是表格字符串 / { data: 字符串 } / { data: 字符串 } 再套一层。
 */
export function parseNutritionPayload(payload: unknown): NutritionFacts[] {
  let raw = '';

  if (typeof payload === 'string') {
    raw = payload;
  } else if (payload && typeof payload === 'object') {
    const anyPayload = payload as Record<string, unknown>;
    const candidate = anyPayload.data ?? anyPayload.list ?? anyPayload.foods;
    if (typeof candidate === 'string') raw = candidate;
    else if (Array.isArray(candidate)) return normalizeArray(candidate);
  }

  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const out: NutritionFacts[] = [];

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    // 表头行：[160]{productName,...}:
    if (text.startsWith('[') || text.includes('{productName')) continue;

    const cols = text.split(',');
    if (cols.length < 3) continue;

    // 名称里可能含逗号，所以从右侧取固定 7 个数值字段
    const nums = cols.slice(-7).map(v => Number(String(v).trim()));
    const name = cols.slice(0, cols.length - 7).join(',').trim();
    if (!name || nums.some(n => Number.isNaN(n))) continue;

    const [kj, kcal, protein, fat, carb, sodium, calcium] = nums;
    out.push({
      productName: name,
      energyKj: kj,
      energyKcal: kcal,
      protein,
      fat,
      carbohydrate: carb,
      sodium,
      calcium,
      source: 'mcp',
    });
  }

  return out;
}

function normalizeArray(arr: unknown[]): NutritionFacts[] {
  return arr
    .map((it: any): NutritionFacts | null => {
      const name = String(it?.productName ?? it?.name ?? '').trim();
      const kcal = Number(it?.energyKcal ?? it?.kcal ?? it?.energy ?? NaN);
      if (!name || !Number.isFinite(kcal)) return null;
      return {
        productName: name,
        energyKj: Number(it?.energyKj) || undefined,
        energyKcal: kcal,
        protein: Number(it?.protein) || undefined,
        fat: Number(it?.fat) || undefined,
        carbohydrate: Number(it?.carbohydrate) || undefined,
        sodium: Number(it?.sodium) || undefined,
        calcium: Number(it?.calcium) || undefined,
        source: 'mcp' as const,
      };
    })
    .filter((x): x is NutritionFacts => x !== null);
}

/**
 * 按产品名查营养。
 *
 * MCP 的名字与菜单名不完全一致（菜单「吉士汉堡」/ 营养表「吉士汉堡包」，
 * 菜单「双层深海鳕鱼堡」/ 营养表同名），所以：
 *   ① 精确命中直接用
 *   ② 否则找互相包含的候选，取长度差最小的那个
 *      —— 长度差最小 = 语义最接近，避免「吉士汉堡」错配到「双层吉士汉堡」
 */
export function lookupNutrition(
  productName: string,
  table: NutritionFacts[],
): NutritionFacts | undefined {
  const name = String(productName || '').replace(/\s+/g, '');
  if (!name || table.length === 0) return undefined;

  const exact = table.find(n => n.productName.replace(/\s+/g, '') === name);
  if (exact) return exact;

  let best: { item: NutritionFacts; gap: number } | null = null;

  for (const item of table) {
    const t = item.productName.replace(/\s+/g, '');
    if (!t) continue;
    if (t.includes(name) || name.includes(t)) {
      const gap = Math.abs(t.length - name.length);
      if (!best || gap < best.gap) best = { item, gap };
    }
  }

  return best?.item;
}
