'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Columns3, Box, LayoutGrid, GitMerge,
  RotateCcw, MousePointerClick, Scissors, BookOpen, Sparkles, Layers,
  ChevronDown, Zap, Eye, Brain,
} from 'lucide-react';

/* ─── Full-screen animated mesh background ─── */
function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;
    let mouseX = 0.5, mouseY = 0.5;

    const handleMouse = (e: MouseEvent) => {
      mouseX = e.clientX / window.innerWidth;
      mouseY = e.clientY / window.innerHeight;
    };
    window.addEventListener('mousemove', handleMouse);

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    interface Node { x: number; y: number; baseX: number; baseY: number; vx: number; vy: number; }
    const cols = 18, rows = 10;
    const nodes: Node[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c / (cols - 1)) * canvas.offsetWidth;
        const y = (r / (rows - 1)) * canvas.offsetHeight;
        nodes.push({ x, y, baseX: x, baseY: y, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15 });
      }
    }

    let time = 0;
    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      time += 0.003;

      // Update nodes with gentle wave + mouse repulsion
      for (const n of nodes) {
        const wave = Math.sin(time + n.baseX * 0.003) * 8 + Math.cos(time * 0.7 + n.baseY * 0.004) * 6;
        n.x = n.baseX + wave + n.vx * Math.sin(time * 2);
        n.y = n.baseY + Math.cos(time + n.baseX * 0.002) * 6 + n.vy * Math.cos(time * 2);

        // Mouse influence
        const dx = n.x / w - mouseX;
        const dy = n.y / h - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.15) {
          const force = (0.15 - dist) * 60;
          n.x += (dx / dist) * force;
          n.y += (dy / dist) * force;
        }
      }

      // Draw connections
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const n = nodes[i];
          // Right neighbor
          if (c < cols - 1) {
            const right = nodes[i + 1];
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(right.x, right.y);
            ctx.strokeStyle = 'rgba(59,130,246,0.06)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
          // Bottom neighbor
          if (r < rows - 1) {
            const bottom = nodes[i + cols];
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(bottom.x, bottom.y);
            ctx.strokeStyle = 'rgba(59,130,246,0.06)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,130,246,0.12)';
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', handleMouse); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Animated counter ─── */
function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const duration = 1500;
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{value}{suffix}</span>;
}

/* ─── Scroll-reveal wrapper ─── */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── Data ─── */
const FEATURES = [
  { icon: RotateCcw, title: '3D 交互查看', desc: '旋转、缩放、平移，从任意角度观察配筋构造', color: 'from-blue-500 to-cyan-400', bg: 'bg-blue-50' },
  { icon: MousePointerClick, title: '点击识别', desc: '点击任意钢筋，即时显示该钢筋的详细信息', color: 'from-violet-500 to-purple-400', bg: 'bg-violet-50' },
  { icon: Scissors, title: '剖切视图', desc: '沿构件任意位置剖切，查看截面配筋详情', color: 'from-orange-500 to-amber-400', bg: 'bg-orange-50' },
  { icon: BookOpen, title: '标注自动解读', desc: '输入平法标注，自动解析钢筋等级、直径、间距', color: 'from-emerald-500 to-green-400', bg: 'bg-emerald-50' },
  { icon: Sparkles, title: 'AI 平法助手', desc: '接入 DeepSeek / Qwen / Kimi，随时提问构造问题', color: 'from-pink-500 to-rose-400', bg: 'bg-pink-50' },
  { icon: Layers, title: '截面配筋图', desc: '同步生成 2D 截面示意，对照理解更直观', color: 'from-indigo-500 to-blue-400', bg: 'bg-indigo-50' },
];

const COMPONENTS = [
  {
    href: '/beam', icon: Columns3, title: '梁', code: 'KL',
    desc: '集中标注与原位标注，支座负筋、箍筋加密区、22G101端锚构造',
    tags: ['集中标注', '原位标注', '支座负筋', '箍筋加密区', '直锚/弯锚'],
    gradient: 'from-blue-600 to-cyan-500', light: 'bg-blue-50 border-blue-100',
  },
  {
    href: '/column', icon: Box, title: '柱', code: 'KZ',
    desc: '纵筋分布、箍筋加密区、搭接区域可视化',
    tags: ['纵向钢筋', '箍筋加密区', '角筋', '搭接区域'],
    gradient: 'from-violet-600 to-purple-500', light: 'bg-violet-50 border-violet-100',
  },
  {
    href: '/slab', icon: LayoutGrid, title: '板', code: 'LB',
    desc: '底筋、面筋、分布筋双向配筋可视化',
    tags: ['X/Y向底筋', '面筋', '分布筋', '板厚'],
    gradient: 'from-emerald-600 to-green-500', light: 'bg-emerald-50 border-emerald-100',
  },
  {
    href: '/joint', icon: GitMerge, title: '节点', code: 'Joint',
    desc: '节点核心区构造详图，梁筋锚固、节点区箍筋加密',
    tags: ['弯锚', '直锚', '节点区箍筋', '中间/边节点'],
    gradient: 'from-orange-600 to-amber-500', light: 'bg-orange-50 border-orange-100',
  },
];

const STATS = [
  { value: 4, suffix: '种', label: '构件类型' },
  { value: 22, suffix: 'G101', label: '图集标准' },
  { value: 3, suffix: '个', label: 'AI 模型接入' },
  { value: 100, suffix: '%', label: '免费开源' },
];

/* ─── Main Landing Page ─── */
export function LandingPage() {
  return (
    <main className="bg-[#0a0f1a] text-white overflow-hidden">

      {/* ═══════ HERO — full viewport, cinematic ═══════ */}
      <section className="relative min-h-screen flex items-center justify-center">
        <MeshBackground />

        {/* Large gradient orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[700px] h-[700px] rounded-full bg-blue-500/[0.07] blur-[150px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-purple-500/[0.06] blur-[130px] pointer-events-none" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-cyan-400/[0.05] blur-[100px] pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
          {/* Badge */}
          <Reveal>
            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-sm mb-10 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-gray-300">基于 22G101 图集</span>
            </div>
          </Reveal>

          {/* Title — large and cinematic */}
          <Reveal delay={100}>
            <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.95] mb-8">
              <span className="block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-gray-500">
                钢筋平法识图
              </span>
              <span className="block bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 mt-2">
                3D 可视化学习
              </span>
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="text-lg sm:text-xl lg:text-2xl text-gray-400 max-w-3xl mx-auto mb-14 leading-relaxed font-light">
              输入平法标注，即时生成三维配筋模型
              <br className="hidden sm:block" />
              旋转查看构造细节，AI 助手随时答疑
            </p>
          </Reveal>

          {/* CTA — prominent */}
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row gap-5 justify-center">
              <Link
                href="/beam"
                className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 text-lg font-bold rounded-2xl overflow-hidden transition-all hover:shadow-[0_0_60px_rgba(59,130,246,0.3)] cursor-pointer bg-gradient-to-r from-blue-500 to-cyan-400 text-white"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center gap-2">
                  开始学习
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-10 py-5 text-lg border border-white/15 rounded-2xl text-gray-300 hover:bg-white/5 hover:border-white/25 transition-all cursor-pointer backdrop-blur-sm"
              >
                了解更多
                <ChevronDown className="w-5 h-5" />
              </a>
            </div>
          </Reveal>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="text-[11px] text-gray-500 tracking-widest uppercase">Scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-gray-500 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ═══════ STATS BAR ═══════ */}
      <section className="relative border-y border-white/[0.06]">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.03] via-transparent to-purple-500/[0.03]" />
        <div className="relative max-w-6xl mx-auto px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
          {STATS.map(({ value, suffix, label }, i) => (
            <Reveal key={label} delay={i * 100}>
              <div className="text-center">
                <div className="text-4xl sm:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                  <AnimatedNumber target={value} suffix={suffix} />
                </div>
                <div className="text-sm text-gray-500 mt-2 tracking-wide">{label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════ FEATURES — large cards ═══════ */}
      <section id="features" className="relative py-28 sm:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-5">
                <Zap className="w-3.5 h-3.5" /> 核心功能
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight">
                为什么用 <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">RebarViz</span>
              </h2>
              <p className="text-gray-500 mt-4 text-lg max-w-xl mx-auto">六大核心功能，让平法识图从此不再枯燥</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="group relative bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 cursor-default h-full">
                  <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${color} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300`} />
                  <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-5 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-gray-400 leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ COMPONENTS — showcase cards ═══════ */}
      <section className="relative py-28 sm:py-36">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-5">
                <Eye className="w-3.5 h-3.5" /> 构件类型
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight">选择构件，开始学习</h2>
              <p className="text-gray-500 mt-4 text-lg">点击进入对应的 3D 识图学习页面</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {COMPONENTS.map(({ href, icon: Icon, title, code, desc, tags, gradient }, i) => (
              <Reveal key={href} delay={i * 100}>
                <Link
                  href={href}
                  className="group relative block bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8 hover:bg-white/[0.06] hover:border-white/[0.15] transition-all duration-300 overflow-hidden cursor-pointer"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500`} />
                  <div className="relative flex items-center gap-5 mb-5">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-bold text-white">{title}</h3>
                        <span className="text-xs font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">{code}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{desc}</p>
                    </div>
                  </div>
                  <div className="relative flex flex-wrap gap-2 mb-5">
                    {tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-white/5 border border-white/5 text-xs text-gray-400 rounded-lg">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="relative flex items-center gap-1.5 text-sm font-medium text-gray-500 group-hover:text-white transition-colors">
                    进入学习
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ AI SECTION — cinematic card ═══════ */}
      <section className="relative py-28 sm:py-36 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="relative bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/[0.08] rounded-[2rem] p-10 sm:p-16 overflow-hidden">
              {/* Decorative glows */}
              <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-500/10 rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

              <div className="relative grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-medium mb-5">
                    <Brain className="w-3.5 h-3.5" /> AI 驱动
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-black mb-5">
                    AI <span className="bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400">平法助手</span>
                  </h2>
                  <p className="text-gray-400 leading-relaxed text-lg mb-8">
                    接入 DeepSeek、通义千问、Kimi 三大模型，随时提问 22G101 图集和钢筋构造问题。
                    AI 会结合你当前查看的构件参数，给出针对性的专业解答。
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {['DeepSeek', '通义千问', 'Kimi'].map(name => (
                      <span key={name} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 font-medium">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mock chat UI */}
                <div className="bg-[#0d1320] border border-white/10 rounded-2xl p-5 shadow-2xl">
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                    <Sparkles className="w-5 h-5 text-pink-400" />
                    <span className="font-medium text-gray-300">AI 平法助手</span>
                    <span className="ml-auto text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">DeepSeek</span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <div className="bg-blue-500 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%]">
                        梁端弯锚的弯折段长度怎么算？
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 text-gray-300 text-sm px-4 py-3 rounded-2xl rounded-bl-md max-w-[85%] leading-relaxed">
                        根据 22G101-1，梁端弯锚的弯折段长度为 <span className="text-cyan-400 font-mono font-medium">15d</span>（d 为钢筋直径）。
                        例如 Φ25 钢筋，弯折段 = 15 × 25 = <span className="text-cyan-400 font-mono font-medium">375mm</span>。
                        直段部分需 ≥ <span className="text-cyan-400 font-mono font-medium">0.4laE</span>。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="relative py-32 sm:py-40">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-500/[0.06] to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="text-5xl sm:text-7xl font-black tracking-tight mb-8">
              准备好了吗？
            </h2>
            <p className="text-xl text-gray-400 mb-14 max-w-2xl mx-auto">
              选择一个构件类型，开始你的 3D 平法识图之旅
            </p>
            <div className="flex flex-wrap justify-center gap-5">
              {COMPONENTS.map(({ href, icon: Icon, title, code, gradient }) => (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-3 px-8 py-4 bg-gradient-to-r ${gradient} rounded-2xl font-bold text-white text-lg hover:shadow-[0_0_40px_rgba(59,130,246,0.2)] transition-all cursor-pointer`}
                >
                  <Icon className="w-6 h-6" />
                  {title} {code}
                  <ArrowRight className="w-5 h-5 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="font-bold text-lg text-gray-300">RebarViz</span>
            </div>
            <p className="text-sm text-gray-600">
              基于 22G101-1/2/3 系列图集 · 仅供学习参考
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
