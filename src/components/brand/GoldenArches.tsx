/**
 * 品牌标识组件
 *
 * 【为什么换成官方路径】
 * 第一版是自己手搓的两个 subpath（外轮廓 + 内轮廓用 fill-rule="evenodd" 求差）。
 * 形状能认出是 M，但三处比例全错：
 *   · 腿太细、拱太窄 —— 官方两条腿占了整个宽度的 1/4，拱顶几乎是半圆
 *   · 中心尖太深 —— 手搓版 V 底落到 63% 高度，官方只有 34%（是一段**圆底**的谷）
 *   · 内轮廓在中心附近和 arc 相交，evenodd 求出差集时留下一道发白的缝
 * 现在改用 simple-icons 收录的官方商标轮廓（CC0 授权，几何取自官方 logo）：
 * 一条闭合路径，viewBox 24×24，字形实际占 x 0–24 / y 1.5–22.5。
 *
 * 尺寸参考：单色标在 24px 高度下仍能读出两个拱和中间的圆谷，
 * 再往下（<20px）两条腿会粘成一坨，该换成纯色方块 App Icon。
 */

type ArchProps = {
  className?: string;
  /** 有 title 时按 img 语义暴露给读屏，否则当作纯装饰 */
  title?: string;
};

/** 官方金拱门轮廓（simple-icons `mcdonalds`，CC0） */
const ARCH_PATH =
  'M17.243 3.006c2.066 0 3.742 8.714 3.742 19.478H24c0-11.588-3.042-20.968-6.766-20.968' +
  '-2.127 0-4.007 2.81-5.248 7.227-1.241-4.416-3.121-7.227-5.231-7.227C3.031 1.516 0 10.888 0 22.476' +
  'h3.014c0-10.763 1.658-19.47 3.724-19.47 2.066 0 3.741 8.05 3.741 17.98h2.997c0-9.93 1.684-17.98 3.75-17.98Z';

export function GoldenArches({ className, title }: ArchProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path d={ARCH_PATH} />
    </svg>
  );
}

/**
 * App Icon 式标识：红底圆角方块 + 黄拱。
 * 官方 App Icon 的留白是「拱占宽 72%、上下各留 12%」，
 * 所以这里不用固定 62%，直接给 svg 一个 max-width 让它在方块里居中。
 * 尺寸参数控制在 28–44px，再大就该换成横版 lockup 了。
 */
export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`brand-mark grid shrink-0 place-items-center bg-[#DA291C] ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
      aria-hidden
    >
      <GoldenArches className="text-[#FFC72C]" />
    </span>
  );
}

/**
 * 品牌语。官方是手写斜体，这里用系统字体的 italic + 收紧字距近似，
 * 只在前缀加一个撇号，不伪装成原版字体。
 */
export function LoveIt({ className = '' }: { className?: string }) {
  return (
    <span className={`font-semibold italic tracking-tight ${className}`}>
      i&apos;m lovin&apos; it
    </span>
  );
}
