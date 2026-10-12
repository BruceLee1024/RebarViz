'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { X } from 'lucide-react';
import type { BeamParams } from '@/lib/types';
import { parseStirrup, parseSideBar, parseTieBar, autoTieBar } from '@/lib/rebar';
import { createCompositeStirrupCurves, beamStirrupBarPositions, createTieBarCurves, resolveTieSideOffsetMm } from '@/lib/rebar-shapes';
import { S } from '@/lib/constants';
import { beamHookFit } from '@/lib/hook-fit';
import { CappedRebarTube } from './three/CappedRebarTube';

export function StirrupHookDetail({ params, onClose }: { params: BeamParams; onClose: () => void }) {
  const [whole, setWhole] = useState(false);
  const [mode, setMode] = useState<'stirrup' | 'tie'>('stirrup');
  const dialogRef = useRef<HTMLElement>(null);
  const stirrup = parseStirrup(params.stirrup);
  const width = Math.max(params.b - 2 * (params.cover || 25) - stirrup.diameter, 1) * S;
  const height = Math.max(params.h - 2 * (params.cover || 25) - stirrup.diameter, 1) * S;
  const side = params.sideBar ? parseSideBar(params.sideBar) : null;
  const tie = params.tieBar ? parseTieBar(params.tieBar) : autoTieBar(params.b, stirrup.grade, stirrup.diameter);
  const sideOffset = resolveTieSideOffsetMm({ sectionWidthMm: params.b, coverMm: params.cover || 25,
    stirrupDiameterMm: stirrup.diameter, sideBarDiameterMm: side?.diameter ?? 16 }) * S;
  const stirrupCurves = useMemo(() => createCompositeStirrupCurves({ width, height, legs: stirrup.legs,
    barPositions: beamStirrupBarPositions(width / S, stirrup.diameter, params.top, params.bottom).map(z => z * S),
    diameter: stirrup.diameter, plane: 'yz' }), [width, height, stirrup.diameter, stirrup.legs, params.top, params.bottom]);
  const tieCurves = useMemo(() => createTieBarCurves({ sideOffset,
    tieDiameter: tie?.diameter ?? 6, sideBarDiameter: side?.diameter ?? 16 }),
    [sideOffset, tie?.diameter, side?.diameter]);
  const isTie = mode === 'tie';
  const fitIssues = useMemo(() => beamHookFit(params), [params]).filter(q => isTie ? q.code === 'tie-tail-collision' : q.code !== 'tie-tail-collision');
  const curves = isTie ? { ...tieCurves, outerCurve: tieCurves.bodyCurve } : stirrupCurves.hoops[0];
  const spec = isTie ? tieCurves.spec : stirrupCurves.spec;
  const hookArcMm = spec.bendRadiusMm * spec.hookAngleDeg * Math.PI / 180;
  const diameter = isTie ? tie?.diameter ?? 6 : stirrup.diameter;
  const radius = diameter * S / 2;
  const bendR = spec.bendRadiusMm * S;
  const target: [number, number, number] = isTie ? [0, 0, whole ? 0 : sideOffset]
    : whole ? [0, 0, 0] : [0, height / 2 - bendR - .025, -width / 2 + bendR + .025];
  const distance = whole ? (isTie ? sideOffset * 2 : Math.max(width, height)) * 1.7
    : Math.max(spec.hookLenMm * S * 2.3, .2);
  const camera: [number, number, number] = [distance, target[1] + distance * .45, target[2] + distance * .7];
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="rv-hook-backdrop" onClick={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="rv-hook-dialog" role="dialog" aria-modal="true" aria-labelledby="stirrup-hook-title"
        onClick={event => event.stopPropagation()}>
        <header className="rv-hook-header">
          <div><h2 id="stirrup-hook-title">{isTie ? '拉筋与腰筋构造' : '箍筋弯钩构造'}</h2><p>{isTie ? '两端圆弧勾住腰筋，接触处保持独立钢筋' : `${stirrupCurves.spec.pieceCount}个独立箍/道，每个箍保留两个错开的自由端`}</p></div>
          <button className="rv-button" onClick={onClose} aria-label="关闭弯钩构造"><X size={16} /></button>
        </header>
        <div className="rv-hook-options">
          <button className="rv-button" aria-pressed={!isTie} onClick={() => setMode('stirrup')}>箍筋封口</button>
          <button className="rv-button" aria-pressed={isTie} disabled={!side || !tie} title={!side ? '设置腰筋后可查看拉筋' : undefined} onClick={() => setMode('tie')}>拉筋与腰筋</button>
          <button className="rv-button" aria-pressed={!whole} onClick={() => setWhole(false)}>{isTie ? '端部近景' : '封口近景'}</button>
          <button className="rv-button" aria-pressed={whole} onClick={() => setWhole(true)}>{isTie ? '完整拉筋' : (stirrupCurves.spec.pieceCount > 1 ? '完整复合箍' : '完整箍筋')}</button>
          <span>Φ{diameter} · 两端 135° · 弯弧内径 {(2 * spec.bendRadiusMm - diameter).toFixed(1)} mm</span>
        </div>
        {fitIssues.length > 0 && <div className="rv-hook-fit-alert" role="alert" aria-label="弯钩构造不通过">
          <strong>当前配置无法容纳完整弯钩</strong>
          <ul>{fitIssues.map(q => <li key={q.code + q.message}>{q.message}</li>)}</ul>
        </div>}
        <div className="rv-hook-canvas">
          <Canvas key={`${mode}-${whole}-${width}-${height}-${diameter}-${stirrup.legs}`} camera={{ position: camera, fov: 42, near: .001 }}
            gl={{ preserveDrawingBuffer: true }}>
            <color attach="background" args={['#071725']} />
            <ambientLight intensity={1.8} />
            <directionalLight position={[1, 2, 1]} intensity={2.5} />
            <directionalLight position={[-1, 0, -1]} intensity={1.2} />
            <mesh><tubeGeometry args={[curves.outerCurve, 280, radius, 12, false]} />
              <meshStandardMaterial color="#35c8d9" roughness={.5} metalness={.2} /></mesh>
            <CappedRebarTube curve={curves.hookCurves[0]} radius={radius} segments={96}>
              <meshStandardMaterial color="#fbbf24" roughness={.5} metalness={.2} />
            </CappedRebarTube>
            <CappedRebarTube curve={curves.hookCurves[1]} radius={radius} segments={96}>
              <meshStandardMaterial color="#c4b5fd" roughness={.5} metalness={.2} />
            </CappedRebarTube>
            {!isTie && stirrupCurves.hoops.slice(1).map((hoop, i) => (
              <CappedRebarTube key={i} curve={hoop.fullCurve} radius={radius}>
                <meshStandardMaterial color={i % 2 === 0 ? '#60a5fa' : '#fb923c'} roughness={.5} metalness={.2} />
              </CappedRebarTube>
            ))}
            {isTie && side && [-1, 1].map(sign => (
              <mesh key={sign} position={[0, 0, sign * sideOffset]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[side.diameter * S / 2, side.diameter * S / 2, .12, 16]} />
                <meshStandardMaterial color="#60a5fa" roughness={.5} metalness={.2} />
              </mesh>
            ))}
            <OrbitControls target={target} enableDamping minDistance={.035} maxDistance={2} />
          </Canvas>
        </div>
        <dl className="rv-hook-measures" aria-label="弯钩长度分解（每端）">
          <div><dt>弯后平直段 · 每端</dt><dd>{spec.hookLenMm}<small> mm</small></dd></div>
          <div><dt>135°圆弧中心线长</dt><dd>{hookArcMm.toFixed(1)}<small> mm</small></dd></div>
          <div><dt>圆弧 + 平直段 · 每端</dt><dd>{(hookArcMm + spec.hookLenMm).toFixed(1)}<small> mm</small></dd></div>
        </dl>
        <footer className="rv-hook-footer">
          <span><i style={{ background: '#35c8d9' }} />{isTie ? '拉筋本体' : '箍筋本体'}</span>
          <span><i style={{ background: '#fbbf24' }} />端头 A</span>
          <span><i style={{ background: '#c4b5fd' }} />端头 B</span>
          {!isTie && stirrupCurves.spec.pieceCount > 1 && <span><i style={{ background: '#60a5fa' }} />独立内箍（沿梁长错位）</span>}
          {isTie && <span><i style={{ background: '#60a5fa' }} />腰筋 Φ{side?.diameter}</span>}
          <p>平直段从圆弧切点量至自由端，沿钢筋中心线量取；当前按抗震构造取 max(10d, 75mm)，圆弧另计入展开长度。</p>
          <p>{isTie ? '按当前参数显示弯弧与完整平直段。拉筋围住腰筋，钢筋表面接触；拖动旋转可查看独立端面。' : '颜色用于区分同一箍筋的两端。端头沿梁长方向错位；拖动旋转可查看搭接间隙。'}</p>
        </footer>
      </section>
    </div>
  );
}
