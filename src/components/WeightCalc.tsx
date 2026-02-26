'use client';

import type { CalcResult } from '@/lib/calc';

export function WeightCalc({ result }: { result: CalcResult }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
      <h2 className="text-sm font-semibold text-primary mb-3">钢筋用量估算</h2>
      <div className="space-y-2">
        {result.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
              <span className="text-gray-700 truncate">{item.name}</span>
              <span className="text-xs text-gray-400">{item.spec}</span>
            </div>
            <div className="text-right shrink-0 ml-2">
              <span className="text-xs text-gray-400 mr-2">{item.length}</span>
              <span className="font-medium text-gray-800">{item.weight}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">合计</span>
        <span className="text-lg font-bold text-primary">{result.total}</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">* 估算值，未含搭接、锚固附加长度和损耗</p>
    </div>
  );
}
