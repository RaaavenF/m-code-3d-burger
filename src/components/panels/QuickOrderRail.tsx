'use client';

import { useMCP } from '@/components/providers/MCPProvider';
import { useOrder } from '@/components/providers/OrderContext';
import { INGREDIENTS, formatPrice } from '@/lib/ingredients';

/**
 * 配方缩略塔
 *
 * 不画真实 3D —— 一条 44px 高的缩略图不值得开一个 Canvas。
 * 用一组高度递减的色条自下而上堆出来，读起来就是「一摞料」，
 * 颜色直接取食材表的 color，和主舞台永远对得上。
 */
function MiniStack({ layers }: { layers: string[] }) {
  const shown = layers.slice(0, 7);
  return (
    <span className="flex h-[46px] w-[54px] shrink-0 flex-col-reverse items-center justify-center">
      {shown.map((id, i) => {
        const item = INGREDIENTS[id];
        const isEdge = i === 0 || i === shown.length - 1;
        const width = isEdge ? 46 : 40 - (i % 3) * 2;
        return (
          <span
            key={`${id}-${i}`}
            className={isEdge ? 'rounded-[46%]' : 'rounded-[34%]'}
            style={{
              width,
              height: isEdge ? 8 : 7,
              background: item?.color ?? '#ccc',
              marginTop: -1.5,
              boxShadow: '0 1px 2px rgba(120,70,20,0.25), inset 0 1px 0 rgba(255,255,255,0.45)',
            }}
          />
        );
      })}
    </span>
  );
}

/**
 * 快速点单
 *
 * 点击后整座汉堡会以「自动组装」的方式重新落一遍：
 * LOAD_RECIPE 会把 stackKey +1，<BurgerStack key={stackKey}> 强制重挂载，
 * 所有层重新播入场动画并按 index 错开 45ms。
 */
export function QuickOrderRail() {
  const { recipes, offline, phase } = useMCP();
  const { dispatch } = useOrder();

  if (phase === 'loading') {
    return (
      <div className="panel-card flex h-[92px] shrink-0 items-center gap-2 px-4">
        <span className="font-mono text-[11px] text-ink-3">$ npm run burger</span>
        <span className="font-mono text-[11px] font-semibold text-yellow-deep">loading recipes…</span>
        <span className="ml-1 h-1 w-16 overflow-hidden rounded-full bg-line">
          <span className="mcd-pulse block h-full w-1/2 rounded-full bg-yellow" />
        </span>
      </div>
    );
  }

  if (recipes.length === 0) return null;

  return (
    <div className="panel-card shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13.5px] font-bold text-ink">热销成品</h2>
          <span className="text-[11px] text-ink-3">点一下看它被造出来</span>
        </div>
        {offline && (
          <span className="rounded-full bg-yellow/20 px-2 py-0.5 text-[10px] font-semibold text-ink-2">
            演示数据
          </span>
        )}
      </div>

      <div className="mcd-no-scrollbar mcd-rail flex gap-2 overflow-x-auto px-3 pb-3 pt-2">
        {recipes.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => dispatch({ type: 'LOAD_RECIPE', layers: r.layers })}
            className="group flex shrink-0 items-center gap-2 rounded-2xl border border-line-soft bg-[#FFFCF6] py-1.5 pl-1.5 pr-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-yellow hover:shadow-[0_10px_22px_rgba(150,100,45,0.13)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-deep active:scale-[0.98]"
          >
            <span className="grid place-items-center rounded-xl bg-[radial-gradient(circle_at_50%_62%,#FFF0D6_0%,rgba(255,240,214,0)_76%)] transition group-hover:scale-105">
              <MiniStack layers={r.layers} />
            </span>

            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="max-w-[7.5rem] truncate text-[12.5px] font-bold text-ink">
                  {r.name}
                </span>
                {r.badge && (
                  <span className="shrink-0 rounded bg-red/90 px-1 py-px text-[9px] font-semibold text-white">
                    {r.badge}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-3">
                <span className="font-bold text-ink-2 tabular-nums">¥{formatPrice(r.listPrice)}</span>
                <span className="opacity-40">·</span>
                <span className="tabular-nums">{r.layers.length} 层</span>
                {r.officialKcal ? (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="tabular-nums">{r.officialKcal} kcal</span>
                  </>
                ) : null}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
