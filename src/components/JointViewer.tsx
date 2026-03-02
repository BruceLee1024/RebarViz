'use client';

import { useMemo, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { JointParams, RebarMeshInfo } from '@/lib/types';
import { parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { calcLaE, calcBendLength } from '@/lib/anchor';
import { S } from '@/lib/constants';

/* ---- Clickable mesh wrapper ---- */
function Clickable({ info, selected, onSelect, children, ...props }: {
  info: RebarMeshInfo; selected: boolean;
  onSelect: (info: RebarMeshInfo | null) => void;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group
      {...props}
      onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : info); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {children}
    </group>
  );
}

/* ---- Tube along a path (for bent bars) ---- */
function TubePath({ points, radius, color }: { points: THREE.Vector3[]; radius: number; color: string }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.01), [points]);
  return (
    <mesh>
      <tubeGeometry args={[curve, 32, radius, 8, false]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

/* ---- Stirrup ring (horizontal) ---- */
function HStirrupRing({ y, width, depth, radius, color }: {
  y: number; width: number; depth: number; radius: number; color: string;
}) {
  const curve = useMemo(() => {
    const w2 = width / 2, d2 = depth / 2, r = 0.012;
    const shape = new THREE.Shape();
    shape.moveTo(-w2 + r, -d2);
    shape.lineTo(w2 - r, -d2);
    shape.quadraticCurveTo(w2, -d2, w2, -d2 + r);
    shape.lineTo(w2, d2 - r);
    shape.quadraticCurveTo(w2, d2, w2 - r, d2);
    shape.lineTo(-w2 + r, d2);
    shape.quadraticCurveTo(-w2, d2, -w2, d2 - r);
    shape.lineTo(-w2, -d2 + r);
    shape.quadraticCurveTo(-w2, -d2, -w2 + r, -d2);
    const pts = shape.getPoints(40);
    return new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.y)), true);
  }, [width, depth]);

  return (
    <mesh position={[0, y, 0]}>
      <tubeGeometry args={[curve, 48, radius, 8, true]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

/* ---- Vertical stirrup ring (for beam) ---- */
function VStirrupRing({ x, width, height, yCenter, radius, color }: {
  x: number; width: number; height: number; yCenter: number; radius: number; color: string;
}) {
  const curve = useMemo(() => {
    const w2 = width / 2, h2 = height / 2, r = 0.012;
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

  return (
    <mesh position={[x, yCenter, 0]}>
      <tubeGeometry args={[curve, 48, radius, 8, true]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

/* ---- Main Joint Scene ---- */
function CameraController({ targetPosition }: { targetPosition: [number, number, number] | null }) {
  const { camera } = useThree();
  useEffect(() => {
    if (targetPosition) { camera.position.set(...targetPosition); camera.updateProjectionMatrix(); }
  }, [targetPosition, camera]);
  return null;
}

function JointScene({ params, selected, onSelect, concreteOpacity }: {
  params: JointParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; concreteOpacity: number;
}) {
  const cB = params.colB * S;
  const cH = params.colH * S;
  const bB = params.beamB * S;
  const bH = params.beamH * S;
  const COVER = (params.cover || 25) * S;

  const colR = parseRebar(params.colMain);
  const colStir = parseStirrup(params.colStirrup);
  const beamTopR = parseRebar(params.beamTop);
  const beamBotR = parseRebar(params.beamBottom);
  const beamStir = parseStirrup(params.beamStirrup);

  const colHeight = 3.0;
  const beamLen = 1.8; // beam extends 1.8m from column face
  const jointBottom = (colHeight - bH) / 2; // beam centered on column
  const jointTop = jointBottom + bH;
  const beamCenterY = colHeight / 2;

  const isMiddle = params.jointType === 'middle';
  const isSide = params.jointType === 'side';

  // Anchor length - use actual calculation
  const laEMm = calcLaE(beamTopR.grade, beamTopR.diameter, params.concreteGrade, params.seismicGrade);
  const laE = laEMm * S;
  const bendLenMm = calcBendLength(beamTopR.diameter);
  const bendLen = bendLenMm * S;

  // ---- Column rebars (vertical, full height) ----
  const colInnerW = cB - 2 * COVER;
  const colInnerH = cH - 2 * COVER;
  const colRebarPos = useMemo(() => {
    const perSide = Math.max(Math.round(colR.count / 4), 2);
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < perSide; i++) pts.push({ x: -colInnerW / 2 + (colInnerW * i) / (perSide - 1), z: colInnerH / 2 });
    for (let i = 1; i < perSide; i++) pts.push({ x: colInnerW / 2, z: colInnerH / 2 - (colInnerH * i) / (perSide - 1) });
    for (let i = 1; i < perSide; i++) pts.push({ x: colInnerW / 2 - (colInnerW * i) / (perSide - 1), z: -colInnerH / 2 });
    for (let i = 1; i < perSide - 1; i++) pts.push({ x: -colInnerW / 2, z: -colInnerH / 2 + (colInnerH * i) / (perSide - 1) });
    return pts.slice(0, colR.count);
  }, [colR.count, colInnerW, colInnerH]);

  // ---- Column stirrups ----
  const colStirPositions = useMemo(() => {
    const positions: number[] = [];
    const denseS = colStir.spacingDense * S;
    const normalS = colStir.spacingNormal * S;
    const denseZone = 0.5;
    // Below joint
    for (let y = 0.05; y < jointBottom - 0.02; y += (y < denseZone ? denseS : normalS)) positions.push(y);
    // In joint zone (always dense)
    for (let y = jointBottom; y <= jointTop; y += denseS) positions.push(y);
    // Above joint
    for (let y = jointTop + denseS; y < colHeight - 0.05; y += (y > colHeight - denseZone ? denseS : normalS)) positions.push(y);
    return positions;
  }, [colStir.spacingDense, colStir.spacingNormal, jointBottom, jointTop]);

  // ---- Beam rebar positions (in Z direction, beam width) ----
  const beamInnerW = bB - 2 * COVER;
  const beamTopBars = useMemo(() => {
    const spacing = beamInnerW / Math.max(beamTopR.count - 1, 1);
    return Array.from({ length: beamTopR.count }, (_, i) => -beamInnerW / 2 + i * spacing);
  }, [beamTopR.count, beamInnerW]);

  const beamBotBars = useMemo(() => {
    const spacing = beamInnerW / Math.max(beamBotR.count - 1, 1);
    return Array.from({ length: beamBotR.count }, (_, i) => -beamInnerW / 2 + i * spacing);
  }, [beamBotR.count, beamInnerW]);

  // ---- Beam stirrup positions ----
  const beamStirPositions = useMemo(() => {
    const positions: number[] = [];
    const denseS = beamStir.spacingDense * S;
    const normalS = beamStir.spacingNormal * S;
    const denseZone = 0.5;
    // Right beam
    const start = cB / 2 + 0.03;
    for (let x = start; x < start + beamLen; x += (x < start + denseZone ? denseS : normalS)) positions.push(x);
    // Left beam (if middle joint)
    if (isMiddle) {
      const lStart = -cB / 2 - 0.03;
      for (let x = lStart; x > lStart - beamLen; x -= (x > lStart - denseZone ? denseS : normalS)) positions.push(x);
    }
    return positions;
  }, [beamStir.spacingDense, beamStir.spacingNormal, cB, isMiddle]);

  // Info objects
  const colMainInfo: RebarMeshInfo = { type: 'colMain', label: '柱纵筋', detail: `${params.colMain} · ${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter}，贯穿节点区` };
  const colStirInfo: RebarMeshInfo = { type: 'colStirrup', label: '柱箍筋 / 节点区箍筋', detail: `${params.colStirrup} · 节点区箍筋加密，间距 ${colStir.spacingDense}mm` };
  const beamTopInfo: RebarMeshInfo = { type: 'beamTop', label: '梁上部纵筋', detail: `${params.beamTop} · ${beamTopR.count}根 Φ${beamTopR.diameter}，${params.anchorType === 'bent' ? '弯锚入柱' : '直锚入柱'}` };
  const beamBotInfo: RebarMeshInfo = { type: 'beamBottom', label: '梁下部纵筋', detail: `${params.beamBottom} · ${beamBotR.count}根 Φ${beamBotR.diameter}，${params.anchorType === 'bent' ? '弯锚入柱' : '直锚入柱'}` };
  const beamStirInfo: RebarMeshInfo = { type: 'beamStirrup', label: '梁箍筋', detail: `${params.beamStirrup} · 加密区 ${beamStir.spacingDense}mm，非加密区 ${beamStir.spacingNormal}mm` };
  const anchorInfo: RebarMeshInfo = { type: 'anchor', label: params.anchorType === 'bent' ? '弯锚构造' : '直锚构造', detail: params.anchorType === 'bent' ? `弯折段长度 12d = ${bendLenMm}mm，弯折角度 90°` : `直锚长度 laE = ${laEMm}mm` };

  const topY = beamCenterY + bH / 2 - COVER;
  const botY = beamCenterY - bH / 2 + COVER;

  return (
    <>
      {/* Click to deselect */}
      <mesh onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[8, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* ===== COLUMN CONCRETE ===== */}
      <mesh position={[0, colHeight / 2, 0]}>
        <boxGeometry args={[cB, colHeight, cH]} />
        <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments position={[0, colHeight / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(cB, colHeight, cH)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {/* ===== BEAM CONCRETE (right) ===== */}
      <mesh position={[cB / 2 + beamLen / 2, beamCenterY, 0]}>
        <boxGeometry args={[beamLen, bH, bB]} />
        <meshPhysicalMaterial color="#D5DBDB" transparent opacity={concreteOpacity * 0.8} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments position={[cB / 2 + beamLen / 2, beamCenterY, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(beamLen, bH, bB)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {/* ===== BEAM CONCRETE (left, if middle) ===== */}
      {isMiddle && (
        <>
          <mesh position={[-cB / 2 - beamLen / 2, beamCenterY, 0]}>
            <boxGeometry args={[beamLen, bH, bB]} />
            <meshPhysicalMaterial color="#D5DBDB" transparent opacity={concreteOpacity * 0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments position={[-cB / 2 - beamLen / 2, beamCenterY, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(beamLen, bH, bB)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
        </>
      )}

      {/* ===== COLUMN REBARS ===== */}
      <Clickable info={colMainInfo} selected={selected?.type === 'colMain'} onSelect={onSelect}>
        {colRebarPos.map((p, i) => (
          <mesh key={`cr${i}`} position={[p.x, colHeight / 2, p.z]}>
            <cylinderGeometry args={[colR.diameter * S / 2, colR.diameter * S / 2, colHeight, 12]} />
            <meshStandardMaterial color={selected?.type === 'colMain' ? '#E74C3C' : '#C0392B'} roughness={0.4} metalness={0.6}
              emissive={selected?.type === 'colMain' ? '#E74C3C' : '#000'} emissiveIntensity={selected?.type === 'colMain' ? 0.3 : 0} />
          </mesh>
        ))}
      </Clickable>

      {/* ===== COLUMN / JOINT STIRRUPS ===== */}
      <Clickable info={colStirInfo} selected={selected?.type === 'colStirrup'} onSelect={onSelect}>
        {colStirPositions.map((y, i) => {
          const inJoint = y >= jointBottom && y <= jointTop;
          const color = inJoint
            ? (selected?.type === 'colStirrup' ? '#F39C12' : '#E67E22')
            : (selected?.type === 'colStirrup' ? '#2ECC71' : '#27AE60');
          return (
            <HStirrupRing key={`cs${i}`} y={y}
              width={colInnerW + colStir.diameter * S}
              depth={colInnerH + colStir.diameter * S}
              radius={colStir.diameter * S / 2} color={color} />
          );
        })}
      </Clickable>

      {/* ===== BEAM TOP REBARS with anchor ===== */}
      <Clickable info={beamTopInfo} selected={selected?.type === 'beamTop'} onSelect={onSelect}>
        {beamTopBars.map((z, i) => {
          const color = selected?.type === 'beamTop' ? '#E74C3C' : '#C0392B';
          const r = beamTopR.diameter * S / 2;

          if (params.anchorType === 'bent') {
            // Right beam: bar goes from beam end, through column, bends down
            const pts = [
              new THREE.Vector3(cB / 2 + beamLen, topY, z),
              new THREE.Vector3(cB / 2, topY, z),
              new THREE.Vector3(-cB / 2 + COVER + 0.01, topY, z),
              new THREE.Vector3(-cB / 2 + COVER, topY - 0.02, z),
              new THREE.Vector3(-cB / 2 + COVER, topY - bendLen, z),
            ];
            return (
              <group key={`bt${i}`}>
                <TubePath points={pts} radius={r} color={color} />
                {isMiddle && (
                  <TubePath points={[
                    new THREE.Vector3(-cB / 2 - beamLen, topY, z),
                    new THREE.Vector3(-cB / 2, topY, z),
                    new THREE.Vector3(cB / 2 - COVER - 0.01, topY, z),
                    new THREE.Vector3(cB / 2 - COVER, topY - 0.02, z),
                    new THREE.Vector3(cB / 2 - COVER, topY - bendLen, z),
                  ]} radius={r} color={color} />
                )}
              </group>
            );
          } else {
            // Straight anchor
            const totalLen = beamLen + cH;
            return (
              <group key={`bt${i}`}>
                <mesh position={[(cB / 2 + beamLen - totalLen / 2) / 2 + totalLen / 4, topY, z]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[r, r, beamLen + cH * 0.8, 12]} />
                  <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
                </mesh>
                {isMiddle && (
                  <mesh position={[-(cB / 2 + beamLen - totalLen / 2) / 2 - totalLen / 4, topY, z]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[r, r, beamLen + cH * 0.8, 12]} />
                    <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
                  </mesh>
                )}
              </group>
            );
          }
        })}
      </Clickable>

      {/* ===== BEAM BOTTOM REBARS with anchor ===== */}
      <Clickable info={beamBotInfo} selected={selected?.type === 'beamBottom'} onSelect={onSelect}>
        {beamBotBars.map((z, i) => {
          const color = selected?.type === 'beamBottom' ? '#3498DB' : '#2980B9';
          const r = beamBotR.diameter * S / 2;

          if (params.anchorType === 'bent') {
            const pts = [
              new THREE.Vector3(cB / 2 + beamLen, botY, z),
              new THREE.Vector3(cB / 2, botY, z),
              new THREE.Vector3(-cB / 2 + COVER + 0.01, botY, z),
              new THREE.Vector3(-cB / 2 + COVER, botY + 0.02, z),
              new THREE.Vector3(-cB / 2 + COVER, botY + bendLen, z),
            ];
            return (
              <group key={`bb${i}`}>
                <TubePath points={pts} radius={r} color={color} />
                {isMiddle && (
                  <TubePath points={[
                    new THREE.Vector3(-cB / 2 - beamLen, botY, z),
                    new THREE.Vector3(-cB / 2, botY, z),
                    new THREE.Vector3(cB / 2 - COVER - 0.01, botY, z),
                    new THREE.Vector3(cB / 2 - COVER, botY + 0.02, z),
                    new THREE.Vector3(cB / 2 - COVER, botY + bendLen, z),
                  ]} radius={r} color={color} />
                )}
              </group>
            );
          } else {
            return (
              <group key={`bb${i}`}>
                <mesh position={[(cB / 2 + beamLen) / 2 - cH * 0.1, botY, z]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[r, r, beamLen + cH * 0.8, 12]} />
                  <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
                </mesh>
                {isMiddle && (
                  <mesh position={[-(cB / 2 + beamLen) / 2 + cH * 0.1, botY, z]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[r, r, beamLen + cH * 0.8, 12]} />
                    <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
                  </mesh>
                )}
              </group>
            );
          }
        })}
      </Clickable>

      {/* ===== BEAM STIRRUPS ===== */}
      <Clickable info={beamStirInfo} selected={selected?.type === 'beamStirrup'} onSelect={onSelect}>
        {beamStirPositions.map((x, i) => (
          <VStirrupRing key={`bs${i}`} x={x}
            width={beamInnerW + beamStir.diameter * S}
            height={bH - 2 * COVER + beamStir.diameter * S}
            yCenter={beamCenterY}
            radius={beamStir.diameter * S / 2}
            color={selected?.type === 'beamStirrup' ? '#2ECC71' : '#27AE60'} />
        ))}
      </Clickable>

      {/* ===== JOINT ZONE HIGHLIGHT ===== */}
      <mesh position={[0, beamCenterY, 0]}>
        <boxGeometry args={[cB + 0.005, bH + 0.005, cH + 0.005]} />
        <meshBasicMaterial color="#F39C12" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ---- Info tooltip ---- */
function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    colMain: 'bg-red-50 border-red-200 text-red-800',
    colStirrup: 'bg-orange-50 border-orange-200 text-orange-800',
    beamTop: 'bg-red-50 border-red-200 text-red-800',
    beamBottom: 'bg-blue-50 border-blue-200 text-blue-800',
    beamStirrup: 'bg-green-50 border-green-200 text-green-800',
    jointStirrup: 'bg-orange-50 border-orange-200 text-orange-800',
    anchor: 'bg-purple-50 border-purple-200 text-purple-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

/* ---- Exported component ---- */
export default function JointViewer({ params }: { params: JointParams }) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.12);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {selected && (
          <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            取消选中
          </button>
        )}
        <span className="text-xs text-muted">
          {params.jointType === 'middle' ? '中间节点（双侧梁）' : params.jointType === 'side' ? '边节点（单侧梁）' : '角节点'}
          {' · '}
          {params.anchorType === 'bent' ? '弯锚' : '直锚'}
        </span>
      </div>

      <div className="relative w-full h-[500px] lg:h-[600px] bg-surface rounded-xl border border-gray-200 overflow-hidden">
        {selected && <InfoTooltip info={selected} />}

        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          {[
            { name: '正面', pos: [0, 1.5, 5] as [number, number, number] },
            { name: '侧面', pos: [5, 1.5, 0] as [number, number, number] },
            { name: '俯视', pos: [0, 6, 0.1] as [number, number, number] },
            { name: '透视', pos: [3, 2.5, 4] as [number, number, number] },
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

        <Canvas camera={{ position: [3, 2.5, 4], fov: 45 }} scene={{ background: new THREE.Color('#f8fafc') }}>
          <CameraController targetPosition={cameraTarget} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <JointScene params={params} selected={selected} onSelect={setSelected} concreteOpacity={concreteOpacity} />
          <Grid args={[10, 10]} position={[0, -0.01, 0]} cellColor="#E2E8F0" sectionColor="#E2E8F0" fadeDistance={15} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, 1.5, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
