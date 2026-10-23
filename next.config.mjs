/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three / drei 走 ESM，Next 默认即可，无需 transpilePackages
  //
  // 允许用环境变量切换产物目录：某些沙箱环境对「清空 .next 里的上百个文件」
  // 有批量删除保护，构建会中途失败。此时用 MCODE_DIST_DIR=.next-build
  // 构建到一个全新目录即可绕开，build / start 两边要带同一个值。
  distDir: process.env.MCODE_DIST_DIR || '.next',
};

export default nextConfig;
