'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { BeamParams, RebarMeshInfo } from '@/lib/types';
import { parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { calcSupportRebarLength, calcBeamEndAnchor } from '@/lib/anchor';

const S = 0.001;
const COLOR_REBAR = '#C0392B';
const COLOR_REBAR_HI = '#E74C3C';
const COLOR_STIRRUP = '#27AE60';
const COLOR_STIRRUP_HI = '#2ECC71';
const COLOR_SUPPORT = '#8E44AD';
const COLOR_SUPPORT_HI = '#9B59B6';
const COLOR_COLUMN = '#7F8C8D';
const COLOR_ERECTION = '#F39C12';
const COLOR_ERECTION_HI = '#F1C40F';

function RebarBar({ position, length, diameter, color, hiColor, info, selected, onSelect }: {
  position: [number, number, number]; length: number; diameter: number;
  color: string; hiColor: string; info: RebarMeshInfo;
  selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(selected ? null : info);
  }, [selected, info, onSelect]);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const scale = selected ? 1.3 : hovered ? 1.15 : 1;

  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      scale={[scale, 1, scale]}>
      <cylinderGeometry args={[diameter * S / 2, diameter * S / 2, length, 12]} />
      <meshStandardMaterial color={activeColor} roughness={0.4} metalness={0.6} emissive={selected ? hiColor : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
    </mesh>
  );
}

function StirrupRing({ x, width, height, diameter, color, hiColor, info, selected, onSelect, cover }: {
  x: number; width: number; height: number; diameter: number;
  color: string; hiColor: string; info: RebarMeshInfo;
  selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
  cover: number;
}) {
  const [hovered, setHovered] = useState(false);
  const curve = useMemo(() => {
    const w2 = width / 2, h2 = height / 2, r = 0.015;
    const shape = new THREE.Shape();
    shape.moveTo(-w2 + r, -h2);
    shape.lineTo(w2 - r, -h2);
    shape.quadraticCurveTo(w2, -h2, w2, -h2 + r);
    shape.lineTo(w2, h2 - r);
    shape.quadraticCurveTo(w2, h2, w2 - r, h2);
    shape.lineTo(-w2 + r, h2);
    shape.quadraticCurveTo(-w2, h2, -w2, h2 - r);
    shape.lineTo(-w2, -h2 + r);
    shape.quadraticCurveTo(-w2, -h2, -w2 + r, -h2);
    const pts = shape.getPoints(40);
    return new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(0, p.y, p.x)), true);
  }, [width, height]);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;

  return (
    <mesh position={[x, height / 2 + cover, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : info); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}>
      <tubeGeometry args={[curve, 48, diameter * S / 2, 8, true]} />
      <meshStandardMaterial color={activeColor} roughness={0.4} metalness={0.6} emissive={selected ? hiColor : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
    </mesh>
  );
}

