'use client';

import { Fragment, useState, useMemo, useCallback, useEffect, useId } from 'react';
import { Download, List, BarChart3, Weight, ChevronDown, Printer, Copy, Check, Info } from 'lucide-react';
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

function FormulaBlock({ steps }: { steps: FormulaStep[] }) {
  return <dl className="rv-weight-formulas">
    {steps.map((step, i) => <div key={i}>
      <dt>{step.label}<span>{step.formula}</span></dt>
      <dd><span>{step.substitution}</span><strong>{step.result}</strong></dd>
    </div>)}
  </dl>;
}

export function WeightCalc({ result, beamId, meta }: { result: CalcResult; beamId?: string; meta?: ExportMeta }) {
  const [view, setView] = useState<'detail' | 'summary'>('detail');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [printError, setPrintError] = useState(false);
  const panelId = useId();
  const summary = useMemo(() => buildSummary(result.items), [result.items]);
  const totals = useMemo(() => ({
    weight: result.items.reduce((sum, item) => sum + item.weightKg, 0),
    count: result.items.reduce((sum, item) => sum + item.count, 0),
    length: result.items.reduce((sum, item) => sum + item.count * item.lengthM, 0),
  }), [result.items]);
  const exportMeta = useMemo<ExportMeta>(() => meta || { id: beamId }, [meta, beamId]);

  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timer = setTimeout(() => setCopyStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(result, exportMeta);
    setCopyStatus(ok ? 'copied' : 'error');
  }, [result, exportMeta]);

  return <section className="rv-weight" aria-label="钢筋用量估算">
    <header className="rv-weight-header">
      <div className="rv-weight-title"><Weight size={16} aria-hidden="true" /><h2>钢筋用量估算</h2></div>
      <div className="rv-weight-toolbar">
        <div className="rv-weight-views" role="group" aria-label="用量显示方式">
          <button aria-pressed={view === 'detail'} onClick={() => setView('detail')}><List size={12} aria-hidden="true" />明细</button>
          <button aria-pressed={view === 'summary'} onClick={() => setView('summary')}><BarChart3 size={12} aria-hidden="true" />规格汇总</button>
        </div>
        <div className="rv-weight-exports" role="group" aria-label="导出用量">
          <button onClick={handleCopy}>{copyStatus === 'copied' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}<span aria-live="polite">{copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败，重试' : '复制'}</span></button>
          <button onClick={() => exportToCSV(result, exportMeta)}><Download size={12} aria-hidden="true" />CSV</button>
          <button onClick={() => setPrintError(!exportToPrintHTML(result, exportMeta))}><Printer size={12} aria-hidden="true" />打印</button>
        </div>
      </div>
    </header>
    {printError && <p className="rv-weight-export-error" role="alert">打印窗口未打开，请允许此站点弹出窗口后重试。</p>}

    <div className="rv-weight-layout">
      <aside className="rv-weight-total" aria-label="钢筋合计">
        <span className="rv-weight-label">钢筋净重 · 未含损耗</span>
        <div className="rv-weight-number"><strong>{totals.weight.toFixed(2)}</strong><span>kg</span></div>
        <dl className="rv-weight-stats">
          <div><dt>总根数</dt><dd>{totals.count}<span>根</span></dd></div>
          <div><dt>总长度</dt><dd>{totals.length.toFixed(2)}<span>m</span></dd></div>
        </dl>
        <p>{result.items.length} 个分项<span> / </span>{summary.length} 组规格</p>
      </aside>
      <div className="rv-weight-breakdown">
        {result.items.length === 0 ? <p className="rv-weight-empty">暂无计量分项，请先完善构件参数。</p> : view === 'detail' ? (
          <table className="rv-weight-table">
            <caption className="sr-only">钢筋分项明细，点击分项查看长度说明和计算过程</caption>
            <colgroup><col className="rv-weight-name-col" /><col /><col /><col /><col /></colgroup>
            <thead><tr><th scope="col">分项 / 规格</th><th scope="col">根数</th><th scope="col">单根 · m</th><th scope="col">总长 · m</th><th scope="col">重量 · kg</th></tr></thead>
            <tbody>{result.items.map((item, i) => {
              const expanded = expandedIdx === i;
              const detailId = `${panelId}-formula-${i}`;
              return <Fragment key={`${i}-${item.name}`}>
                <tr className={expanded ? 'is-expanded' : undefined}>
                  <th scope="row"><button className="rv-weight-item-button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedIdx(expanded ? null : i)}>
                    <span className="rv-weight-dot" style={{ background: item.color }} />
                    <span className="rv-weight-item-name">{item.name}<span className="rv-weight-spec">{item.spec}</span></span>
                    <ChevronDown size={12} aria-hidden="true" />
                  </button></th>
                  <td data-label="根数">{item.count}</td><td data-label="单根 m">{item.lengthM.toFixed(2)}</td><td data-label="总长 m">{(item.count * item.lengthM).toFixed(2)}</td><td data-label="重量 kg" className="rv-weight-value">{item.weightKg.toFixed(2)}</td>
                </tr>
                <tr id={detailId} hidden={!expanded} className="rv-weight-detail-row"><td colSpan={5}>
                  <p className="rv-weight-description">{item.length}</p>
                  {item.formulaSteps && item.formulaSteps.length > 0 && <FormulaBlock steps={item.formulaSteps} />}
                </td></tr>
              </Fragment>;
            })}</tbody>
          </table>
        ) : (
          <table className="rv-weight-table rv-weight-summary-table">
            <caption className="sr-only">按钢种和直径汇总的钢筋用量</caption>
            <colgroup><col className="rv-weight-name-col" /><col /><col /><col /></colgroup>
            <thead><tr><th scope="col">规格 / 钢种</th><th scope="col">总根数</th><th scope="col">总长 · m</th><th scope="col">重量 · kg</th></tr></thead>
            <tbody>{summary.map(row => <tr key={`${row.grade}-${row.diameter}`}>
              <th scope="row"><span className="rv-weight-summary-name"><span className="rv-weight-spec">{gradeSpec(row.grade, row.diameter)}</span><span>{GRADE_MAP[row.grade] || row.grade}</span></span></th>
              <td data-label="总根数">{row.totalCount}</td><td data-label="总长 m">{row.totalLengthM.toFixed(2)}</td><td data-label="重量 kg" className="rv-weight-value">{row.totalWeightKg.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        )}
      </div>
    </div>

    <details className="rv-weight-basis">
      <summary><Info size={12} aria-hidden="true" />计量说明<span>点击分项查看计算过程</span><ChevronDown size={12} aria-hidden="true" /></summary>
      <ul>
        <li>按当前模型计算理论用量；锚固、搭接和弯折以各分项的长度说明与计算过程为准。</li>
        <li>总长 = 根数 × 单根长度；合计使用未四舍五入的数据，长度和重量显示 2 位小数。</li>
        <li>规格按钢种与直径合并；复制、CSV 和打印均包含分项明细及规格汇总。</li>
        <li>{result.wasteRate != null && result.totalWithWaste ? `设定损耗率 ${(result.wasteRate * 100).toFixed(1)}%，含损耗用量 ${result.totalWithWaste}。` : '当前合计未含施工损耗。'}</li>
      </ul>
    </details>
  </section>;
}
