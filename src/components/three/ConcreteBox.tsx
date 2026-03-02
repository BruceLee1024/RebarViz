'use client';

import * as THREE from 'three';
import { COLOR_COLUMN, CONCRETE_MATERIAL } from '@/lib/constants';

export interface ConcreteBoxProps {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  opacity?: number;
  color?: string;
}

/**
 * 混凝土箱体（梁、柱等外壳）
 */
export function ConcreteBox({
  position,
  width,
  height,
  depth,
  opacity = 0.15,
  color = CONCRETE_MATERIAL.color,
}: ConcreteBoxProps) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={CONCRETE_MATERIAL.roughness}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>
    </group>
  );
}

export interface ColumnStubProps {
  x: number;
  width: number;
  beamH: number;
  depth: number;
  haunchDepth?: number;
}

/**
 * 柱墩（梁端柱的可视化）
 */
export function ColumnStub({ x, width, beamH, depth, haunchDepth = 0 }: ColumnStubProps) {
  const topExt = beamH * 0.3;
  const botExt = haunchDepth + beamH * 0.3;
  const stubH = beamH + topExt + botExt;
  const centerY = beamH / 2 + (topExt - botExt) / 2;

  return (
    <group position={[x, centerY, 0]}>
      <mesh>
        <boxGeometry args={[width, stubH, depth]} />
        <meshPhysicalMaterial
          color={COLOR_COLUMN}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.8}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, stubH, depth)]} />
        <lineBasicMaterial color="#7F8C8D" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

export interface SectionCutPlaneProps {
  position: number;
  height: number;
  width: number;
}

/**
 * 剖切面组件
 */
export function SectionCutPlane({ position, height, width }: SectionCutPlaneProps) {
  const hw = width * 0.75;
  const hh = height * 0.75;

  return (
    <group position={[position, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[width * 1.5, height * 1.5]} />
        <meshBasicMaterial
          color="#3B82F6"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -hw, -hh, 0,
                hw, -hh, 0,
                hw, hh, 0,
                -hw, hh, 0,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#2563EB" linewidth={2} />
      </lineLoop>
    </group>
  );
}
