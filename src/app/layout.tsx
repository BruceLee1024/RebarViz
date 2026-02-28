import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '钢筋平法识图 - 3D 配筋可视化学习工具 | RebarViz',
  description:
    '在线学习钢筋平法标注，3D可视化查看梁、柱配筋构造，快速掌握22G101图集识图技巧。支持自定义参数，交互式三维查看。',
  keywords: '钢筋平法,平法识图,22G101,配筋图,3D可视化,工程造价,钢筋翻样,梁配筋,柱配筋',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
        <body className={`${geist.variable} font-sans antialiased bg-gray-50 text-gray-800`}>
        <Header />
        {children}
      </body>
    </html>
  );
}
