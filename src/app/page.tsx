'use client';

import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { MCPProvider } from '@/components/providers/MCPProvider';
import { OrderProvider, useOrder } from '@/components/providers/OrderContext';
import { IngredientPanel } from '@/components/panels/IngredientPanel';
import { QuickOrderRail } from '@/components/panels/QuickOrderRail';
import { RecipePanel } from '@/components/panels/RecipePanel';

/**
 * R3F 的 Canvas 依赖 window / WebGL，不能 SSR。
 * 必须 ssr:false，否则首屏会在服务端渲染时直接抛错。
 */
const CanvasStage = dynamic(
  () => import('@/components/stage/CanvasStage').then(m => m.CanvasStage),
  { ssr: false, loading: () => <StageSkeleton /> },
);

function StageSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="font-mono text-[11px] leading-relaxed text-ink-3">
        <div>
          <span className="font-bold text-yellow-deep">$</span> npm run burger
        </div>
        <div className="mt-1 text-ink-3/70">▸ 正在预热 3D 舞台…</div>
        <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-line">
          <div className="mcd-pulse h-full w-1/2 rounded-full bg-yellow" />
        </div>
      </div>
    </div>
  );
}

/**
 * 左侧空白处放一张「三步」卡片。
 * 食材库在不同分类下只有 2–6 张卡，卡片下方会空出一大片奶油色，
 * 单看像一个没收尾的列表。补一张说明卡，整列才有「被设计过」的收口。
 */
function HowToCard() {
  const steps = [
    { n: '01', t: '挑食材', d: '点卡片，食材会从上方落下来叠好' },
    { n: '02', t: '看配方', d: '右侧实时算层数、热量、蛋白质' },
    { n: '03', t: '封印顶', d: '命中真品会亮出「恭喜你发明了…」' },
  ];

  return (
    <aside className="panel-card hidden shrink-0 px-4 py-3.5 lg:block" aria-label="玩法说明">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[12.5px] font-bold text-ink">怎么玩</h3>
        <span className="font-mono text-[10px] text-ink-3">3 steps</span>
      </div>
      <ol className="mt-2 flex flex-col gap-2">
        {steps.map(s => (
          <li key={s.n} className="flex gap-2.5">
            <span className="mt-px font-mono text-[10px] font-bold tabular-nums text-yellow-deep">
              {s.n}
            </span>
            <span className="min-w-0">
              <b className="text-[11.5px] font-semibold text-ink-2">{s.t}</b>
              <span className="ml-1 text-[11px] leading-snug text-ink-3">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Workbench() {
  const { state, dispatch } = useOrder();
  const layers = state.ids.length;
  const canUndo = state.ids.length > 1;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main className="mx-auto flex w-full max-w-[1680px] min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:h-[calc(100dvh-60px)] lg:grid-cols-[300px_minmax(0,1fr)_344px] lg:gap-3.5 lg:p-3.5">
        {/* ── 中间：3D 舞台 + 热销榜 ── */}
        <div className="order-1 flex shrink-0 flex-col gap-3 lg:order-2 lg:min-h-0 lg:shrink">
          <section
            className="stage-canvas relative h-[46dvh] min-h-[320px] overflow-hidden rounded-[24px] border border-white/70 lg:h-auto lg:min-h-0 lg:flex-1"
            aria-label="3D 汉堡舞台"
          >
            <CanvasStage ids={state.ids} />

            {/* 左上：层数 chip */}
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[12px] font-bold text-ink-2 shadow-[0_4px_12px_rgba(140,95,50,0.12)] backdrop-blur">
                <b className="text-[14px] font-extrabold tabular-nums text-red">{layers}</b>
                层
              </span>
            </div>

            {/* 右上：撤销 / 清空 */}
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => dispatch({ type: 'UNDO' })}
                disabled={!canUndo}
                className="rounded-full border border-white/70 bg-white/85 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-2 shadow-[0_4px_12px_rgba(140,95,50,0.1)] backdrop-blur transition hover:-translate-y-px hover:text-ink disabled:opacity-40 disabled:hover:translate-y-0"
              >
                ↶ 撤销
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'CLEAR' })}
                className="rounded-full border border-white/70 bg-white/85 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-2 shadow-[0_4px_12px_rgba(140,95,50,0.1)] backdrop-blur transition hover:-translate-y-px hover:text-ink"
              >
                清空
              </button>
            </div>

            {/* 只有底包时给一句引导：否则舞台上一块光秃秃的圆面包，
                看起来像加载出来的占位符 */}
            {layers <= 1 && (
              <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-[18%]">
                <span className="rounded-full border border-white/80 bg-white/80 px-3.5 py-1.5 text-[11.5px] font-semibold text-ink-2 shadow-[0_6px_18px_rgba(150,105,55,0.14)] backdrop-blur">
                  ← 从左边挑一层料，它会从天而降
                </span>
              </div>
            )}

            {/* 底部提示 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1 text-[10.5px] font-semibold text-ink-2 shadow-[0_4px_12px_rgba(150,105,55,0.1)] backdrop-blur">
                拖拽旋转 · 双指缩放
              </span>
            </div>

            {/* 1024 彩蛋：堆到 10 层触发 */}
            {layers >= 10 && (
              <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-ink/80 px-3 py-1 font-mono text-[10px] text-yellow backdrop-blur-sm">
                {'// 10 层 —— stack overflow 也不怕'}
              </div>
            )}
          </section>

          <QuickOrderRail />
        </div>

        {/* ── 左：食材库 ── */}
        <div className="order-2 flex min-h-0 flex-col gap-3 lg:order-1 lg:overflow-hidden">
          <IngredientPanel />
          <HowToCard />
        </div>

        {/* ── 右：配方面板 ── */}
        <div className="order-3 flex min-h-0 flex-col lg:overflow-hidden">
          <RecipePanel />
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <MCPProvider>
      <OrderProvider>
        <Workbench />
      </OrderProvider>
    </MCPProvider>
  );
}
