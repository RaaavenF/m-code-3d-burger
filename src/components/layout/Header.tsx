'use client';

import { GoldenArches } from '@/components/brand/GoldenArches';
import { useMCP } from '@/components/providers/MCPProvider';
import { useOrder } from '@/components/providers/OrderContext';

export function Header() {
  const { storeName, phase, offline, degraded, reservationDate, reload } = useMCP();
  const { state } = useOrder();

  // 门店打烊时会用「预约时段」拉菜单（MCP 只认 reservationDate）。
  // 这时数据仍是真实的，但看到的是下一个营业时段的菜单 —— 必须说清楚，
  // 不能拿「实时数据」四个字糊过去。
  const badge =
    phase === 'loading'
      ? { text: '连接中', dot: 'bg-[#FFC72C]' }
      : offline
        ? { text: '演示数据', dot: 'bg-[#FFC72C]' }
        : reservationDate
          ? { text: '预约菜单', dot: 'bg-[#FFD65A]' }
          : degraded
            ? { text: '部分降级', dot: 'bg-[#FFC72C]' }
            : { text: '实时数据', dot: 'bg-[#7BE3A0]' };

  return (
    <header
      className="brand-header sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-2.5 px-3 text-white md:gap-3 md:px-5"
      style={{ backgroundColor: '#DA291C' }}
    >
      {/* 品牌 lockup：金拱门 + 竖线 + 中英文名 */}
      <div className="flex min-w-0 items-center gap-3">
        <GoldenArches className="h-[25px] w-auto shrink-0 text-[#FFC72C] md:h-[28px]" title="麦当劳金拱门" />

        <span className="hidden h-7 w-px shrink-0 bg-white/25 sm:block" aria-hidden />

        <div className="min-w-0 leading-[1.05]">
          <div className="truncate text-[14.5px] font-extrabold tracking-[-0.01em] text-white md:text-[15.5px]">
            麦麦汉堡实验室
          </div>
          <div className="mt-[3px] hidden items-center gap-1.5 whitespace-nowrap text-[9.5px] font-semibold tracking-[0.08em] text-[#FFDB86] sm:flex">
            <span className="italic">i&apos;m lovin&apos; it</span>
            <span className="text-white/35">·</span>
            <span className="font-mono tracking-[0.14em] text-white/60">3D DIY</span>
          </div>
        </div>
      </div>

      {/* 门店 */}
      <button
        type="button"
        onClick={reload}
        title="点击重新拉取门店与菜单"
        className="ml-2 flex min-w-0 items-center gap-1.5 md:ml-3 rounded-full border border-white/25 bg-white/12 px-2.5 py-1.5 text-[12px] font-semibold text-white/95 backdrop-blur transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFC72C]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" stroke="currentColor" strokeWidth="1.9" />
          <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
        </svg>
        <span className="max-w-[8.5rem] truncate">
          {storeName ?? (offline ? '演示门店' : '定位门店中')}
        </span>
        <span
          className="hidden shrink-0 items-center gap-1 text-[10.5px] text-white/70 md:flex"
          title={reservationDate ? `门店已打烊，当前展示 ${reservationDate} 时段菜单` : undefined}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden />
          {badge.text}
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* 1024 徽章：呼吸动画，纯装饰 */}
        <span className="hidden items-center gap-1.5 rounded-full bg-[#FFC72C] px-2.5 py-1 font-mono text-[11px] font-extrabold text-[#8C1B10] sm:flex">
          <span className="mcd-pulse h-1.5 w-1.5 rounded-full bg-[#8C1B10]" aria-hidden />
          1024
        </span>

        <button
          type="button"
          className="relative flex items-center gap-2 rounded-full bg-[#FFC72C] py-1.5 pl-3 pr-2 text-[12px] font-extrabold text-[#7A150C] transition hover:-translate-y-px hover:shadow-[0_8px_18px_rgba(0,0,0,0.24)]"
          aria-label={`购物车，${state.cart.length} 件`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 6h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.54L20.5 9H6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="20" r="1.3" fill="currentColor" />
            <circle cx="17" cy="20" r="1.3" fill="currentColor" />
          </svg>
          <span className="hidden sm:inline">购物车</span>
          <span
            className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-extrabold tabular-nums ${
              state.cart.length ? 'bg-[#7A150C] text-[#FFC72C]' : 'bg-[#7A150C]/15 text-[#7A150C]/55'
            }`}
          >
            {state.cart.length}
          </span>
        </button>
      </div>
    </header>
  );
}