/* Bent rebar end - shows the 90° bend at column for anchor */
function BentRebarEnd({ position, straightLen, bendLen, diameter, direction, color }: {
  position: [number, number, number]; straightLen: number; bendLen: number; diameter: number;
  direction: 'down' | 'up'; color: string;
}) {
  const r = diameter * S / 2;
  const curve = useMemo(() => {
    const bendRadius = 4 * diameter * S;
    const pts: THREE.Vector3[] = [];
    // Horizontal part (straight into column)
    for (let t = 0; t <= 1; t += 0.1) pts.push(new THREE.Vector3(t * straightLen, 0, 0));
    // 90° bend
    const sign = direction === 'down' ? -1 : 1;
    for (let a = 0; a <= Math.PI / 2; a += Math.PI / 20) {
      pts.push(new THREE.Vector3(
        straightLen + bendRadius * Math.sin(a),
        sign * bendRadius * (1 - Math.cos(a)),
        0
      ));
    }
    // Vertical part (bend leg)
    const bendStart = new THREE.Vector3(straightLen + bendRadius, sign * bendRadius, 0);
    for (let t = 0.1; t <= 1; t += 0.1) {
      pts.push(new THREE.Vector3(bendStart.x, bendStart.y + sign * t * bendLen, 0));
    }
    return new THREE.CatmullRomCurve3(pts, false);
  }, [straightLen, bendLen, diameter, direction]);

  return (
    <mesh position={position}>
      <tubeGeometry args={[curve, 32, r, 8, false]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

/* Column stub at beam end */
function ColumnStub({ x, width, beamH, depth }: {
  x: number; width: number; beamH: number; depth: number;
}) {
  const stubH = beamH * 1.4; // Show column extending above and below beam
  return (
    <group position={[x, beamH / 2, 0]}>
      <mesh>
        <boxGeometry args={[width, stubH, depth]} />
        <meshPhysicalMaterial color={COLOR_COLUMN} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, stubH, depth)]} />
        <lineBasicMaterial color="#7F8C8D" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

function SectionCutPlane({ position, height, width }: { position: number; height: number; width: number }) {
  const hw = width * 0.75, hh = height * 0.75;
  const edgePoints = useMemo(() => {
    const pts = [
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3( hw, -hh, 0),
      new THREE.Vector3( hw,  hh, 0),
      new THREE.Vector3(-hw,  hh, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [hw, hh]);

  return (
    <group position={[position, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[width * 1.5, height * 1.5]} />
        <meshBasicMaterial color="#3B82F6" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineLoop geometry={edgePoints}>
        <lineBasicMaterial color="#2563EB" linewidth={2} />
      </lineLoop>
    </group>
  );
}

/* Camera controller */
function CameraController({ targetPosition }: { targetPosition: [number, number, number] | null }) {
  const { camera } = useThree();
  useEffect(() => {
    if (targetPosition) {
      camera.position.set(...targetPosition);
      camera.updateProjectionMatrix();
    }
  }, [targetPosition, camera]);
  return null;
}

function BeamScene({ params, selected, onSelect, cutPosition, concreteOpacity }: {
  params: BeamParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; cutPosition: number | null; concreteOpacity: number;
}) {
  const bm = params.b * S;
  const hm = params.h * S;
  const COVER = (params.cover || 25) * S;
  const BEAM_LEN = (params.spanLength || 4000) * S;
  const HC = (params.hc || 500) * S; // 柱截面宽度
  const topR = parseRebar(params.top);
  const botR = parseRebar(params.bottom);
  const stir = parseStirrup(params.stirrup);
  const leftR = params.leftSupport ? parseRebar(params.leftSupport) : null;
  const rightR = params.rightSupport ? parseRebar(params.rightSupport) : null;
  const innerW = bm - 2 * COVER;
  const innerH = hm - 2 * COVER;

  // 22G101 anchor calculations
  const topAnchor = calcBeamEndAnchor(topR.grade, topR.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
  const botAnchor = calcBeamEndAnchor(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);

  // 22G101 dense zone: max(2h, 500mm) from column face
  const denseZoneMm = Math.max(2 * params.h, 500);
  const denseZone = denseZoneMm * S;

  const stirrups = useMemo(() => {
    const positions: number[] = [];
    const halfLen = BEAM_LEN / 2;
    const denseS = stir.spacingDense * S;
    const normalS = stir.spacingNormal * S;
    for (let x = -halfLen + 0.05; x < -halfLen + denseZone; x += denseS) positions.push(x);
    for (let x = -halfLen + denseZone; x < halfLen - denseZone; x += normalS) positions.push(x);
    for (let x = halfLen - denseZone; x < halfLen - 0.05; x += denseS) positions.push(x);
    return positions;
  }, [stir.spacingDense, stir.spacingNormal, BEAM_LEN, denseZone]);

  const topBars = useMemo(() => {
    const spacing = innerW / Math.max(topR.count - 1, 1);
    return Array.from({ length: topR.count }, (_, i) => ({ z: -innerW / 2 + i * spacing, y: hm - COVER }));
  }, [topR.count, innerW, hm, COVER]);

  const botBars = useMemo(() => {
    const maxPerRow = Math.floor(innerW / (botR.diameter * S * 2.5)) + 1;
    const rows = botR.count > maxPerRow ? 2 : 1;
    const perRow = rows === 2 ? [Math.ceil(botR.count / 2), Math.floor(botR.count / 2)] : [botR.count];
    const bars: { y: number; z: number }[] = [];
    for (let row = 0; row < rows; row++) {
      const y = COVER + row * botR.diameter * S * 2.5;
      const count = perRow[row];
      const spacing = innerW / Math.max(count - 1, 1);
      for (let i = 0; i < count; i++) bars.push({ y, z: -innerW / 2 + i * spacing });
    }
    return bars;
  }, [botR.count, botR.diameter, innerW, COVER]);

  const supportLenMm = calcSupportRebarLength(params.spanLength || 4000);
  const supportLen = supportLenMm * S;
  const leftBars = useMemo(() => {
    if (!leftR) return [];
    const spacing = innerW / Math.max(leftR.count - 1, 1);
    return Array.from({ length: leftR.count }, (_, i) => ({ z: -innerW / 2 + i * spacing, y: hm - COVER - (topR.diameter * S) }));
  }, [leftR, innerW, hm, topR.diameter, COVER]);

  const rightBars = useMemo(() => {
    if (!rightR) return [];
    const spacing = innerW / Math.max(rightR.count - 1, 1);
    return Array.from({ length: rightR.count }, (_, i) => ({ z: -innerW / 2 + i * spacing, y: hm - COVER - (topR.diameter * S) }));
  }, [rightR, innerW, hm, topR.diameter, COVER]);

  // Anchor description for tooltip
  const topAnchorDesc = topAnchor.canStraight
    ? `直锚 ${topAnchor.straightLen}mm (laE≤hc-c)` : `弯锚 直段${topAnchor.bentStraightPart}mm+弯折15d=${topAnchor.bentBendPart}mm`;
  const botAnchorDesc = botAnchor.canStraight
    ? `直锚 ${botAnchor.straightLen}mm (laE≤hc-c)` : `弯锚 直段${botAnchor.bentStraightPart}mm+弯折15d=${botAnchor.bentBendPart}mm`;

  const isSelected = (type: string) => selected?.type === type;

  return (
    <>
      <mesh position={[0, hm / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[BEAM_LEN + HC * 2 + 1, hm + 1, bm + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* Column stubs at both ends */}
      <ColumnStub x={-BEAM_LEN / 2 - HC / 2} width={HC} beamH={hm} depth={bm * 1.2} />
      <ColumnStub x={BEAM_LEN / 2 + HC / 2} width={HC} beamH={hm} depth={bm * 1.2} />

      {/* Beam concrete body */}
      <mesh position={[0, hm / 2, 0]}>
        <boxGeometry args={[BEAM_LEN, hm, bm]} />
        <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>
      <lineSegments position={[0, hm / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(BEAM_LEN, hm, bm)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {/* Top through bars */}
      {topBars.map((bar, i) => (
        <RebarBar key={`t${i}`} position={[0, bar.y, bar.z]} length={BEAM_LEN} diameter={topR.diameter}
          color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
          info={{ type: 'top', label: '上部通长筋', detail: `${params.top} · ${topR.count}根 ${gradeLabel(topR.grade)} Φ${topR.diameter}，端锚: ${topAnchorDesc}` }}
          selected={isSelected('top')} onSelect={onSelect} />
      ))}

      {/* Top bar anchor bends at both ends (bent anchor: bend down) */}
      {!topAnchor.canStraight && topBars.map((bar, i) => (
        <group key={`ta-l${i}`}>
          <BentRebarEnd
            position={[-BEAM_LEN / 2 - topAnchor.bentStraightPart * S, bar.y, bar.z]}
            straightLen={topAnchor.bentStraightPart * S}
            bendLen={topAnchor.bentBendPart * S}
            diameter={topR.diameter} direction="down" color={COLOR_REBAR} />
          <BentRebarEnd
            position={[BEAM_LEN / 2, bar.y, bar.z]}
            straightLen={topAnchor.bentStraightPart * S}
            bendLen={topAnchor.bentBendPart * S}
            diameter={topR.diameter} direction="down" color={COLOR_REBAR} />
        </group>
      ))}

      {/* Top bar straight anchor extensions into columns */}
      {topAnchor.canStraight && topBars.map((bar, i) => (
        <group key={`ta-s${i}`}>
          <RebarBar position={[-BEAM_LEN / 2 - topAnchor.straightLen * S / 2, bar.y, bar.z]}
            length={topAnchor.straightLen * S} diameter={topR.diameter}
            color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
            info={{ type: 'top', label: '上部筋直锚', detail: topAnchorDesc }}
            selected={isSelected('top')} onSelect={onSelect} />
          <RebarBar position={[BEAM_LEN / 2 + topAnchor.straightLen * S / 2, bar.y, bar.z]}
            length={topAnchor.straightLen * S} diameter={topR.diameter}
            color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
            info={{ type: 'top', label: '上部筋直锚', detail: topAnchorDesc }}
            selected={isSelected('top')} onSelect={onSelect} />
        </group>
      ))}

      {/* Bottom through bars */}
      {botBars.map((bar, i) => (
        <RebarBar key={`b${i}`} position={[0, bar.y, bar.z]} length={BEAM_LEN} diameter={botR.diameter}
          color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
          info={{ type: 'bottom', label: '下部通长筋', detail: `${params.bottom} · ${botR.count}根 ${gradeLabel(botR.grade)} Φ${botR.diameter}，端锚: ${botAnchorDesc}` }}
          selected={isSelected('bottom')} onSelect={onSelect} />
      ))}

      {/* Bottom bar anchor bends at both ends (bent anchor: bend up) */}
      {!botAnchor.canStraight && botBars.map((bar, i) => (
        <group key={`ba-l${i}`}>
          <BentRebarEnd
            position={[-BEAM_LEN / 2 - botAnchor.bentStraightPart * S, bar.y, bar.z]}
            straightLen={botAnchor.bentStraightPart * S}
            bendLen={botAnchor.bentBendPart * S}
            diameter={botR.diameter} direction="up" color={COLOR_REBAR} />
          <BentRebarEnd
            position={[BEAM_LEN / 2, bar.y, bar.z]}
            straightLen={botAnchor.bentStraightPart * S}
            bendLen={botAnchor.bentBendPart * S}
            diameter={botR.diameter} direction="up" color={COLOR_REBAR} />
        </group>
      ))}

      {/* Bottom bar straight anchor extensions into columns */}
      {botAnchor.canStraight && botBars.map((bar, i) => (
        <group key={`ba-s${i}`}>
          <RebarBar position={[-BEAM_LEN / 2 - botAnchor.straightLen * S / 2, bar.y, bar.z]}
            length={botAnchor.straightLen * S} diameter={botR.diameter}
            color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
            info={{ type: 'bottom', label: '下部筋直锚', detail: botAnchorDesc }}
            selected={isSelected('bottom')} onSelect={onSelect} />
          <RebarBar position={[BEAM_LEN / 2 + botAnchor.straightLen * S / 2, bar.y, bar.z]}
            length={botAnchor.straightLen * S} diameter={botR.diameter}
            color={COLOR_REBAR} hiColor={COLOR_REBAR_HI}
            info={{ type: 'bottom', label: '下部筋直锚', detail: botAnchorDesc }}
            selected={isSelected('bottom')} onSelect={onSelect} />
        </group>
      ))}

      {/* Left support rebars (ln/3 from column face) */}
      {leftR && leftBars.map((bar, i) => (
        <RebarBar key={`ls${i}`} position={[-BEAM_LEN / 2 + supportLen / 2, bar.y, bar.z]} length={supportLen} diameter={leftR.diameter}
          color={COLOR_SUPPORT} hiColor={COLOR_SUPPORT_HI}
          info={{ type: 'leftSupport', label: '左支座负筋(第一排)', detail: `${params.leftSupport} · ${leftR.count}根 ${gradeLabel(leftR.grade)} Φ${leftR.diameter}，伸入跨内 ln/3=${supportLenMm}mm` }}
          selected={isSelected('leftSupport')} onSelect={onSelect} />
      ))}

      {/* Right support rebars (ln/3 from column face) */}
      {rightR && rightBars.map((bar, i) => (
        <RebarBar key={`rs${i}`} position={[BEAM_LEN / 2 - supportLen / 2, bar.y, bar.z]} length={supportLen} diameter={rightR.diameter}
          color={COLOR_SUPPORT} hiColor={COLOR_SUPPORT_HI}
          info={{ type: 'rightSupport', label: '右支座负筋(第一排)', detail: `${params.rightSupport} · ${rightR.count}根 ${gradeLabel(rightR.grade)} Φ${rightR.diameter}，伸入跨内 ln/3=${supportLenMm}mm` }}
          selected={isSelected('rightSupport')} onSelect={onSelect} />
      ))}

      {/* Erection bars (架立筋) - shown as short bars overlapping with support rebars by 150mm */}
      {leftR && leftBars.map((bar, i) => {
        const erectionLen = BEAM_LEN - 2 * supportLen + 0.15 * 2; // span minus support zones + 150mm overlap each side
        return (
          <RebarBar key={`el${i}`} position={[0, bar.y, bar.z]} length={Math.min(erectionLen, BEAM_LEN * 0.6)} diameter={Math.max(topR.diameter - 4, 8)}
            color={COLOR_ERECTION} hiColor={COLOR_ERECTION_HI}
            info={{ type: 'leftSupport', label: '架立筋', detail: `与支座负筋搭接≥150mm，连接上部通长筋` }}
            selected={false} onSelect={onSelect} />
        );
      }).slice(0, 1)}

      {/* Stirrups */}
      {stirrups.map((x, i) => (
        <StirrupRing key={`s${i}`} x={x} width={innerW + stir.diameter * S} height={innerH + stir.diameter * S} diameter={stir.diameter}
          color={COLOR_STIRRUP} hiColor={COLOR_STIRRUP_HI} cover={COVER}
          info={{ type: 'stirrup', label: '箍筋', detail: `${params.stirrup} · ${gradeLabel(stir.grade)} Φ${stir.diameter} 加密区${denseZoneMm}mm(=max(2h,500))/${stir.spacingDense} 非加密区/${stir.spacingNormal} ${stir.legs}肢箍` }}
          selected={isSelected('stirrup')} onSelect={onSelect} />
      ))}

      {cutPosition !== null && <SectionCutPlane position={cutPosition} height={hm} width={bm} />}
    </>
  );
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    top: 'bg-red-50 border-red-200 text-red-800',
    bottom: 'bg-red-50 border-red-200 text-red-800',
    stirrup: 'bg-green-50 border-green-200 text-green-800',
    leftSupport: 'bg-purple-50 border-purple-200 text-purple-800',
    rightSupport: 'bg-purple-50 border-purple-200 text-purple-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

export default function BeamViewer({ params, cutPosition, showCut, onCutPositionChange, onShowCutChange }: {
  params: BeamParams;
  cutPosition: number | null;
  showCut: boolean;
  onCutPositionChange: (v: number | null) => void;
  onShowCutChange: (v: boolean) => void;
}) {
  const hm = params.h * S;
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { onShowCutChange(!showCut); if (showCut) onCutPositionChange(null); else onCutPositionChange(0); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${showCut ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-muted hover:bg-gray-50'}`}>
          {showCut ? '关闭剖切' : '剖切视图'}
        </button>
        {selected && (
          <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            取消选中
          </button>
        )}
      </div>

      {showCut && (
        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-2">
          <span className="text-xs text-muted whitespace-nowrap">剖切位置</span>
          <input type="range" min={-1.9} max={1.9} step={0.05} value={cutPosition ?? 0}
            onChange={e => onCutPositionChange(parseFloat(e.target.value))} className="flex-1 accent-accent" />
          <span className="text-xs text-muted w-16 text-right">{((cutPosition ?? 0) + 2).toFixed(1)}m / 4m</span>
        </div>
      )}

      <div className="relative w-full h-[500px] lg:h-[600px] bg-surface rounded-xl border border-gray-200 overflow-hidden">
        {selected && <InfoTooltip info={selected} />}

        {/* Toolbar overlay */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          {[
            { name: '正面', pos: [0, 0.3, 5] as [number, number, number] },
            { name: '侧面', pos: [5, 0.3, 0] as [number, number, number] },
            { name: '俯视', pos: [0, 5, 0.1] as [number, number, number] },
            { name: '透视', pos: [3, 2, 4] as [number, number, number] },
          ].map(a => (
            <button key={a.name} onClick={() => setCameraTarget(a.pos)}
              className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer bg-white/80 backdrop-blur-sm border border-gray-200/60 text-muted hover:bg-white hover:text-primary transition-colors">
              {a.name}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1 px-2 py-1 rounded-md bg-white/80 backdrop-blur-sm border border-gray-200/60">
            <span className="text-[11px] text-muted">透明</span>
            <input type="range" min={0} max={0.4} step={0.02} value={concreteOpacity}
              onChange={e => setConcreteOpacity(parseFloat(e.target.value))} className="w-12 accent-accent" />
          </div>
        </div>

        <Canvas camera={{ position: [3, 2, 4], fov: 45 }} scene={{ background: new THREE.Color('#f8fafc') }}>
          <CameraController targetPosition={cameraTarget} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <BeamScene params={params} selected={selected} onSelect={setSelected} cutPosition={cutPosition} concreteOpacity={concreteOpacity} />
          <Grid args={[10, 10]} position={[0, -0.01, 0]} cellColor="#E2E8F0" sectionColor="#E2E8F0" fadeDistance={15} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, hm / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
