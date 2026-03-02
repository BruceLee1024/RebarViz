'use client';

import { useState, useMemo, useCallback } from 'react';
import { Download, List, BarChart3, Weight, ChevronDown, Printer, Copy, Check } from 'lucide-react';
import type { CalcResult, CalcItem, FormulaStep } from '@/lib/calc';
import { GRADE_MAP } from '@/lib/rebar';
import { exportToCSV, exportToPrintHTML, copyToClipboard, type ExportMeta } from '@/lib/export';

interface SummaryRow {
  grade: string;
  diameter: number;
  totalCount: number;
  totalLengthM: number;
  totalWeightKg: number;
}

function buildSummary(items: CalcItem[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const it of items) {
    const key = `${it.grade}-${it.diameter}`;
    const row = map.get(key);
    if (row) {
      row.totalCount += it.count;
      row.totalLengthM += it.count * it.lengthM;
      row.totalWeightKg += it.weightKg;
    } else {
      map.set(key, {
        grade: it.grade, diameter: it.diameter,
        totalCount: it.count,
        totalLengthM: it.count * it.lengthM,
        totalWeightKg: it.weightKg,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.diameter - b.diameter || a.grade.localeCompare(b.grade));
}

function gradeSpec(grade: string, diameter: number): string {
  return `${grade === 'A' ? 'Φ' : grade}${diameter}`;
}

function totalWeightKg(items: CalcItem[]): number {
  return items.reduce((s, it) => s + it.weightKg, 0);
}


function FormulaBlock({ steps }: { steps: FormulaStep[] }) {
  return (
    <div className="mt-2 mb-1 ml-4 pl-3 border-l-2 border-blue-200 space-y-1.5">
      {steps.map((s, i) => (
        <div key={i} className="text-[11px] leading-relaxed">
          <span className="text-blue-600 font-medium">{s.label}</span>
          <div className="text-gray-500 font-mono ml-2">
            <span className="text-gray-400">{s.formula}</span>
            <br />
            <span className="text-gray-600">{s.substitution}</span>
            <br />
            <span className="text-gray-800 font-semibold">{s.result}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeightCalc({ result, beamId, meta }: { result: CalcResult; beamId?: string; meta?: ExportMeta }) {
  const [view, setView] = useState<'detail' | 'summary'>('detail');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const summary = useMemo(() => buildSummary(result.items), [result.items]);
  const total = useMemo(() => totalWeightKg(result.items), [result.items]);
  const maxWeight = useMemo(() => Math.max(...result.items.map(it => it.weightKg), 1), [result.items]);
  const maxSummaryWeight = useMemo(() => Math.max(...summary.map(r => r.totalWeightKg), 1), [summary]);
  const toggleExpand = useCallback((i: number) => setExpandedIdx(prev => prev === i ? null : i), []);
  
  const exportMeta: ExportMeta = meta || { id: beamId };
  
  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(result, exportMeta);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result, exportMeta]);

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Weight className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800">钢筋用量估算</h2>
            <p className="text-[11px] text-gray-400">含锚固/搭接长度，未含损耗</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setView('detail')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all ${
              view === 'detail'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}>
            <List className="w-3 h-3" />
            明细
          </button>
          <button onClick={() => setView('summary')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all ${
              view === 'summary'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}>
            <BarChart3 className="w-3 h-3" />
            汇总
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors">
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            {copied ? '已复制' : '复制'}
          </button>
          <button onClick={() => exportToCSV(result, exportMeta)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
            <Download className="w-3 h-3" />
            CSV
          </button>
          <button onClick={() => exportToPrintHTML(result, exportMeta)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
            <Printer className="w-3 h-3" />
            打印
          </button>
        </div>
      </div>

      {/* Total hero card */}
      <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100/50">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-blue-600/70 font-medium mb-0.5">钢筋总量</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-blue-700">{total.toFixed(2)}</span>
              <span className="text-sm text-blue-500 font-medium">kg</span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] text-blue-500/70">钢筋种类</p>
                <p className="text-sm font-semibold text-blue-700">{result.items.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-blue-500/70">规格汇总</p>
                <p className="text-sm font-semibold text-blue-700">{summary.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail view */}
      {view === 'detail' ? (
        <div className="space-y-1">
          {result.items.map((item, i) => {
            const pct = total > 0 ? (item.weightKg / total) * 100 : 0;
            const isExpanded = expandedIdx === i;
            const hasFormula = item.formulaSteps && item.formulaSteps.length > 0;
            return (
              <div key={i}
                className={`group rounded-lg px-3 py-2.5 transition-colors ${
                  isExpanded ? 'bg-blue-50/60' : 'hover:bg-gray-50/80'
                } ${hasFormula ? 'cursor-pointer' : ''}`}
                onClick={hasFormula ? () => toggleExpand(i) : undefined}
              >
                {/* Top: name + weight */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-[13px] font-medium text-gray-800">{item.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-500">{item.spec}</span>
                    {hasFormula && (
                      <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-[13px] font-semibold text-gray-800">{item.weightKg.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">kg</span>
                    <span className="text-[10px] text-gray-300 ml-1">({pct.toFixed(1)}%)</span>
                  </div>
                </div>
                {/* Bottom: detail + bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(item.weightKg / maxWeight) * 100}%`, background: item.color, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 w-48 text-right truncate">{item.length}</span>
                </div>
                {/* Formula breakdown */}
                {isExpanded && item.formulaSteps && (
                  <FormulaBlock steps={item.formulaSteps} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Summary view */
        <div className="space-y-1">
          {summary.map((r, i) => {
            const pct = total > 0 ? (r.totalWeightKg / total) * 100 : 0;
            // Color by grade
            const barColor = r.grade === 'A' ? '#27AE60' : r.grade === 'C' ? '#2980B9' : '#E67E22';
            return (
              <div key={i} className="rounded-lg px-3 py-2.5 hover:bg-gray-50/80 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-12 px-1.5 py-0.5 rounded bg-gray-100 text-[11px] font-mono font-semibold text-gray-700 text-center">
                      {gradeSpec(r.grade, r.diameter)}
                    </span>
                    <span className="text-[11px] text-gray-400">{GRADE_MAP[r.grade] || r.grade}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-gray-400">{r.totalCount} 根</span>
                    <span className="text-gray-400">{r.totalLengthM.toFixed(1)} m</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[13px] font-semibold text-gray-800">{r.totalWeightKg.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-400">kg</span>
                    </div>
                    <span className="text-[10px] text-gray-300 w-10 text-right">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${(r.totalWeightKg / maxSummaryWeight) * 100}%`, background: barColor, opacity: 0.6 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
