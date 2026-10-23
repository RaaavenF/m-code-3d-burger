'use client';

import { useMemo } from 'react';
import { GoldenArches } from '@/components/brand/GoldenArches';
import { useMCP } from '@/components/providers/MCPProvider';
import { useOrder } from '@/components/providers/OrderContext';
import { INGREDIENTS, formatPrice } from '@/lib/ingredients';
import { describeCustomBurger, matchRecipe, nameCustomBurger } from '@/lib/match';
import { lookupNutrition } from '@/lib/nutrition';
import type { BurgerRecipe } from '@/types/burger';
import { IngredientIcon } from './IngredientIcon';

const KCAL_WARN = 800;

/** 在任意深度的响应体里找第一个金额字段（MCP 金额单位为分） */
function findAmount(node: unknown, keys: string[], depth = 0): number | undefined {
  if (!node || typeof node !== 'object' || depth > 5) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findAmount(n, keys, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (keys.includes(k) && (typeof v === 'number' || typeof v === 'string')) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const hit = findAmount(v, keys, depth + 1);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/**
 * 构造 calculate-price 的 modification.values
 *
 * 规则（MCP 契约）：
 *  - 用户选中的项 → key = selectedKey
 *  - 用户未选中的项，若 unselectedKey 非空 → key = unselectedKey，且**必须**传
 *
 * 少传未选中项会让服务端以为该特调组没有指定，导致价格或下单失败。
 */
function buildModificationValues(recipe: BurgerRecipe, layerIds: string[]) {
  const values: { code: string; key: string; quantity: number }[] = [];

  for (const m of recipe.modifications ?? []) {
    if (!m.code) continue;
    const wanted = m.ingredientId ? layerIds.includes(m.ingredientId) : m.defaultOn;

    if (wanted && m.selectedKey) {
      values.push({ code: m.code, key: m.selectedKey, quantity: 1 });
    } else if (!wanted && m.unselectedKey) {
      values.push({ code: m.code, key: m.unselectedKey, quantity: 0 });
    }
  }

  return values;
}

/** 统计卡片：三个数字并排，是右侧面板的视觉锚点 */
function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl bg-cream-2/80 py-2">
      <span
        className={`text-[17px] font-extrabold leading-none tabular-nums tracking-tight ${
          accent ? 'text-red' : 'text-ink'
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium text-ink-3">{label}</span>
    </div>
  );
}

export function RecipePanel() {
  const { recipes, storeCode, offline, callTool, nutrition, nutritionSource } = useMCP();
  const { state, dispatch, layers, totals } = useOrder();

  const fillings = state.ids.filter(id => id !== 'bun_bottom' && id !== 'bun_top');

  /**
   * 能否「完成并封顶」。
   *
   * 旧判定是 `!ids.includes('bun_top')`，本意是防重复封顶，
   * 但它把一条更常见的路径也堵死了：**点热销榜**。
   * LOAD_RECIPE 载入的官方配方本来就带上层面包，
   * 于是状态变成 stacking、bun_top 已在序列里，按钮永远灰着，
   * 文案还写着「再放一层就能封顶」—— 用户点它没反应，就是死路。
   *
   * 封顶本身是幂等的（FINISH 里已做过 has-bun_top 判断），
   * 所以正确的门槛只需要「至少有一层馅料」+「还没出结果」。
   */
  const notYetJudged = state.status === 'stacking' || state.status === 'idle';
  const canFinish = fillings.length >= 1 && notYetJudged;
  const kcalOver = totals.kcal > KCAL_WARN;

  /** 当前已锁定 / 可参考的官方配方 */
  const target = state.match?.recipe ?? null;
  /** 官方营养数据（list-nutrition-foods），命中才有 */
  const facts = target ? lookupNutrition(target.name, nutrition) : undefined;

  const displayName = useMemo(() => {
    if (state.status === 'win' && target) return target.name;
    if (state.customName) return state.customName;
    return state.ids.length ? nameCustomBurger(state.ids) : '还没有汉堡';
  }, [state.status, state.customName, state.ids, target]);

  const price = target && state.match?.orderable ? target.listPrice : totals.price;
  const kcal = target?.officialKcal ?? totals.kcal;

  const finish = () => {
    if (!canFinish) return;
    // 封顶：补上上层面包（已经有了就不重复补），再比对官方配方
    const ids = state.ids.includes('bun_top') ? [...state.ids] : [...state.ids, 'bun_top'];
    const m = matchRecipe(ids, recipes);
    dispatch({ type: 'FINISH', match: m, name: nameCustomBurger(ids) });
  };

  const addToCart = () => {
    const orderable = Boolean(state.match?.orderable && target?.productCode);
    dispatch({
      type: 'ADD_TO_CART',
      item: {
        uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productCode: orderable ? target!.productCode : undefined,
        name: displayName,
        price,
        kcal,
        layerIds: state.ids.includes('bun_top') ? [...state.ids] : [...state.ids, 'bun_top'],
        offMenu: !orderable,
      },
    });
    dispatch({ type: 'RESET' });
  };

  const refreshRealPrice = async () => {
    if (!storeCode || !target?.productCode) return;
    try {
      const res = await callTool<any>('calculate-price', {
        storeCode,
        orderType: 1,
        beType: 1,
        items: [
          {
            productCode: target.productCode,
            quantity: 1,
            modification: { values: buildModificationValues(target, state.ids) },
          },
        ],
      });
      const cents = findAmount(res, ['totalPrice', 'totalAmount', 'payPrice', 'amount']);
      if (cents) {
        // MCP 金额单位为分
        alert(`官方实时价格：¥${(cents / 100).toFixed(2)}\n（已含券与优惠，最终以支付页为准）`);
      } else {
        alert('已调用 calculate-price，但未在返回体里找到金额字段，请检查日志。');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '计价失败');
    }
  };

  /* ───────────── 空态（只有底座） ───────────── */
  if (state.ids.length <= 1) {
    return (
      <aside className="panel-card flex min-h-0 flex-col p-4" aria-label="配方面板">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-red">
              DIY 进行中
            </p>
            <h2 className="mt-1 text-[17px] font-bold tracking-tight text-ink">还没有汉堡</h2>
          </div>
          <span className="rounded-full border border-line bg-cream-2 px-2 py-0.5 font-mono text-[10px] text-ink-2">
            1 层
          </span>
        </div>

        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-cream-2/40 px-4 py-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white shadow-[0_6px_16px_rgba(150,110,60,0.12)]">
            <svg width="30" height="30" viewBox="0 0 48 48" fill="none" aria-hidden>
              <path d="M6 27c0-9 8-16 18-16s18 7 18 16Z" fill="#F0C084" />
              <path d="M6 30h36" stroke="#C9853A" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M9 34c3 2 7 2 10 0s7-2 10 0 7 2 10 0" stroke="#8CCB5E" strokeWidth="3" strokeLinecap="round" />
              <path d="M8 40h32" stroke="#E9B36E" strokeWidth="4.5" strokeLinecap="round" />
            </svg>
          </span>
          <p className="text-[12px] font-semibold text-ink">先放一层料试试</p>
          <p className="font-mono text-[10.5px] leading-relaxed text-ink-3">
            {'// No layers yet.'}
            <br />
            {'// 先放一片面包，就像先写一个 main()'}
          </p>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          已从麦当劳 MCP 载入 <b className="text-ink-2">{recipes.length}</b> 款配方
          {offline ? '（演示数据）' : '（门店实时）'}。
          堆对层序，系统会告诉你「你发明了哪一个堡」。
        </p>
      </aside>
    );
  }

  return (
    <aside className="panel-card flex min-h-0 flex-col" aria-label="配方面板">
      {/* 头部：名字 + 价格 + 三个统计 */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-red">
              {state.status === 'win' ? '配方命中' : state.status === 'custom' ? '专属配方' : 'DIY 进行中'}
            </p>
            <h2 className="mt-1 truncate text-[17px] font-bold leading-tight tracking-tight text-ink">
              {displayName}
            </h2>
          </div>
          <span className="shrink-0 rounded-xl bg-red px-2.5 py-1 font-mono text-[15px] font-extrabold tabular-nums text-white shadow-[0_4px_10px_rgba(218,41,28,0.24)]">
            ¥{formatPrice(price)}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          <Stat value={String(layers.length)} label="层数" />
          <Stat value={String(kcal)} label="千卡" accent={kcalOver} />
          <Stat value={facts?.protein != null ? `${facts.protein}g` : '—'} label="蛋白" />
        </div>

        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
          {kcalOver && <span className="font-semibold text-red">⚠ 已超 {KCAL_WARN} kcal · </span>}
          {facts
            ? `官方值${nutritionSource === 'mcp' ? '' : ' · 快照'}：脂肪 ${facts.fat ?? '—'}g · 碳水 ${facts.carbohydrate ?? '—'}g · 钠 ${facts.sodium ?? '—'}mg`
            : '热量为本地估算，命中官方配方后切换为门店数据'}
        </p>
      </div>

      {/* 层列表 */}
      <div className="mcd-thin-scroll min-h-0 flex-1 overflow-y-auto border-t border-line-soft px-2.5 py-2">
        {[...layers].reverse().map((l, idx) => {
          const item = INGREDIENTS[l.ingredientId];
          const isLast = idx === 0;
          return (
            <div
              key={l.uid}
              className="group flex items-center gap-2 rounded-xl px-1.5 py-1 transition hover:bg-cream-2/70"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cream-2/80">
                <IngredientIcon id={l.ingredientId} size={22} />
              </span>
              <span className="flex-1 truncate text-[12px] font-medium text-ink">
                {item?.name ?? l.ingredientId}
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-ink-3">
                ¥{formatPrice(item?.price ?? 0)}
              </span>
              <button
                type="button"
                onClick={() => {
                  // 只允许删最后一个，避免中间挖洞导致官方配方永远匹配不上
                  if (l.uid === layers[layers.length - 1]?.uid) {
                    dispatch({ type: 'UNDO' });
                  }
                }}
                disabled={!isLast}
                aria-label={`移除${item?.name ?? ''}`}
                className="grid h-6 w-6 place-items-center rounded-lg text-ink-3 transition hover:bg-red/10 hover:text-red disabled:opacity-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}

        {state.status === 'stacking' && !state.ids.includes('bun_top') && (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-line px-1.5 py-1.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-yellow/20 font-mono text-[13px] text-yellow-deep">
              ↑
            </span>
            <span className="flex-1 text-[12px] text-ink-3">上层面包（未封顶）</span>
          </div>
        )}
      </div>

      {/* 匹配结果 */}
      {(state.status === 'win' || state.status === 'near' || state.status === 'custom') && (
        <div className="shrink-0 px-3 pb-2">
          {state.status === 'win' && target && (
            /* 命中是全场唯一的「高光时刻」，用品牌红整块铺底：
               右侧压一枚淡金拱门做水印，不额外抢文字的注意力。
               金拱门本身占满整块右侧，浓度 30% 在红底上会被读成「脏了一块」，
               所以提到 45% —— 它才既像水印又不糊。 */
            <div className="mcd-pop relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#E8342A] to-[#BE2116] p-3 shadow-[0_10px_24px_rgba(218,41,28,0.28)]">
              <GoldenArches className="pointer-events-none absolute -bottom-6 -right-3 h-[86px] w-auto text-[#FFD65A]/45" />
              <p className="relative text-[13px] font-extrabold leading-snug text-white">
                {state.match?.kind === 'exact'
                  ? `恭喜你发明了${target.name}！`
                  : `配料齐了 —— 这就是${target.name}`}
              </p>
              <p className="relative mt-1 text-[11px] leading-relaxed text-white/85">
                {state.match?.kind === 'exact'
                  ? '顺序一模一样，官方认证的手艺人。'
                  : '只是摆盘顺序不同，口味没差。'}
                {target.description ? ` ${target.description}` : ''}
              </p>
              <p className="relative mt-1.5 text-[10px] font-semibold italic tracking-wide text-[#FFC72C]">
                i&apos;m lovin&apos; it
              </p>
            </div>
          )}

          {state.status === 'near' && (
            <div className="rounded-2xl border border-[#F3D28A] bg-[#FFF6E2] p-3">
              <p className="text-[12px] font-bold text-[#7A4A00]">只差一点 —— 像是{target?.name}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#8A6420]">
                {state.match?.diff?.missing.length ? `缺：${state.match.diff.missing.join('、')}` : '少了一层'}
                {state.match?.diff?.extra.length ? `　多：${state.match.diff.extra.join('、')}` : ''}
              </p>
            </div>
          )}

          {state.status === 'custom' && (
            <div className="rounded-2xl bg-cream-2 p-3">
              <p className="text-[12px] font-bold text-ink">你的专属汉堡</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{describeCustomBurger(state.ids)}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
                菜单外配方无法直接下单，可保存为灵感卡分享给朋友。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 操作区 */}
      <div className="shrink-0 space-y-2 border-t border-line-soft p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'UNDO' })}
            className="flex-1 rounded-xl border border-line bg-white py-2 text-[12px] font-semibold text-ink-2 transition hover:-translate-y-px hover:text-ink hover:shadow-[0_4px_12px_rgba(140,95,50,0.1)] active:scale-[0.98]"
          >
            ↶ 撤销
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR' })}
            className="flex-1 rounded-xl border border-line bg-white py-2 text-[12px] font-semibold text-ink-2 transition hover:-translate-y-px hover:text-ink hover:shadow-[0_4px_12px_rgba(140,95,50,0.1)] active:scale-[0.98]"
          >
            ⌫ 清空
          </button>
        </div>

        {state.status === 'stacking' ? (
          <button
            type="button"
            onClick={finish}
            disabled={!canFinish}
            className="brand-cta w-full rounded-xl py-3 text-[13.5px] font-extrabold text-white transition enabled:active:scale-[0.99] disabled:bg-none disabled:bg-line disabled:text-ink-3 disabled:shadow-none"
          >
            {/* 点热销榜载入的配方本来就带着盖，这时按的是「确认」而不是「封顶」 */}
            {!canFinish ? '先加一层馅料' : state.ids.includes('bun_top') ? '确认这个配方' : '完成并封顶'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET' })}
              className="flex-1 rounded-xl border border-line bg-white py-3 text-[12px] font-semibold text-ink-2 transition hover:text-ink"
            >
              重新做一个
            </button>
            <button
              type="button"
              onClick={addToCart}
              className="brand-cta flex-[1.6] rounded-xl py-3 text-[13px] font-extrabold text-white transition active:scale-[0.99]"
            >
              {state.match?.orderable ? '加入购物车' : '保存灵感卡'}
            </button>
          </div>
        )}

        {state.match?.orderable && target?.productCode && (
          <button
            type="button"
            onClick={refreshRealPrice}
            className="w-full rounded-xl border border-line bg-cream-2/60 py-1.5 font-mono text-[10.5px] text-ink-3 transition hover:bg-cream-2 hover:text-ink-2"
          >
            calculate-price · 拉官方实时价
          </button>
        )}
      </div>
    </aside>
  );
}
