import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BeamPageClient } from './BeamPageClient';

export const metadata: Metadata = {
  title: '梁平法识图 - 3D 配筋可视化 | RebarViz',
  description: '在线学习框架梁(KL)平法标注，3D可视化查看上部通长筋、下部通长筋、箍筋加密区构造。支持自定义截面尺寸和配筋参数。',
  keywords: '梁平法,KL,框架梁,上部通长筋,下部通长筋,箍筋加密区,22G101,配筋图',
};

export default function BeamPage() {
  return (
    <Suspense>
      <BeamPageClient />
    </Suspense>
  );
}
