'use client';

import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import type { ComplianceResult } from '@/lib/compliance';

interface CompliancePanelProps {
  results: ComplianceResult[];
  compact?: boolean;  // 紧凑模式（用于侧边栏）
}

const STATUS_CONFIG = {
  pass: {
    icon: ShieldCheck,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    iconColor: 'text-emerald-500',
  },
  warn: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    iconColor: 'text-amber-500',
  },
  fail: {
    icon: ShieldAlert,
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    iconColor: 'text-red-500',
  },
};

export function CompliancePanel({ results, compact }: CompliancePanelProps) {
  const summary = useMemo(() => {
    const pass = results.filter(r => r.status === 'pass').length;
    const warn = results.filter(r => r.status === 'warn').length;
    const fail = results.filter(r => r.status === 'fail').length;
    const allPass = fail === 0 && warn === 0;
    return { pass, warn, fail, allPass, total: results.length };
  }, [results]);

  // 过滤掉 "满足规范" 的占位结果
  const issues = results.filter(r => r.status !== 'pass');

  if (compact) {
    // 紧凑模式：只显示状态摘要
    if (summary.allPass) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-700">配筋满足规范要求</span>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {/* 摘要 */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-gray-600">
            {summary.fail > 0 && <span className="text-red-600 font-medium">{summary.fail} 项不满足</span>}
            {summary.fail > 0 && summary.warn > 0 && '，'}
            {summary.warn > 0 && <span className="text-amber-600 font-medium">{summary.warn} 项警告</span>}
          </span>
        </div>
        
        {/* 问题列表 */}
        {issues.slice(0, 3).map((r, i) => {
          const config = STATUS_CONFIG[r.status];
          const Icon = config.icon;
          return (
            <div key={i} className={`px-3 py-2 rounded-lg border ${config.bg} ${config.border}`}>
              <div className="flex items-start gap-2">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${config.iconColor}`} />
                <div className="min-w-0">
                  <p className={`text-xs ${config.text}`}>{r.message}</p>
                  {r.suggestion && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{r.suggestion}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {issues.length > 3 && (
          <p className="text-[11px] text-gray-400 text-center">
            还有 {issues.length - 3} 项...
          </p>
        )}
      </div>
    );
  }

  // 完整模式
  return (
    <div className="space-y-4">
      {/* 标题和摘要 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            summary.allPass ? 'bg-emerald-100' : summary.fail > 0 ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            {summary.allPass ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ) : (
              <ShieldAlert className={`w-4 h-4 ${summary.fail > 0 ? 'text-red-600' : 'text-amber-600'}`} />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">规范校验</h3>
            <p className="text-[11px] text-gray-400">GB50010-2010 & 22G101</p>
          </div>
        </div>
        
        {/* 状态统计 */}
        <div className="flex items-center gap-3">
          {summary.fail > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-gray-600">{summary.fail} 项不通过</span>
            </div>
          )}
          {summary.warn > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-600">{summary.warn} 项警告</span>
            </div>
          )}
          {summary.allPass && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-600">全部通过</span>
            </div>
          )}
        </div>
      </div>

      {/* 校验结果列表 */}
      {summary.allPass ? (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
          <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-emerald-700">配筋满足规范要求</p>
          <p className="text-xs text-emerald-600 mt-1">已检查配筋率、箍筋构造等关键指标</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((r, i) => {
            const config = STATUS_CONFIG[r.status];
            const Icon = config.icon;
            return (
              <div key={i} className={`p-3 rounded-xl border ${config.bg} ${config.border}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    r.status === 'fail' ? 'bg-red-100' : 'bg-amber-100'
                  }`}>
                    <Icon className={`w-4 h-4 ${config.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${config.text}`}>
                        {r.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="px-1.5 py-0.5 bg-white/60 rounded">{r.rule}</span>
                      {r.field !== '-' && (
                        <span className="text-gray-400">字段: {r.field}</span>
                      )}
                    </div>
                    {r.suggestion && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span className={r.status === 'fail' ? 'text-red-600' : 'text-amber-600'}>
                          {r.suggestion}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 说明 */}
      <div className="flex items-start gap-2 px-3 py-2 bg-gray-50 rounded-lg text-[11px] text-gray-500">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>校验基于 GB50010-2010《混凝土结构设计规范》和 22G101 系列图集，仅供参考</span>
      </div>
    </div>
  );
}

/**
 * 简化版状态指示器（用于标题栏等位置）
 */
export function ComplianceBadge({ results }: { results: ComplianceResult[] }) {
  const fail = results.filter(r => r.status === 'fail').length;
  const warn = results.filter(r => r.status === 'warn').length;
  
  if (fail === 0 && warn === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">
        <ShieldCheck className="w-3 h-3" />
        合规
      </span>
    );
  }
  
  if (fail > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium">
        <ShieldAlert className="w-3 h-3" />
        {fail} 项问题
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium">
      <AlertTriangle className="w-3 h-3" />
      {warn} 项警告
    </span>
  );
}
