'use client';

import { useState } from 'react';
import { Box, ChevronDown, Copy, Check, Info } from 'lucide-react';
import type { ConcreteCalcResult } from '@/lib/calc-concrete';
import type { FormulaStep } from '@/lib/calc';

function FormulaBlock({ steps }: { steps: FormulaStep[] }) {
  return <dl className="rv-concrete-formulas">
    {steps.map((step, i) => <div key={i}>
      <dt>{step.label}<span>{step.formula}</span></dt>
      <dd><span>{step.substitution}</span><strong>{step.result.trim().startsWith('=') ? step.result : `= ${step.result}`}</strong></dd>
    </div>)}
  </dl>;
}

export function ConcreteCalc({ result }: { result: ConcreteCalcResult }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    const lines = [
      '混凝土工程量计算（模型估算）',
      '按当前模型尺寸估算，不扣钢筋体积',
      '─'.repeat(30),
      ...result.items.flatMap(item => [
        `${item.name}: ${item.volume.toFixed(4)} m³ (${item.description})`,
        ...item.formulaSteps.map(step => `  ${step.formula}: ${step.substitution} = ${step.result}`),
      ]),
      '─'.repeat(30),
      `合计: ${result.totalVolume.toFixed(4)} m³`,
      ...(result.notes ?? []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return <section className="rv-concrete" aria-label="混凝土工程量">
    <header className="rv-concrete-header">
      <div className="rv-concrete-title"><Box size={16} aria-hidden="true" /><h2>混凝土工程量</h2><span>模型估算</span></div>
      <button className="rv-concrete-copy" onClick={handleCopy} onBlur={() => setCopyStatus('idle')}>
        {copyStatus === 'copied' ? <Check size={13} /> : <Copy size={13} />}
        <span aria-live="polite">{copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '复制失败，重试' : '复制明细'}</span>
      </button>
    </header>

    <div className="rv-concrete-layout">
      <div className="rv-concrete-total">
        <span className="rv-concrete-label">混凝土总量</span>
        <div className="rv-concrete-number"><strong>{result.totalVolume.toFixed(4)}</strong><span>m³</span></div>
        <p>{result.items.length} 个分项<span>未扣钢筋体积</span></p>
      </div>
      <div className="rv-concrete-breakdown">
        <div className="rv-concrete-columns"><span>计量分项 / 计算明细</span><span>体积 · m³</span></div>
        {result.items.length === 0 && <p className="rv-concrete-empty">暂无计量分项，请先完善构件参数。</p>}
        {result.items.map((item, i) => <details className="rv-concrete-item" key={`${i}-${item.name}`} open={i === 0}>
          <summary>
            <span className="rv-concrete-item-name"><span className="rv-concrete-index">{String(i + 1).padStart(2, '0')}</span>{item.name}</span>
            <span className="rv-concrete-item-value"><strong>{item.volume.toFixed(4)}</strong><ChevronDown size={13} aria-hidden="true" /></span>
          </summary>
          {item.description && !item.formulaSteps.some(step => step.substitution === item.description) && <p className="rv-concrete-description">{item.description}</p>}
          {item.formulaSteps.length > 0 && <FormulaBlock steps={item.formulaSteps} />}
        </details>)}
      </div>
    </div>

    <details className="rv-concrete-basis">
      <summary><Info size={12} aria-hidden="true" /><span>计算口径</span><span className="rv-concrete-basis-hint">按当前模型尺寸估算</span><ChevronDown size={12} aria-hidden="true" /></summary>
      <ul><li>按当前模型尺寸估算，不扣钢筋所占体积；结果保留 4 位小数。</li>{result.notes?.map(note => <li key={note}>{note}</li>)}</ul>
    </details>
  </section>;
}
