import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ColumnPageClient } from './ColumnPageClient';

export const metadata: Metadata = {
  title: '柱平法识图 - 3D 配筋可视化 | RebarViz',
  description: '在线学习框架柱(KZ)平法标注，3D可视化查看纵筋分布、箍筋加密区构造。支持自定义截面尺寸和配筋参数。',
  keywords: '柱平法,KZ,框架柱,纵向钢筋,箍筋加密区,22G101,配筋图',
};

export default function ColumnPage() {
  return (
    <Suspense>
      <ColumnPageClient />
    </Suspense>
  );
}
