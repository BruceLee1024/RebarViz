'use client';

import Image from 'next/image';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Upload, Camera, ChevronLeft, Sparkles, Loader2, AlertCircle,
  CheckCircle, ChevronDown, ArrowRight, X, Eye, FileImage, Info,
  TriangleAlert, RotateCcw,
} from 'lucide-react';
import { AI_PROVIDERS } from '@/lib/ai-providers';
import { getApiKey } from '@/lib/api-keys';
import { aiFetch } from '@/lib/ai-fetch';
import { buildScanSystemPrompt, parseScanResult, type ScanResult } from '@/lib/ai-vision-prompt';
import type { ComponentType } from '@/lib/types';

const COMPONENT_LABELS: Record<ComponentType, string> = {
  beam: '框架梁', column: '框架柱', slab: '楼板', joint: '梁柱节点',
  shearwall: '剪力墙', stair: '楼梯', foundation: '独立基础', stripfoundation: '条形基础',
  pilecap: '承台', raft: '筏板基础',
};

const COMPONENT_ROUTES: Record<ComponentType, string> = {
  beam: '/beam', column: '/column', slab: '/slab', joint: '/joint',
  shearwall: '/shearwall', stair: '/stair', foundation: '/foundation', stripfoundation: '/stripfoundation',
  pilecap: '/pilecap', raft: '/raft',
};

const COMPONENT_COLORS: Record<ComponentType, string> = {
  beam: 'bg-blue-500', column: 'bg-violet-500', slab: 'bg-emerald-500',
  joint: 'bg-orange-500', shearwall: 'bg-rose-500', stair: 'bg-cyan-500',
  foundation: 'bg-teal-500', stripfoundation: 'bg-cyan-500', pilecap: 'bg-sky-500', raft: 'bg-indigo-500',
};

const PARAM_LABELS: Record<string, string> = {
  sectionWidth: '截面宽 (mm)', sectionHeight: '截面高 (mm)', thickness: '板厚 (mm)',
  topRebar: '上部通长筋', bottomRebar: '下部通长筋', stirrup: '箍筋',
  leftSupport: '左支座负筋', rightSupport: '右支座负筋', sideBar: '腰筋',
  mainRebar: '纵向钢筋', bottomRebarX: 'X向底筋', bottomRebarY: 'Y向底筋',
  topRebarX: 'X向面筋', topRebarY: 'Y向面筋', verticalRebar: '竖向分布筋',
  horizontalRebar: '水平分布筋', pileCount: '桩数', stepCount: '踏步数',
  stepWidth: '踏步宽 (mm)', stepHeight: '踏步高 (mm)', slabThickness: '梯板厚 (mm)',
  bx: 'X向尺寸 (mm)', by: 'Y向尺寸 (mm)', totalHeight: '总高 (mm)', height: '高度 (mm)',
  length: '长度 (mm)', width: '宽度 (mm)', bottomBar: '底部横向筋', distBar: '分布筋',
  topBar: '顶部横向筋', topDistBar: '顶部分布筋', supportWidth: '支承宽度 (mm)', supportSpacing: '双梁(墙)中心距 (mm)',
};

