'use client';

import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { RebarMeshInfo } from '@/lib/types';
import { S, REBAR_MATERIAL, STIRRUP_CURVE_SAMPLES } from '@/lib/constants';

export interface StirrupRingProps {
  x: number;
  width: number;
  height: number;
  diameter: number;
  color: string;
  hiColor: string;
  info: RebarMeshInfo;
  selected: boolean;
  onSelect: (info: RebarMeshInfo | null) => void;
  cover: number;
  legs?: number;
  cornerRadius?: number;
  barZPositions?: number[];
}

/**
 * 箍筋环组件（含 135° 弯钩）
 * 22G101: 抗震箍筋弯钩 135°, 直段≥10d≥75mm
 */
export function StirrupRing({
  x,
  width,
  height,
  diameter,
  color,
  hiColor,
  info,
  selected,
  onSelect,
  cover,
  legs = 2,
  cornerRadius,
  barZPositions,
}: StirrupRingProps) {
  const [hovered, setHovered] = useState(false);

  // 主环曲线
  const curve = useMemo(() => {
    const w2 = width / 2;
    const h2 = height / 2;
    const dS = diameter * S;
    const innerBendR = Math.max(2 * dS, 0.01);
    const r = cornerRadius ?? innerBendR + dS / 2;
    const rC = Math.min(r, w2 * 0.45, h2 * 0.45);

    const path2d = new THREE.Path();
    path2d.moveTo(-w2 + rC, -h2);
    path2d.lineTo(w2 - rC, -h2);
    path2d.absarc(w2 - rC, -h2 + rC, rC, -Math.PI / 2, 0, false);
    path2d.lineTo(w2, h2 - rC);
    path2d.absarc(w2 - rC, h2 - rC, rC, 0, Math.PI / 2, false);
    path2d.lineTo(-w2 + rC, h2);
    path2d.absarc(-w2 + rC, h2 - rC, rC, Math.PI / 2, Math.PI, false);
    path2d.lineTo(-w2, -h2 + rC);
    path2d.absarc(-w2 + rC, -h2 + rC, rC, Math.PI, Math.PI * 1.5, false);

    const pts2d = path2d.getSpacedPoints(STIRRUP_CURVE_SAMPLES);
    const pts3d = pts2d.map((p) => new THREE.Vector3(0, p.y, p.x));
    return new THREE.CatmullRomCurve3(pts3d, true, 'centripetal');
  }, [width, height, diameter, cornerRadius]);

  // 135° 弯钩曲线
  const hookCurves = useMemo(() => {
    const dS = diameter * S;
    const hookLen = Math.max(10 * dS, 0.075);
    const w2 = width / 2;
    const h2 = height / 2;
    const R = Math.max(2.5 * dS, 0.006);
    const c45 = Math.SQRT1_2;
    const innerBendR = Math.max(2 * dS, 0.01);
    const rC = Math.min(cornerRadius ?? innerBendR + dS / 2, w2 * 0.45, h2 * 0.45);
    const arcSteps = 12;

    // Hook 1: 沿上边向左 → 135°弧 → 尾部
    const Zc1 = -w2 + rC;
    const Yc1 = h2 - R;
    const h1pts: THREE.Vector3[] = [];
    for (let t = 0; t <= 1; t += 0.25) {
      h1pts.push(new THREE.Vector3(0, h2, Zc1 + R * 2 * (1 - t)));
    }
    for (let i = 0; i <= arcSteps; i++) {
      const a = ((3 * Math.PI) / 4) * (i / arcSteps);
      h1pts.push(new THREE.Vector3(0, Yc1 + R * Math.cos(a), Zc1 - R * Math.sin(a)));
    }
    const endY1 = Yc1 + R * Math.cos((3 * Math.PI) / 4);
    const endZ1 = Zc1 - R * Math.sin((3 * Math.PI) / 4);
    for (let t = 0.1; t <= 1; t += 0.1) {
      h1pts.push(new THREE.Vector3(0, endY1 - hookLen * c45 * t, endZ1 + hookLen * c45 * t));
    }

    // Hook 2: 沿左边向上 → 135°弧 → 尾部
    const Yc2 = h2 - R;
    const h2pts: THREE.Vector3[] = [];
    for (let t = 0; t <= 1; t += 0.25) {
      h2pts.push(new THREE.Vector3(0, Yc2 - R * 2 * (1 - t), -w2));
    }
    for (let i = 0; i <= arcSteps; i++) {
      const a = ((3 * Math.PI) / 4) * (i / arcSteps);
      h2pts.push(new THREE.Vector3(0, Yc2 + R * Math.sin(a), -w2 + R * (1 - Math.cos(a))));
    }
    const endY2 = Yc2 + R * Math.sin((3 * Math.PI) / 4);
    const endZ2 = -w2 + R * (1 - Math.cos((3 * Math.PI) / 4));
    for (let t = 0.1; t <= 1; t += 0.1) {
      h2pts.push(new THREE.Vector3(0, endY2 - hookLen * c45 * t, endZ2 + hookLen * c45 * t));
    }

    return [
      new THREE.CatmullRomCurve3(h1pts, false, 'centripetal'),
      new THREE.CatmullRomCurve3(h2pts, false, 'centripetal'),
    ];
  }, [width, height, diameter, cornerRadius]);

  // 多肢箍中间拉筋位置
  const legPositions = useMemo(() => {
    if (legs <= 2) return [];
    const innerLegs = legs - 2;
    if (barZPositions && barZPositions.length >= 2) {
      const sorted = [...new Set(barZPositions)].sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        gaps.push((sorted[i] + sorted[i + 1]) / 2);
      }
      if (gaps.length >= innerLegs) {
        const step = gaps.length / innerLegs;
        return Array.from({ length: innerLegs }, (_, i) =>
          gaps[Math.min(Math.round(step * i + step / 2 - 0.5), gaps.length - 1)],
        );
      }
      return gaps.slice(0, innerLegs);
    }
    const spacing = width / (legs - 1);
    const positions: number[] = [];
    for (let i = 1; i <= innerLegs; i++) {
      positions.push(-width / 2 + i * spacing);
    }
    return positions;
  }, [legs, width, barZPositions]);

  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const r = (diameter * S) / 2;

  return (
    <group
      position={[x, height / 2 + cover, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : info);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* 外围箍筋 */}
      <mesh>
        <tubeGeometry args={[curve, 200, r, 8, true]} />
        <meshStandardMaterial
          color={activeColor}
          roughness={REBAR_MATERIAL.roughness}
          metalness={REBAR_MATERIAL.metalness}
          emissive={selected ? hiColor : '#000000'}
          emissiveIntensity={selected ? 0.3 : 0}
        />
      </mesh>

      {/* 箍筋弯钩 (135° hooks) */}
      {hookCurves.map((hc, hi) => (
        <mesh key={`hook${hi}`}>
          <tubeGeometry args={[hc, 40, r, 6, false]} />
          <meshStandardMaterial
            color={activeColor}
            roughness={REBAR_MATERIAL.roughness}
            metalness={REBAR_MATERIAL.metalness}
            emissive={selected ? hiColor : '#000000'}
            emissiveIntensity={selected ? 0.3 : 0}
          />
        </mesh>
      ))}

      {/* 中间拉筋（多肢箍） */}
      {legPositions.map((z, i) => (
        <mesh key={`leg${i}`} position={[0, 0, z]}>
          <cylinderGeometry args={[r, r, height, 8]} />
          <meshStandardMaterial
            color={activeColor}
            roughness={REBAR_MATERIAL.roughness}
            metalness={REBAR_MATERIAL.metalness}
            emissive={selected ? hiColor : '#000000'}
            emissiveIntensity={selected ? 0.3 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}
