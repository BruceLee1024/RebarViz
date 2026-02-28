'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Columns3, Box, LayoutGrid, GitMerge, ChevronLeft, ChevronRight, PanelLeftOpen, Settings, Wallpaper } from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { href: '/beam', label: '梁 KL', desc: '框架梁', icon: Columns3 },
  { href: '/column', label: '柱 KZ', desc: '框架柱', icon: Box },
  { href: '/shearwall', label: '墙 Q', desc: '剪力墙', icon: Wallpaper },
  { href: '/slab', label: '板 LB', desc: '楼板', icon: LayoutGrid },
  { href: '/joint', label: '节点', desc: '梁柱节点', icon: GitMerge },
];

type SidebarMode = 'expanded' | 'collapsed' | 'hidden';

export function Sidebar() {
  const pathname = usePathname();
  const [mode, setMode] = useState<SidebarMode>('expanded');

  const hidden = mode === 'hidden';
  const collapsed = mode === 'collapsed';

  /** Cycle: expanded → collapsed → hidden → expanded */
  const handleToggle = () => {
    setMode(prev => {
      if (prev === 'expanded') return 'collapsed';
      if (prev === 'collapsed') return 'hidden';
      return 'expanded';
    });
  };

  return (
    <>
      {/* Floating show button when sidebar is hidden */}
      {hidden && (
        <button
          onClick={() => setMode('expanded')}
          className="hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-6 h-12 bg-white border border-l-0 border-gray-200 rounded-r-lg shadow-sm text-gray-400 hover:text-accent hover:bg-gray-50 cursor-pointer transition-colors"
          aria-label="显示侧边栏"
        >
          <PanelLeftOpen className="w-3.5 h-3.5" />
        </button>
      )}

      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-gray-200 bg-gray-50 transition-all duration-200 overflow-hidden ${
          hidden ? 'w-0 border-r-0' : collapsed ? 'w-16' : 'w-52'
        }`}
      >
        <nav className="flex-1 py-3 px-2 space-y-1">
          {NAV.map(({ href, label, desc, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="truncate">{label}</div>
                    <div
                      className={`text-[11px] truncate ${
                        active ? 'text-accent/70' : 'text-gray-400'
                      }`}
                    >
                      {desc}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Settings link at bottom */}
        <div className="px-2 pb-1">
          <Link
            href="/settings"
            title={collapsed ? '设置' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              pathname === '/settings'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate">设置</div>
                <div
                  className={`text-[11px] truncate ${
                    pathname === '/settings' ? 'text-accent/70' : 'text-gray-400'
                  }`}
                >
                  API 配置
                </div>
              </div>
            )}
          </Link>
        </div>

        <button
          onClick={handleToggle}
          className="flex items-center justify-center py-3 border-t border-gray-200 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          aria-label={collapsed ? '隐藏侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />}
        </button>
      </aside>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 flex">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
              active ? 'text-accent' : 'text-gray-400'
            }`}
          >
            <Icon className={`w-5 h-5 ${active ? 'text-accent' : ''}`} />
            {label}
          </Link>
        );
      })}
      <Link
        href="/settings"
        className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
          pathname === '/settings' ? 'text-accent' : 'text-gray-400'
        }`}
      >
        <Settings className={`w-5 h-5 ${pathname === '/settings' ? 'text-accent' : ''}`} />
        设置
      </Link>
    </nav>
  );
}
