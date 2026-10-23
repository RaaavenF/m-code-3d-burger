import { INGREDIENTS } from './ingredients';
import type { StackLayer } from '@/types/burger';

/** 最小有效厚度，防止 sink > thickness 时出现负高度 */
const MIN_STEP = 0.02;

/**
 * 单座汉堡的最大可加层数（不含上下两片面包）。
 *
 * 不设上限的后果实测过：连点 46 次培根，塔高 14 个世界单位，
 * 相机推到最远也框不下，右侧列表滚出屏幕，价格算到 ¥185.5 ——
 * 这已经不是「DIY 汉堡」了。20 层足够玩出所有组合，
 * 也还在低端机能跑满帧的范围内。
 */
export const MAX_FILLINGS = 20;

export interface StackLayout {
  layers: StackLayer[];
  /** 整座汉堡的总高度，相机自适应用 */
  height: number;
}

/**
 * 由「食材 ID 序列」算出每一层的底部 Y 坐标。
 *
 *   baseY[0] = 0
 *   baseY[i] = baseY[i-1] + thickness[i-1] - sink[i-1]
 *
 * 为什么用累加而不是预设锚点表：
 * 用户可以任意增减中间层，锚点表需要手工维护 N×N 的组合，
 * 累加式让整条链自动重排。
 *
 * uid 用「食材 id + 序号」而不是随机数，是为了让追加/撤销时
 * 已有层的 React key 保持稳定 —— 否则每加一层，前面的层都会重新挂载，
 * GSAP 时间线被重放，画面会连环闪。
 */
export function buildStack(ids: string[]): StackLayout {
  const layers: StackLayer[] = [];
  let cursor = 0;

  ids.forEach((ingredientId, index) => {
    const item = INGREDIENTS[ingredientId];
    if (!item) return;

    layers.push({
      uid: `${ingredientId}#${index}`,
      ingredientId,
      baseY: cursor,
      index,
    });

    cursor += Math.max(MIN_STEP, item.thickness - item.sink);
  });

  return { layers, height: cursor };
}

/** 只取总高度，避免不必要的对象分配（相机每帧要用） */
export function stackHeight(ids: string[]): number {
  let h = 0;
  for (const id of ids) {
    const item = INGREDIENTS[id];
    if (!item) continue;
    h += Math.max(MIN_STEP, item.thickness - item.sink);
  }
  return h;
}

/** 某个食材当前是否还能再加（面包类不能重复；总层数有上限） */
export function canAdd(ids: string[], ingredientId: string): boolean {
  const item = INGREDIENTS[ingredientId];
  if (!item) return false;
  const fillings = ids.filter(id => id !== 'bun_bottom' && id !== 'bun_top').length;
  if (fillings >= MAX_FILLINGS) return false;
  if (item.repeat) return true;
  return !ids.includes(ingredientId);
}

/** 剩余可加层数，UI 用来提示「还能加 N 层」 */
export function remainingSlots(ids: string[]): number {
  const fillings = ids.filter(id => id !== 'bun_bottom' && id !== 'bun_top').length;
  return Math.max(0, MAX_FILLINGS - fillings);
}
