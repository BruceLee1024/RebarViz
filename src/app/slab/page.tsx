import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SlabPageClient } from './SlabPageClient';

export const metadata: Metadata = {
  title: '板平法识图 - 3D 配筋可视化 | RebarViz',
  description: '在线学习楼板平法标注，3D可视化查看底筋、面筋、分布筋构造。支持自定义板厚和配筋参数。',
  keywords: '板平法,楼板配筋,底筋,面筋,分布筋,22G101,板配筋图',
};

export default function SlabPage() {
  return (
    <Suspense>
      <SlabPageClient />
    </Suspense>
  );
}
