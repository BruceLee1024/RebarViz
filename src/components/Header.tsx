'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Columns3, LayoutGrid, GitMerge, Menu, X, Wallpaper, Footprints, Sparkles, Github } from 'lucide-react';
import { COMPONENT_NAV } from './ComponentDock';

const NAV = [
  { href: '/beam', label: '梁类', icon: Columns3 },
  { href: '/column', label: '柱 KZ', icon: Box },
  { href: '/shearwall', label: '墙 Q', icon: Wallpaper },
  { href: '/slab', label: '板 LB', icon: LayoutGrid },
  { href: '/joint', label: '节点', icon: GitMerge },
  { href: '/stair', label: '楼梯 LT', icon: Footprints },
];

export function Header() {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isLanding) {
    const current = COMPONENT_NAV.find(item => item.href === pathname);
    return (
      <header className="rv-theme rv-app-header">
        <Link href="/" className="rv-brand" aria-label="RebarViz 首页">
          <span className="rv-brand-icon"><Box size={21} strokeWidth={1.7} /></span>
          <span>Rebar<span className="rv-brand-accent">Viz</span><small>钢筋平法识图 · 22G101</small></span>
        </Link>
        <div className="rv-header-divider" />
        <div className="rv-breadcrumb"><span>构件工作台</span><span>/</span><strong>{current ? `${current.label} ${current.code}` : ({ '/settings': '设置', '/api-help': 'API 配置帮助', '/scan': '图纸扫描' }[pathname] || '工作台')}</strong></div>
        <Link href="/settings" className="rv-header-settings">API 配置</Link>
      </header>
    );
  }

  return (
    <header className={`rv-theme sticky top-0 z-50 backdrop-blur-md border-b transition-colors ${
      isLanding
        ? 'bg-[#0a0f1a]/80 border-white/5'
        : 'bg-white/80 border-gray-200'
    }`}>
      <div className={`${isLanding ? 'w-full' : 'max-w-[1600px] mx-auto'} px-4 h-14 flex items-center justify-between`}>
        <Link href="/" className="rv-brand" onClick={() => setMobileOpen(false)}>
          <span className="rv-brand-icon"><Box size={21} strokeWidth={1.7} /></span>
          <span>Rebar<span className="rv-brand-accent">Viz</span><small>钢筋平法识图 · 22G101</small></span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isLanding
                    ? active ? 'text-white bg-white/10' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    : active ? 'text-accent bg-accent/10' : 'text-muted hover:bg-gray-100 hover:text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {isLanding && (
          <div className="flex items-center gap-2">
            <a
              href="#features"
              className="hidden lg:inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <Sparkles className="h-4 w-4 text-blue-300" />
              AI 助手
            </a>
            <a
              href="https://github.com/BruceLee1024/RebarViz"
              target="_blank"
              rel="noreferrer"
              className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <Link
              href="/beam"
              className="hidden sm:inline-flex items-center rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-400"
            >
              开始学习
            </Link>
            <button
              className="md:hidden p-2 rounded-lg cursor-pointer transition-colors text-gray-400 hover:bg-white/10"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        )}
      </div>

      {/* Mobile dropdown (landing only) */}
      {mobileOpen && isLanding && (
        <nav className="sm:hidden border-t px-4 py-2 space-y-1 border-white/5 bg-[#0a0f1a]/95 backdrop-blur-md">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'text-white bg-white/10' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

/** Fixed bottom tab bar visible on mobile app pages */
export function MobileBottomNav() {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  if (isLanding) return null;

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-stretch safe-bottom">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              active ? 'text-accent' : 'text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
