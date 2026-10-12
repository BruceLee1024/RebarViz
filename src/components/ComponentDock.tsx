'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Columns3, Footprints, GitMerge, Landmark, Layers, LayoutGrid, ScanLine, Settings, Wallpaper } from 'lucide-react';
import { ContactAuthorButton } from './ContactAuthor';

export const COMPONENT_NAV = [
  { href: '/beam', label: '梁', code: 'KL / LL / JL / JCL', icon: Columns3 },
  { href: '/column', label: '柱', code: 'KZ', icon: Box },
  { href: '/shearwall', label: '墙', code: 'Q', icon: Wallpaper },
  { href: '/slab', label: '板', code: 'LB', icon: LayoutGrid },
  { href: '/joint', label: '节点', code: '', icon: GitMerge },
  { href: '/stair', label: '楼梯', code: 'LT', icon: Footprints },
  { href: '/foundation', label: '基础', code: 'DJ', icon: Landmark },
  { href: '/stripfoundation', label: '条基', code: 'TJ', icon: Landmark },
  { href: '/pilecap', label: '承台', code: 'CT', icon: Layers },
  { href: '/raft', label: '筏板', code: 'FB', icon: Landmark },
];

export function ComponentDock() {
  const pathname = usePathname();
  return (
    <aside className="rv-component-dock" aria-label="构件导航">
      <nav className="rv-dock-links">
        {COMPONENT_NAV.map(({ href, label, code, icon: Icon }) => (
          <Link key={href} href={href} title={`${label} ${code}`} aria-current={pathname === href ? 'page' : undefined}
            className={`rv-dock-link ${pathname === href ? 'is-active' : ''}`}>
            <Icon size={20} strokeWidth={1.6} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="rv-dock-utilities">
        <Link href="/scan" title="图纸扫描" aria-label="图纸扫描" className={`rv-dock-link ${pathname === '/scan' ? 'is-active' : ''}`}>
          <ScanLine size={19} strokeWidth={1.6} /><span>识图</span>
        </Link>
        <Link href="/settings" title="设置 · API 配置" aria-label="设置" className={`rv-dock-link ${pathname === '/settings' ? 'is-active' : ''}`}>
          <Settings size={19} strokeWidth={1.6} /><span>设置</span>
        </Link>
        <ContactAuthorButton collapsed />
      </div>
    </aside>
  );
}
