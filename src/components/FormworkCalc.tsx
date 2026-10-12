'use client';

import { useMemo, useState } from 'react';
import { Layers3 } from 'lucide-react';
import type { ComponentType } from '@/lib/types';
import { calcFormwork, DEFAULT_FORMWORK_OPTIONS, type ComponentParamsMap, type FormworkOptions } from '@/lib/calc-formwork';

export function FormworkCalc<T extends ComponentType>({ componentType, params }: { componentType: T; params: ComponentParamsMap[T] }) {
  const [options, setOptions] = useState(DEFAULT_FORMWORK_OPTIONS);
  const result = useMemo(() => calcFormwork(componentType, params, options), [componentType, params, options]);
  const update = (patch: Partial<FormworkOptions>) => setOptions(current => ({ ...current, ...patch }));
  const foundation = ['foundation', 'stripfoundation', 'raft', 'pilecap'].includes(componentType);
  const toggle = (key: keyof FormworkOptions, label: string) => <label className="rv-quantity-check"><input type="checkbox" checked={Boolean(options[key])} onChange={event => update({ [key]: event.target.checked })} />{label}</label>;
  return <div className="rv-formwork">
    <div className="rv-quantity-heading"><div><h2><Layers3 size={16} />模板工程量</h2><p>按当前构件及支模条件计算接触面积</p></div>
      <div className="rv-quantity-total"><strong>{result.totalArea.toFixed(3)}</strong><span>m²</span></div>
    </div>
    {componentType !== 'joint' && <details className="rv-quantity-options">
      <summary>支模条件与扣减</summary>
      <div className="rv-quantity-option-grid">
        {componentType === 'beam' && <>
          <label>与板相接的梁侧数<select value={options.beamSlabSides} onChange={e => update({ beamSlabSides: Number(e.target.value) })}><option value={0}>0 侧（独立梁 / 两侧外露）</option><option value={1}>1 侧（边梁）</option><option value={2}>2 侧（中间梁）</option></select></label>
          <label>相接板厚 (mm)<input type="number" min={0} max={1000} step={10} value={options.beamSlabThickness} onChange={e => update({ beamSlabThickness: Math.max(0, Number(e.target.value)) })} /></label>
          {toggle('includeBeamEnds', '计两端封头模板')}
        </>}
        {['slab', 'stair'].includes(componentType) && toggle('includeSlabEdges', '计外露板边模板')}
        {foundation && toggle('includeFoundationBottom', '底面实际支模（计底模）')}
        {componentType === 'foundation' && toggle('includeSlopedFaces', '锥形基础斜面实际支模')}
        <label>连接面 / 不支模面扣减 (m²)<input type="number" min={0} step={0.01} value={options.deductionArea} onChange={e => update({ deductionArea: Math.max(0, Number(e.target.value)) })} /></label>
      </div>
    </details>}
    <div className="rv-quantity-items">{result.items.map((item, i) => <details key={`${item.name}-${i}`}>
      <summary><span>{item.name}</span><strong>{item.area.toFixed(3)} m²</strong></summary>
      <p>{item.formula}</p>{item.detail && <p>{item.detail}</p>}
    </details>)}</div>
    {result.deductionArea > 0 && <p className="rv-quantity-deduction">小计 {result.grossArea.toFixed(3)} − 扣减 {result.deductionArea.toFixed(3)} = {result.totalArea.toFixed(3)} m²</p>}
    <ul className="rv-quantity-notes">{result.notes.map(note => <li key={note}>{note}</li>)}</ul>
    <p className="rv-quantity-reference">计量依据：<a href="https://zjt.hubei.gov.cn/zfxxgk/zc/qtzdgkwj/202508/P020250812302407873020.pdf" target="_blank" rel="noreferrer">GB/T 50854—2024 应用说明 · 混凝土模板</a>。当前值为构件估算，未建立的连接面需补充扣减。</p>
  </div>;
}
