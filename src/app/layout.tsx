import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '麦麦汉堡实验室 · 3D DIY 汉堡点单 | i’m lovin’ it',
  description:
    '在浏览器里一层一层堆出一座 3D 汉堡，看看你能不能复原出麦辣鸡腿堡。基于麦当劳 MCP 的真实菜单与配方驱动。',
  keywords: ['麦当劳', '麦麦汉堡实验室', 'MCP', '3D', 'React Three Fiber', '1024', '程序员节'],
};

export const viewport: Viewport = {
  themeColor: '#DA291C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
