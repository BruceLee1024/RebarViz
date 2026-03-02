'use client';

import { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Scale } from 'lucide-react';
import type { BeamParams } from '@/lib/types';
import { calcBeam, calcBeamRebarRatios } from '@/lib/calc';
import { parseRebar, parseStirrup } from '@/lib/rebar';

interface ComparePanelProps {
  paramsA: BeamParams;
  paramsB: BeamParams;
  labelA?: string;
  labelB?: string;
}

interface DiffItem {
  label: string;
  valueA: string | number;
  valueB: string | number;
  change: 'increase' | 'decrease' | 'same' | 'changed';
  unit?: string;
  percentChange?: number;
}

function formatValue(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function compareValues(a: number, b: number): 'increase' | 'decrease' | 'same' {
  if (Math.abs(a - b) < 0.001) return 'same';
  return b > a ? 'increase' : 'decrease';
}

function calcPercentChange(a: number, b: number): number | undefined {
  if (a === 0) return undefined;
  return ((b - a) / a) * 100;
}

export function ComparePanel({ paramsA, paramsB, labelA = '方案A', labelB = '方案B' }: ComparePanelProps) {
  const diffs = useMemo((): DiffItem[] => {
    const results: DiffItem[] = [];
    
    // 截面尺寸
    if (paramsA.b !== paramsB.b) {
      results.push({
        label: '截面宽度 b',
        valueA: paramsA.b,
        valueB: paramsB.b,
        change: compareValues(paramsA.b, paramsB.b),
        unit: 'mm',
        percentChange: calcPercentChange(paramsA.b, paramsB.b),
      });
    }
    if (paramsA.h !== paramsB.h) {
      results.push({
        label: '截面高度 h',
        valueA: paramsA.h,
        valueB: paramsB.h,
        change: compareValues(paramsA.h, paramsB.h),
        unit: 'mm',
        percentChange: calcPercentChange(paramsA.h, paramsB.h),
      });
    }

    // 配筋对比
    if (paramsA.top !== paramsB.top) {
      const topA = parseRebar(paramsA.top);
      const topB = parseRebar(paramsB.top);
      const areaA = topA.count * Math.PI * Math.pow(topA.diameter / 2, 2);
      const areaB = topB.count * Math.PI * Math.pow(topB.diameter / 2, 2);
      results.push({
        label: '上部通长筋',
        valueA: paramsA.top,
        valueB: paramsB.top,
        change: areaA === areaB ? 'changed' : compareValues(areaA, areaB),
        percentChange: calcPercentChange(areaA, areaB),
      });
    }
    if (paramsA.bottom !== paramsB.bottom) {
      const botA = parseRebar(paramsA.bottom);
      const botB = parseRebar(paramsB.bottom);
      const areaA = botA.count * Math.PI * Math.pow(botA.diameter / 2, 2);
      const areaB = botB.count * Math.PI * Math.pow(botB.diameter / 2, 2);
      results.push({
        label: '下部通长筋',
        valueA: paramsA.bottom,
        valueB: paramsB.bottom,
        change: areaA === areaB ? 'changed' : compareValues(areaA, areaB),
        percentChange: calcPercentChange(areaA, areaB),
      });
    }
    if (paramsA.stirrup !== paramsB.stirrup) {
      const stirA = parseStirrup(paramsA.stirrup);
      const stirB = parseStirrup(paramsB.stirrup);
      results.push({
        label: '箍筋',
        valueA: paramsA.stirrup,
        valueB: paramsB.stirrup,
        change: stirA.spacingDense > stirB.spacingDense ? 'increase' : 
                stirA.spacingDense < stirB.spacingDense ? 'decrease' : 'changed',
      });
    }

    // 支座负筋
    if (paramsA.leftSupport !== paramsB.leftSupport) {
      results.push({
        label: '左支座负筋',
        valueA: paramsA.leftSupport || '无',
        valueB: paramsB.leftSupport || '无',
        change: 'changed',
      });
    }
    if (paramsA.rightSupport !== paramsB.rightSupport) {
      results.push({
        label: '右支座负筋',
        valueA: paramsA.rightSupport || '无',
        valueB: paramsB.rightSupport || '无',
        change: 'changed',
      });
    }

    // 腰筋
    if (paramsA.sideBar !== paramsB.sideBar) {
      results.push({
        label: '腰筋',
        valueA: paramsA.sideBar || '无',
        valueB: paramsB.sideBar || '无',
        change: 'changed',
      });
    }

    // 计算结果对比
    const calcA = calcBeam(paramsA);
    const calcB = calcBeam(paramsB);
    const weightA = calcA.items.reduce((sum, item) => sum + item.weightKg, 0);
    const weightB = calcB.items.reduce((sum, item) => sum + item.weightKg, 0);
    
    if (Math.abs(weightA - weightB) > 0.1) {
      results.push({
        label: '钢筋总用量',
        valueA: formatValue(weightA, 1),
        valueB: formatValue(weightB, 1),
        change: compareValues(weightA, weightB),
        unit: 'kg',
        percentChange: calcPercentChange(weightA, weightB),
      });
    }

    // 配筋率对比
    const ratioA = calcBeamRebarRatios(paramsA);
    const ratioB = calcBeamRebarRatios(paramsB);
    
    if (Math.abs(ratioA.bottom.rho - ratioB.bottom.rho) > 0.0001) {
      results.push({
        label: '受拉配筋率 ρ',
        valueA: formatValue(ratioA.bottom.rho * 100, 3),
        valueB: formatValue(ratioB.bottom.rho * 100, 3),
        change: compareValues(ratioA.bottom.rho, ratioB.bottom.rho),
        unit: '%',
        percentChange: calcPercentChange(ratioA.bottom.rho, ratioB.bottom.rho),
      });
    }

    return results;
  }, [paramsA, paramsB]);

  const weightA = useMemo(() => calcBeam(paramsA).items.reduce((s, i) => s + i.weightKg, 0), [paramsA]);
  const weightB = useMemo(() => calcBeam(paramsB).items.reduce((s, i) => s + i.weightKg, 0), [paramsB]);
  const weightDiff = weightB - weightA;
  const weightPercent = weightA > 0 ? (weightDiff / weightA) * 100 : 0;

  if (diffs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Scale className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">两个方案完全相同</p>
        <p className="text-xs mt-1">修改参数后会自动显示差异</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 总体摘要 */}
      <div className={`p-4 rounded-xl border ${
        weightDiff > 0 ? 'bg-red-50 border-red-200' : 
        weightDiff < 0 ? 'bg-emerald-50 border-emerald-200' : 
        'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              weightDiff > 0 ? 'bg-red-100' : 
              weightDiff < 0 ? 'bg-emerald-100' : 
              'bg-gray-100'
            }`}>
              {weightDiff > 0 ? <ArrowUpRight className="w-5 h-5 text-red-600" /> :
               weightDiff < 0 ? <ArrowDownRight className="w-5 h-5 text-emerald-600" /> :
               <Minus className="w-5 h-5 text-gray-500" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">钢筋用量变化</p>
              <p className={`text-lg font-bold ${
                weightDiff > 0 ? 'text-red-600' : 
                weightDiff < 0 ? 'text-emerald-600' : 
                'text-gray-600'
              }`}>
                {weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(1)} kg
                <span className="text-sm font-normal ml-1">
                  ({weightPercent > 0 ? '+' : ''}{weightPercent.toFixed(1)}%)
                </span>
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>{labelA}: {weightA.toFixed(1)}kg</p>
            <p>{labelB}: {weightB.toFixed(1)}kg</p>
          </div>
        </div>
      </div>

      {/* 差异列表 */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">差异详情 ({diffs.length} 项)</h4>
        
        {diffs.map((diff, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">{diff.label}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 truncate">
                  {diff.valueA}{diff.unit && <span className="text-gray-400 ml-0.5">{diff.unit}</span>}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className={`text-sm font-medium truncate ${
                  diff.change === 'increase' ? 'text-red-600' :
                  diff.change === 'decrease' ? 'text-emerald-600' :
                  'text-amber-600'
                }`}>
                  {diff.valueB}{diff.unit && <span className="opacity-70 ml-0.5">{diff.unit}</span>}
                </span>
              </div>
            </div>
            {diff.percentChange !== undefined && (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                diff.change === 'increase' ? 'bg-red-100 text-red-700' :
                diff.change === 'decrease' ? 'bg-emerald-100 text-emerald-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {diff.percentChange > 0 ? '+' : ''}{diff.percentChange.toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
