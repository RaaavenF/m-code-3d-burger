'use client';

import { useState } from 'react';
import { CATEGORIES, INGREDIENTS, formatPrice } from '@/lib/ingredients';
import { canAdd } from '@/lib/stack';
import { useOrder } from '@/components/providers/OrderContext';
import type { IngredientCategory } from '@/types/burger';
import { IngredientIcon } from './IngredientIcon';

/**
 * 食材卡片
 *
 * 缩略图用手绘 SVG（见 IngredientIcon）而不是微型 WebGL：
 * 12 张卡各自开一个 Canvas 会撞上浏览器的上下文上限（8–16 个），
 * 而单张卡片的体积又不足以支撑一次真实的渲染。
 */
function IngredientCard({
  id,
  disabled,
  onAdd,
}: {
  id: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  const item = INGREDIENTS[id];
  if (!item) return null;

  return (
    <button type="button" onClick={onAdd} disabled={disabled} className="ing-card group" aria-label={`添加${item.name}`}>
      <span className="ing-thumb">
        <IngredientIcon id={item.id} size={48} />
      </span>

      <span className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold leading-tight text-ink">
        {item.name}
      </span>

      <span className="flex w-full items-center justify-center gap-1 font-mono text-[10px] text-ink-3">
        <span className="tabular-nums">¥{formatPrice(item.price)}</span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{item.kcal}kcal</span>
      </span>

      <span className="ing-plus" aria-hidden>
        +
      </span>
    </button>
  );
}

export function IngredientPanel() {
  const { state, dispatch } = useOrder();
  const [tab, setTab] = useState<IngredientCategory>('patty');

  const items = Object.values(INGREDIENTS).filter(
    i => i.category === tab && i.renderable && i.slot !== 'topOnly',
  );

  const current = CATEGORIES.find(c => c.id === tab);

  return (
    <aside className="panel-card flex min-h-0 flex-col" aria-label="食材库">
      <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="text-[17px] font-bold leading-tight tracking-tight text-ink">挑食材</h2>
          <p className="mt-1 text-[11.5px] text-ink-3">{current?.hint ?? '点一下就从天而降'}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-cream-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2">
          {items.length} 种
        </span>
      </div>

      {/* 分类 Tab：三列两行的小格子，比一排横向滚动的药丸更好点，
          也不用担心「酱料」被裁在屏幕外 */}
      <div
        role="tablist"
        aria-label="食材分类"
        className="mx-3 mb-2 grid shrink-0 grid-cols-3 gap-1 rounded-2xl border border-line-soft bg-cream-2/70 p-1"
      >
        {CATEGORIES.map(c => {
          const active = c.id === tab;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(c.id)}
              className={`rounded-xl py-1.5 text-[11.5px] transition ${
                active
                  ? 'bg-white font-extrabold text-red shadow-[0_2px_8px_rgba(120,80,40,0.12)] ring-1 ring-red/15'
                  : 'font-semibold text-ink-2 hover:bg-white/70'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="mcd-thin-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
          {items.map(item => (
            <IngredientCard
              key={item.id}
              id={item.id}
              disabled={!canAdd(state.ids, item.id)}
              onAdd={() => dispatch({ type: 'ADD', id: item.id })}
            />
          ))}
        </div>

        {tab === 'bread' && (
          <p className="mt-3 rounded-2xl border border-line-soft bg-cream-2/70 px-3 py-2.5 text-[11px] leading-relaxed text-ink-2">
            上层面包不用手动加 —— 堆完点「完成并封顶」，它会自己扣下来。
            这也是为什么面包只能加一次。
          </p>
        )}

        {tab === 'sauce' && (
          <p className="mt-3 rounded-2xl border border-line-soft bg-cream-2/70 px-3 py-2.5 text-[11px] leading-relaxed text-ink-2">
            酱料是薄薄一层，被上下两层面包压住后几乎只露出边缘 ——
            但配方匹配会算上它。
          </p>
        )}
      </div>
    </aside>
  );
}
