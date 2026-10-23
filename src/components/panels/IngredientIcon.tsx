'use client';

/**
 * 食材插画
 *
 * 为什么用 SVG 而不是缩略图：
 *  - 12 张食材卡 × WebGL 上下文会直接撞上浏览器上限（8–16 个）；
 *  - 一张图片资产要额外请求，且和 3D 里的配色对不上；
 *  - SVG 能跟着主题色走，圆角、描边都可以统一。
 *
 * 每个图标都在 64×64 画布里手绘：一份主形 + 一层质感 + 一点高光。
 * 关键是要有「剖面 / 堆叠」的读法 —— 番茄要看得见心室，生菜要看得见叶缘。
 */

interface Props {
  id: string;
  size?: number;
}

const DOT = (x: number, y: number, r = 1.1, o = 0.5) => (
  <circle cx={x} cy={y} r={r} fill="#000" opacity={o} />
);

export function IngredientIcon({ id, size = 46 }: Props) {
  // 酱料用 currentColor 上色，其余食材自带配色
  const tint = SAUCE_TINT[id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      style={tint ? { color: tint } : undefined}
    >
      {body(id)}
    </svg>
  );
}

function body(id: string) {
  switch (id) {
    /* ───────── 面包 ───────── */
    case 'bun_bottom':
      return (
        <g>
          <path
            d="M7 33c0-7 11-11 25-11s25 4 25 11l-4 9c-3 5-10 8-21 8s-18-3-21-8Z"
            fill="#E3A75F"
          />
          <path
            d="M11 34c0-5 9-8 21-8s21 3 21 8l-3 8c-3 4-9 6-18 6s-15-2-18-6Z"
            fill="#F6D5A6"
          />
          <ellipse cx="23" cy="34" rx="2.4" ry="1.5" fill="#E2BC85" />
          <ellipse cx="35" cy="37" rx="2.8" ry="1.6" fill="#E2BC85" />
          <ellipse cx="28" cy="41" rx="2" ry="1.2" fill="#E2BC85" />
          <path d="M7 33c0-7 11-11 25-11s25 4 25 11" fill="none" stroke="#C9853A" strokeWidth="1.6" opacity=".55" />
        </g>
      );

    case 'bun_top':
      return (
        <g>
          <path d="M5 39c0-15 12-25 27-25s27 10 27 25Z" fill="#E9AE64" />
          <path d="M5 39c0-15 12-25 27-25 5 0 9 .8 13 2.4C33 18 25 26 23 39Z" fill="#F3C489" opacity=".85" />
          <path d="M5 38h54" stroke="#C9853A" strokeWidth="2" opacity=".5" />
          <g fill="#FDF0D2">
            <ellipse cx="22" cy="28" rx="3.1" ry="1.5" transform="rotate(-18 22 28)" />
            <ellipse cx="33" cy="23" rx="3.1" ry="1.5" transform="rotate(8 33 23)" />
            <ellipse cx="44" cy="28" rx="3.1" ry="1.5" transform="rotate(20 44 28)" />
            <ellipse cx="27" cy="35" rx="3" ry="1.4" transform="rotate(-6 27 35)" />
            <ellipse cx="41" cy="35" rx="3" ry="1.4" transform="rotate(14 41 35)" />
            <ellipse cx="50" cy="33" rx="2.6" ry="1.3" transform="rotate(26 50 33)" />
          </g>
        </g>
      );

    /* ───────── 肉排 ───────── */
    case 'patty_beef':
      return (
        <g>
          <ellipse cx="32" cy="38" rx="26" ry="13" fill="#6B3A20" />
          <ellipse cx="32" cy="34" rx="26" ry="13" fill="#7E4A29" />
          <ellipse cx="32" cy="34" rx="21" ry="9.5" fill="#8C5531" opacity=".7" />
          {DOT(22, 31, 1.6, 0.35)}
          {DOT(38, 29, 1.4, 0.32)}
          {DOT(45, 36, 1.8, 0.3)}
          {DOT(27, 38, 1.5, 0.3)}
          <path d="M14 33c6 2 12 2 18 0s12-2 18 0" stroke="#2E1A0E" strokeWidth="1.8" fill="none" opacity=".45" />
        </g>
      );

    case 'patty_crispy':
    case 'patty_spicy':
    case 'patty_fish': {
      const tone =
        id === 'patty_crispy'
          ? { a: '#C98733', b: '#E0A851', c: '#A5661D' }
          : id === 'patty_spicy'
            ? { a: '#C9702A', b: '#E08C3E', c: '#9C4E12' }
            : { a: '#D9B26C', b: '#F0D59B', c: '#B78D45' };
      return (
        <g>
          <path
            d="M6 34c2-6 6-9 11-10 4-4 9-4 14-4 6 0 10 2 13 5 5 1 10 4 12 8 2 5-1 9-6 11-5 3-11 4-18 4-8 0-15-1-20-4-4-2-7-6-6-10Z"
            fill={tone.a}
          />
          <path
            d="M12 33c3-4 8-6 13-6 4-3 9-3 13-2 6 1 11 4 13 8"
            stroke={tone.b}
            strokeWidth="3.4"
            fill="none"
            strokeLinecap="round"
            opacity=".8"
          />
          <g fill={tone.c} opacity=".55">
            <circle cx="18" cy="36" r="1.9" />
            <circle cx="29" cy="31" r="1.6" />
            <circle cx="41" cy="35" r="2.1" />
            <circle cx="49" cy="31" r="1.5" />
            <circle cx="24" cy="41" r="1.7" />
            <circle cx="36" cy="40" r="1.5" />
          </g>
        </g>
      );
    }

    case 'patty_grilled':
      return (
        <g>
          <ellipse cx="32" cy="38" rx="26" ry="13" fill="#B0763C" />
          <ellipse cx="32" cy="34" rx="26" ry="13" fill="#C98A4B" />
          <g stroke="#8A5623" strokeWidth="2.2" strokeLinecap="round" opacity=".65">
            <path d="M12 30c7 3 12 3 19 0s12-3 20 0" />
            <path d="M11 36c7 3 13 3 20 0s13-3 21 0" />
            <path d="M13 42c7 2 12 2 19 0s12-2 19 0" />
          </g>
        </g>
      );

    /* ───────── 蔬菜 ───────── */
    case 'lettuce':
      return (
        <g>
          <path
            d="M4 40c-1-6 4-9 9-9-1-5 4-9 9-8-1-5 5-8 10-6 3-4 10-4 12 1 5-1 10 3 9 8 4 2 5 7 2 10-3 4-9 6-15 6-7 0-13 1-19 1-7 0-15-1-17-3Z"
            fill="#7FC24E"
          />
          <path
            d="M9 39c0-4 4-6 8-6-1-4 3-7 7-6 0-4 5-6 9-4 2-3 8-3 10 1 4-1 8 2 7 6 3 1 4 5 2 7-2 3-7 4-12 4-6 0-10 1-15 1-6 0-13-1-16-3Z"
            fill="#96D45F"
          />
          <g stroke="#5E9E34" strokeWidth="1.4" fill="none" opacity=".6">
            <path d="M32 34c0 6 0 10 0 12" />
            <path d="M32 36c-4-2-7-2-10-1" />
            <path d="M32 36c4-2 8-2 11-1" />
            <path d="M32 42c-3-1-6-1-8 0" />
          </g>
        </g>
      );

    case 'tomato':
      return (
        <g>
          <circle cx="32" cy="32" r="25" fill="#B92413" />
          <circle cx="32" cy="32" r="22.5" fill="#EE6A48" />
          {/* 七个心室 */}
          {Array.from({ length: 7 }, (_, i) => {
            const a0 = (i / 7) * Math.PI * 2 - 0.15;
            const a1 = ((i + 1) / 7) * Math.PI * 2 - 0.3;
            const r0 = 6.5;
            const r1 = 19;
            const p = (a: number, r: number) =>
              `${(32 + Math.cos(a) * r).toFixed(1)},${(32 + Math.sin(a) * r).toFixed(1)}`;
            return (
              <path
                key={i}
                d={`M${p(a0, r0)} L${p(a0 + 0.06, r1)} A${r1},${r1} 0 0 1 ${p(a1, r1)} L${p(a1 + 0.2, r0)} Z`}
                fill="#D94A28"
                opacity=".85"
              />
            );
          })}
          <circle cx="32" cy="32" r="6" fill="#F6A184" />
          <g fill="#F9E7B6">
            {Array.from({ length: 7 }, (_, i) => {
              const a = (i / 7) * Math.PI * 2 + 0.35;
              return <ellipse key={i} cx={32 + Math.cos(a) * 13} cy={32 + Math.sin(a) * 13} rx="2" ry="1.1" transform={`rotate(${(a * 180) / Math.PI} 32 32)`} />;
            })}
          </g>
        </g>
      );

    case 'onion':
      // 大块洋葱片：三段同心的弧带，从外到内一层比一层淡。
      // 配色跟 3D 走 —— 洋葱已经从冷紫白改成暖乳白（#E5C4A6 → #FFFCF3），
      // 图标再留着淡紫就成了两样东西。
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M12 45A20 20 0 0 1 50 40" stroke="#D8BC9C" strokeWidth="8" />
          <path d="M19 45A13.5 13.5 0 0 1 45 41" stroke="#EEDFC8" strokeWidth="7" />
          <path d="M26 45A7 7 0 0 1 38 42" stroke="#FBF4E6" strokeWidth="5.5" />
          <path d="M12 45A20 20 0 0 1 50 40" stroke="#BE9F80" strokeWidth="1.4" opacity=".5" />
        </g>
      );

    case 'pickle':
      return (
        <g>
          {[
            [22, 40, 13],
            [40, 36, 12],
            [33, 24, 10],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y + 2.5} r={r} fill="#4F8135" />
              <circle cx={x} cy={y} r={r} fill="#5F9440" />
              <circle cx={x} cy={y} r={r - 3.5} fill="#A8D073" />
              <circle cx={x - r * 0.3} cy={y - r * 0.3} r="2.1" fill="#E8F3C4" opacity=".85" />
              <circle cx={x + r * 0.35} cy={y + r * 0.15} r="1.8" fill="#E8F3C4" opacity=".7" />
              <circle cx={x} cy={y + r * 0.45} r="1.6" fill="#E8F3C4" opacity=".6" />
            </g>
          ))}
        </g>
      );

    /* ───────── 芝士 ───────── */
    case 'cheese':
      return (
        <g transform="rotate(-8 32 32)">
          <path
            d="M8 22 32 12l24 10v16c0 6-5 10-11 8-6-2-11 4-17 2-6-2-11 0-14-4-3-4-6-6-6-11Z"
            fill="#F5A81F"
          />
          <path d="M8 22 32 12l24 10-24 9Z" fill="#FFC44F" />
          <path d="M32 31v18c-3 0-5 1-8 1-3 0-6-1-9-2-4-1-7 1-9-2-2-3-4-5-4-9V22Z" fill="#F8B93C" opacity=".9" />
          <circle cx="24" cy="38" r="2.6" fill="#E59313" opacity=".55" />
          <circle cx="42" cy="36" r="2" fill="#E59313" opacity=".45" />
        </g>
      );

    case 'bacon':
      return (
        <g>
          <path
            d="M9 32c4-7 11-9 18-7 6 2 12 1 17-3 4 4 6 9 5 14-1 6-7 10-14 9-7-1-12 3-19 2-7-1-8-9-7-15Z"
            fill="#B23E28"
          />
          <path
            d="M13 33c4-5 9-6 14-4 6 2 13 1 18-3"
            stroke="#EFC9B4"
            strokeWidth="3.6"
            fill="none"
            strokeLinecap="round"
            opacity=".9"
          />
          <path
            d="M15 42c4-4 9-4 13-2 6 2 12 1 16-3"
            stroke="#EFC9B4"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            opacity=".65"
          />
          <path d="M24 36c3 2 6 2 9 1" stroke="#8C2A17" strokeWidth="1.5" fill="none" opacity=".6" />
        </g>
      );

    case 'hashbrown':
      return (
        <g>
          <ellipse cx="32" cy="35" rx="25" ry="16" fill="#A9762A" />
          <ellipse cx="32" cy="33" rx="25" ry="16" fill="#C08B42" />
          <g stroke="#E0B675" strokeWidth="2" strokeLinecap="round" opacity=".85">
            <path d="M14 32h13" />
            <path d="M31 27h15" />
            <path d="M20 39h12" />
            <path d="M36 40h11" />
            <path d="M26 22h10" />
          </g>
          <g stroke="#8E5C1B" strokeWidth="1.6" strokeLinecap="round" opacity=".6">
            <path d="M16 36h9" />
            <path d="M33 32h13" />
            <path d="M24 44h12" />
          </g>
        </g>
      );

    default:
      /* 酱料：一摊带滴落的酱，颜色由调用方给（这里用中性的番茄酱红） */
      return (
        <g>
          <path
            d="M10 30c2-6 8-10 15-10 4 0 6 2 9 2 4 0 7-3 11-1 5 2 8 6 8 11 0 6-4 9-9 10-4 1-6 4-10 4-3 0-5-2-8-2s-5 3-9 2c-5-1-9-3-10-8-1-3-1-6 3-8Z"
            fill="currentColor"
          />
          <path d="M18 26c4-3 9-3 13 0" stroke="#fff" strokeWidth="2" opacity=".35" strokeLinecap="round" fill="none" />
        </g>
      );
  }
}

/** 酱料用色卡（按食材 id 取色，避免 currentColor 在卡片里继承成文字色） */
export const SAUCE_TINT: Record<string, string> = {
  sauce_mayo: '#E8D093',
  sauce_spicy: '#D24A22',
  sauce_bbq: '#8B4A2E',
  sauce_ketchup: '#CC3220',
  sauce_mustard: '#E7C246',
  sauce_mustard_salad: '#DFCB6E',
  sauce_big: '#E8C477',
};