async function compressImage(dataUrl: string, maxSize = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
        else { width = Math.round((width / height) * maxSize); height = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

function formatParamValue(key: string, value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('count' in obj && 'grade' in obj && 'diameter' in obj) {
      return `${obj.count}根 ${obj.grade} Φ${obj.diameter}`;
    }
    if ('diameter' in obj && 'spacing' in obj) {
      return `Φ${obj.diameter}@${obj.spacing}`;
    }
    if ('row1' in obj) {
      const r1 = obj.row1 as Record<string, unknown>;
      const base = `${r1.count}根 ${r1.grade} Φ${r1.diameter}`;
      if (obj.row2) {
        const r2 = obj.row2 as Record<string, unknown>;
        return `${base} + ${r2.count}根 Φ${r2.diameter}`;
      }
      return base;
    }
    if ('spacingDense' in obj) {
      return `${obj.grade} Φ${obj.diameter} @${obj.spacingDense}/${obj.spacingNormal}(${obj.legs}肢)`;
    }
    return JSON.stringify(obj);
  }
  return String(value);
}

export function ScanPage() {
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [showRawAnnotations, setShowRawAnnotations] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const visionProviders = AI_PROVIDERS.filter(p => p.visionModel && getApiKey(p.id));
  // Prefer Kimi (kimi-k2.5) for scan — best vision quality for structural drawings
  const defaultProviderId = visionProviders.find(p => p.id === 'kimi')?.id
    || visionProviders[0]?.id
    || '';
  const effectiveProviderId = selectedProviderId || defaultProviderId;
  const effectiveProvider = AI_PROVIDERS.find(p => p.id === effectiveProviderId);

  // Load pending scan image from sessionStorage (passed from landing page)
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem('pending_scan_image');
      if (pending) {
        sessionStorage.removeItem('pending_scan_image');
        setImages([pending]);
      }
    } catch {
      // ignore
    }
  }, []);

  const addImages = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const file of fileArray) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const raw = e.target?.result as string;
        if (raw) {
          const compressed = await compressImage(raw, 1200);
          setImages(prev => [...prev, compressed]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addImages(e.dataTransfer.files);
  }, [addImages]);

  const handleRecognize = async () => {
    if (!images.length || !effectiveProvider) return;
    const apiKey = getApiKey(effectiveProviderId);
    if (!apiKey) {
      setError(`请先在设置中配置 ${effectiveProvider.name} 的 API Key`);
      return;
    }

    setIsRecognizing(true);
    setError(null);
    setScanResult(null);

    try {
      const visionModel = effectiveProvider.visionModel!;
      const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
        { type: 'text', text: '请识别这张结构施工图，按要求输出 JSON 格式的识别结果。' },
        ...images.map(img => ({ type: 'image_url' as const, image_url: { url: img } })),
      ];

      const { response } = await aiFetch({
        provider: effectiveProvider,
        model: visionModel,
        apiKey,
        systemPrompt: buildScanSystemPrompt(),
        messages: [{ role: 'user', content }],
        stream: false,
        temperature: 0.1,
        max_tokens: 2048,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`识别失败 (${response.status})${errText ? ': ' + errText.slice(0, 200) : ''}`);
      }

      const data = await response.json();
      const rawContent: string = data.choices?.[0]?.message?.content || '';
      const result = parseScanResult(rawContent);

      if (!result) {
        throw new Error(`无法解析识别结果。请尝试换一个模型，或检查图纸清晰度。\n原始返回: ${rawContent.slice(0, 300)}`);
      }

      setScanResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '识别失败，请重试');
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleBuildModel = () => {
    if (!scanResult) return;
    const route = COMPONENT_ROUTES[scanResult.detectedType];
    const message = `图纸扫描已识别: ${scanResult.summary}\n请立即调用 modify_params 工具应用以下配筋参数:\n${JSON.stringify(scanResult.params)}`;
    router.push(`${route}?ai=${encodeURIComponent(message)}`);
  };

  const confidenceColor = scanResult
    ? scanResult.confidence >= 0.8 ? 'text-emerald-400'
      : scanResult.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400'
    : '';

  const confidenceBgColor = scanResult
    ? scanResult.confidence >= 0.8 ? 'bg-emerald-500'
      : scanResult.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
    : '';

  return (
    <div className="rv-scan-page">
      {/* Header */}
      <div className="rv-scan-heading">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            返回首页
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-gray-100">图纸扫描识别</span>
          </div>
          <p className="ml-auto text-xs text-gray-600 hidden sm:block">
            上传施工图 · AI 提取配筋信息 · 自动建模
          </p>
        </div>
      </div>

      <div className="rv-utility-page space-y-5">

        {/* ── Upload zone ── */}
        {images.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer select-none ${
              isDragging
                ? 'border-blue-400/70 bg-blue-500/10 scale-[1.01]'
                : 'border-white/[0.12] hover:border-white/25 hover:bg-white/[0.02]'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all ${
                isDragging ? 'bg-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'bg-white/[0.05]'
              }`}>
                <Upload className={`w-9 h-9 transition-colors ${isDragging ? 'text-blue-400' : 'text-gray-500'}`} />
              </div>
              <div>
                <p className="text-lg font-medium text-gray-200">拖拽图纸到这里</p>
                <p className="text-sm text-gray-500 mt-1.5">
                  或点击选择图片 · 支持 JPG / PNG / WEBP
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center mt-1">
                {['CAD 截图', '手绘草图', '平面图', '截面图', '配筋详图', '柱表'].map(t => (
                  <span
                    key={t}
                    className="px-2.5 py-1 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-gray-500"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Image previews ── */
          <div className="space-y-3">
            <p className="text-xs text-gray-500">已上传图片</p>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <Image
                    src={img}
                    alt={`图纸 ${i + 1}`}
                    width={144}
                    height={144}
                    unoptimized
                    className="h-36 w-36 rounded-xl border border-white/[0.1] object-cover shadow-lg"
                  />
                  {!scanResult && (
                    <button
                      onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {!scanResult && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-36 h-36 flex flex-col items-center justify-center gap-2 border border-dashed border-white/[0.12] rounded-xl text-gray-600 hover:border-white/25 hover:text-gray-400 transition-colors cursor-pointer"
                >
                  <FileImage className="w-6 h-6" />
                  <span className="text-xs">添加图片</span>
                </button>
              )}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) addImages(e.target.files); e.target.value = ''; }}
        />

        {/* ── Model selection & Start button ── */}
        {images.length > 0 && !scanResult && (
          <div className="flex items-end gap-3">
            {visionProviders.length > 0 ? (
              <>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1.5 block">Vision 识别模型</label>
                  <select
                    value={effectiveProviderId}
                    onChange={e => setSelectedProviderId(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-blue-400/50 cursor-pointer"
                  >
                    {visionProviders.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#0d1525]">
                        {p.name} · {p.visionModel}{p.id === 'kimi' ? ' ✦ 推荐' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleRecognize}
                  disabled={isRecognizing}
                  className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap"
                >
                  {isRecognizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {isRecognizing ? '识别中...' : '开始识别'}
                </button>
              </>
            ) : (
              <div className="w-full flex items-center gap-3 px-4 py-3.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl text-sm text-amber-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>未发现支持图片识别的模型。请在设置中配置 Qwen / OpenAI / Kimi API Key</span>
                <Link href="/settings" className="ml-auto underline text-xs hover:text-amber-300 whitespace-nowrap cursor-pointer">
                  前往设置
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Progress ── */}
        {isRecognizing && (
          <div className="flex items-center gap-3 px-5 py-4 bg-blue-500/[0.08] border border-blue-500/20 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-300">AI 正在分析图纸...</p>
              <p className="text-xs text-blue-400/50 mt-0.5">识别构件类型、配筋标注和截面尺寸</p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-3 px-4 py-3.5 bg-red-500/[0.08] border border-red-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-400">识别失败</p>
              <p className="text-xs mt-1 text-red-400/60 break-all">{error}</p>
            </div>
            <button
              onClick={() => { setError(null); setScanResult(null); }}
              className="shrink-0 p-1 hover:bg-white/5 rounded cursor-pointer text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Scan Results ── */}
        {scanResult && (
          <div className="space-y-4">
            {/* Component type header */}
            <div className="flex items-center gap-4 px-5 py-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl">
              <div className={`w-11 h-11 rounded-xl ${COMPONENT_COLORS[scanResult.detectedType]} flex items-center justify-center shrink-0 shadow-lg`}>
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-semibold text-gray-100 text-base">
                    {COMPONENT_LABELS[scanResult.detectedType]}
                    {scanResult.componentId ? (
                      <span className="ml-1.5 text-gray-400 font-normal text-sm">
                        {scanResult.componentId}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-12 rounded-full bg-white/10 overflow-hidden`}>
                      <div
                        className={`h-full rounded-full ${confidenceBgColor} transition-all`}
                        style={{ width: `${Math.round(scanResult.confidence * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${confidenceColor}`}>
                      {Math.round(scanResult.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-0.5 truncate">{scanResult.summary}</p>
              </div>
              <button
                onClick={() => { setScanResult(null); }}
                className="shrink-0 p-2 rounded-lg hover:bg-white/[0.08] text-gray-600 hover:text-gray-300 transition-colors cursor-pointer"
                title="重新识别"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Params table */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">提取的配筋参数</h3>
                {scanResult.uncertain.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <TriangleAlert className="w-3 h-3" />
                    {scanResult.uncertain.length} 项不确定
                  </span>
                )}
              </div>
              <div className="divide-y divide-white/[0.05]">
                {Object.entries(scanResult.params).map(([key, value]) => {
                  const isUncertain = scanResult.uncertain.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-4 px-5 py-2.5 ${isUncertain ? 'bg-amber-500/[0.05]' : ''}`}
                    >
                      <span className="text-xs text-gray-500 w-32 shrink-0">
                        {PARAM_LABELS[key] || key}
                      </span>
                      <span className="text-sm text-gray-200 flex-1">
                        {formatParamValue(key, value)}
                      </span>
                      {isUncertain && (
                        <span className="flex items-center gap-1 text-[11px] text-amber-400/80 shrink-0">
                          <TriangleAlert className="w-3 h-3" />
                          不确定
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Raw annotations (collapsible) */}
            {scanResult.rawAnnotations && (
              <div>
                <button
                  onClick={() => setShowRawAnnotations(v => !v)}
                  className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1 cursor-pointer w-full"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>查看原始识别标注</span>
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showRawAnnotations ? 'rotate-180' : ''}`} />
                </button>
                {showRawAnnotations && (
                  <div className="mt-2 px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs text-gray-500 font-mono whitespace-pre-line leading-relaxed">
                    {scanResult.rawAnnotations}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleBuildModel}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-blue-500/20 transition-all cursor-pointer text-sm"
              >
                <Sparkles className="w-4 h-4" />
                在 3D 中查看配筋
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </button>
              <button
                onClick={() => { setScanResult(null); setImages([]); setError(null); }}
                className="px-5 py-3.5 border border-white/[0.1] rounded-xl text-sm text-gray-500 hover:text-gray-200 hover:border-white/20 transition-colors cursor-pointer"
              >
                重新上传
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
