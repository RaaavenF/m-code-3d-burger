import { INGREDIENTS, ingName, totals } from './ingredients';
import type { BurgerRecipe, MatchResult } from '@/types/burger';

/* ═══════════════════════════════════════════════════════════
 * 配方匹配
 *
 * 用户最初设想是「去重 + 保留相对顺序」，这在汉堡场景下是错的：
 *
 *  1. 去重会把「双层脆鸡堡」（两片脆鸡）和「麦香鸡」（一片脆鸡）
 *     判成同一个堡 —— 重数是配方的一部分，不是噪声。
 *  2. 严格按序会把「先放生菜再放酱」和「先放酱再放生菜」判成两个堡 ——
 *     酱和菜的前后顺序在视觉与口味上都不构成差异。
 *
 * 所以改成三段式：
 *   ① exact     顺序 + 重数全等   → 完美复刻，播成就动画
 *   ② sameParts 重数相等、顺序自由 → 配料齐了，仍锁 SKU
 *   ③ near      编辑距离 ≤ 2       → 差一点，给补料提示
 *   ④ custom    其余              → 菜单外灵感
 * ═══════════════════════════════════════════════════════════ */

function countMap(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** 多重集相等：长度、元素、重数全对，顺序无关 */
function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = countMap(a);
  const y = countMap(b);
  if (x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

/** 序列编辑距离（插入 / 删除 / 替换各计 1） */
export function editDistance(a: string[], b: string[]): number {
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 人类可读的差异：缺什么、多什么 */
function diffOf(userIds: string[], recipeIds: string[]) {
  const u = countMap(userIds);
  const o = countMap(recipeIds);
  const missing: string[] = [];
  const extra: string[] = [];

  for (const [k, v] of o) {
    const have = u.get(k) ?? 0;
    for (let i = 0; i < v - have; i++) missing.push(ingName(k));
  }
  for (const [k, v] of u) {
    const want = o.get(k) ?? 0;
    for (let i = 0; i < v - want; i++) extra.push(ingName(k));
  }
  return { missing, extra };
}

export function matchRecipe(userIds: string[], recipes: BurgerRecipe[]): MatchResult {
  if (userIds.length === 0) {
    return { kind: 'custom', orderable: false };
  }

  /* ① 全等 */
  for (const r of recipes) {
    if (
      r.layers.length === userIds.length &&
      r.layers.every((id, i) => id === userIds[i])
    ) {
      return { kind: 'exact', recipe: r, distance: 0, orderable: true };
    }
  }

  /* ② 多重集相等 */
  for (const r of recipes) {
    if (sameMultiset(userIds, r.layers)) {
      return {
        kind: 'sameParts',
        recipe: r,
        distance: 0,
        orderable: true,
        diff: { missing: [], extra: [] },
      };
    }
  }

  /* ③ 最接近 */
  let best: { recipe: BurgerRecipe; distance: number } | null = null;
  for (const r of recipes) {
    const d = editDistance(userIds, r.layers);
    if (!best || d < best.distance) best = { recipe: r, distance: d };
  }

  if (best && best.distance <= 2) {
    return {
      kind: 'near',
      recipe: best.recipe,
      distance: best.distance,
      diff: diffOf(userIds, best.recipe.layers),
      orderable: false,
    };
  }

  return {
    kind: 'custom',
    distance: best?.distance,
    orderable: false,
    diff: best ? diffOf(userIds, best.recipe.layers) : undefined,
  };
}

/* ═══════════════════════════════════════════════════════════
 * 自定义汉堡命名（纯规则，确定性，可离线）
 *
 *   [口味词] + [层数词] + [芝士词] + [主料词] + 堡
 * ═══════════════════════════════════════════════════════════ */

const FLAVOR_RULES: { ids: string[]; word: string }[] = [
  { ids: ['sauce_spicy', 'patty_spicy'], word: '香辣' },
  { ids: ['sauce_bbq', 'patty_grilled'], word: '板烧' },
  { ids: ['patty_fish'], word: '深海' },
  { ids: ['sauce_mustard', 'sauce_mustard_salad'], word: '芥末' },
];

export function nameCustomBurger(ids: string[]): string {
  const has = (x: string) => ids.includes(x);
  const items = ids.map(id => INGREDIENTS[id]).filter(Boolean);
  const patties = items.filter(i => i.category === 'patty');
  const vegCount = items.filter(i => i.category === 'veg').length;

  let flavor = '';
  for (const rule of FLAVOR_RULES) {
    if (rule.ids.some(has)) {
      flavor = rule.word;
      break;
    }
  }

  // 没有肉排 → 全素分支
  if (patties.length === 0) {
    return `全素${vegCount >= 2 ? '蔬萃' : ''}堡`;
  }

  if (has('bacon')) flavor = '培根' + (flavor === '香辣' ? '香辣' : '');
  else if (vegCount >= 3 && !flavor) flavor = '蔬萃';

  const stackWord = patties.length >= 3 ? '三层' : patties.length === 2 ? '双层' : '';
  const main = patties[0].nameRoot ?? '牛肉';

  // 「香辣麦辣鸡腿堡」很怪，口味词与主料词重复时丢掉口味词
  if (flavor.includes('辣') && main.includes('辣')) flavor = '';

  // 单层时芝士是卖点，双层以上被层数词盖过
  const cheeseWord = has('cheese') && stackWord === '' ? '芝士' : '';

  return `${flavor}${stackWord}${cheeseWord}${main}堡`;
}

/** 自定义汉堡的趣味描述，用于结果卡片 */
export function describeCustomBurger(ids: string[]): string {
  const has = (x: string) => ids.includes(x);
  const t = totals(ids);
  const bits: string[] = [];

  if (t.count >= 9) bits.push(`一座站立不稳的 ${t.count} 层高塔`);
  if (has('sauce_spicy')) bits.push('辣度在后段突然袭击');
  if (has('cheese')) bits.push('芝士会沿着纸袋往下流');
  if (has('bacon')) bits.push('培根的烟熏味盖不住');
  if (has('pickle') || has('onion')) bits.push('酸香和辛香在打架');
  if (bits.length === 0) bits.push('配料克制，是懂吃的人');
  if (t.kcal > 800) bits.push('热量已经不太礼貌了');

  return bits.slice(0, 2).join('，') + '。';
}
