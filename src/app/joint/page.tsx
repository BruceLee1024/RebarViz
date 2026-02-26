import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JointPageClient } from './JointPageClient';

export const metadata: Metadata = {
  title: '梁柱节点构造 - 3D 配筋可视化 | RebarViz',
  description: '在线学习梁柱节点构造详图，3D可视化查看梁筋锚固（直锚/弯锚）、节点区箍筋加密、柱纵筋贯穿等关键构造。',
  keywords: '梁柱节点,节点构造,锚固,弯锚,直锚,节点区箍筋,22G101,框架节点',
};

export default function JointPage() {
  return (
    <Suspense>
      <JointPageClient />
    </Suspense>
  );
}
