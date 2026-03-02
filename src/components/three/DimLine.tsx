'use client';

import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';

interface DimLabelProps {
  color: string;
  label: string;
}

/**
 * 标注文字样式——轻量级，不遮挡模型
 */
function DimLabel({ color, label }: DimLabelProps) {
  return (
    <div
      style={{
        color,
        fontSize: 8,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 6px rgba(255,255,255,0.8)',
        lineHeight: 1,
        letterSpacing: '-0.01em',
      }}
    >
      {label}
    </div>
  );
}

export interface DimLineProps {
  start: number;
  end: number;
  offset: number;
  label: string;
  color?: string;
  tickLen?: number;
  z?: number;
}

/**
 * 水平标注线组件
 * 包含界线 + 尺寸线 + 箭头 + 文字
 */
export function DimLine({
  start,
  end,
  offset,
  label,
  color = '#2563EB',
  tickLen = 0.04,
  z = 0,
}: DimLineProps) {
  const dir = offset > 0 ? 1 : -1;
  const absOff = Math.abs(offset);
  const mid = (start + end) / 2;
  const arrowSize = Math.min(0.025, Math.abs(end - start) * 0.15);

  return (
    <group>
      {/* 左界线 */}
      <Line
        points={[
          [start, dir * (absOff - tickLen), z],
          [start, dir * (absOff + tickLen), z],
        ]}
        color={color}
        lineWidth={1}
      />
      {/* 右界线 */}
      <Line
        points={[
          [end, dir * (absOff - tickLen), z],
          [end, dir * (absOff + tickLen), z],
        ]}
        color={color}
        lineWidth={1}
      />
      {/* 尺寸线 */}
      <Line
        points={[
          [start, dir * absOff, z],
          [end, dir * absOff, z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 左箭头 */}
      <Line
        points={[
          [start + arrowSize, dir * (absOff + arrowSize * 0.5), z],
          [start, dir * absOff, z],
          [start + arrowSize, dir * (absOff - arrowSize * 0.5), z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 右箭头 */}
      <Line
        points={[
          [end - arrowSize, dir * (absOff + arrowSize * 0.5), z],
          [end, dir * absOff, z],
          [end - arrowSize, dir * (absOff - arrowSize * 0.5), z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 文字标注 */}
      <Html position={[mid, dir * absOff, z]} center distanceFactor={8}>
        <DimLabel color={color} label={label} />
      </Html>
    </group>
  );
}

export interface VDimLineProps {
  x: number;
  bottom: number;
  top: number;
  offset: number;
  label: string;
  color?: string;
  tickLen?: number;
  z?: number;
}

/**
 * 垂直标注线组件
 */
export function VDimLine({
  x,
  bottom,
  top,
  offset,
  label,
  color = '#2563EB',
  tickLen = 0.04,
  z = 0,
}: VDimLineProps) {
  const dir = offset > 0 ? 1 : -1;
  const absOff = Math.abs(offset);
  const mid = (bottom + top) / 2;
  const arrowSize = Math.min(0.025, Math.abs(top - bottom) * 0.15);
  const xOff = x + dir * absOff;

  return (
    <group>
      {/* 上界线 */}
      <Line
        points={[
          [xOff - tickLen, top, z],
          [xOff + tickLen, top, z],
        ]}
        color={color}
        lineWidth={1}
      />
      {/* 下界线 */}
      <Line
        points={[
          [xOff - tickLen, bottom, z],
          [xOff + tickLen, bottom, z],
        ]}
        color={color}
        lineWidth={1}
      />
      {/* 尺寸线 */}
      <Line
        points={[
          [xOff, bottom, z],
          [xOff, top, z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 下箭头 */}
      <Line
        points={[
          [xOff - arrowSize * 0.5, bottom + arrowSize, z],
          [xOff, bottom, z],
          [xOff + arrowSize * 0.5, bottom + arrowSize, z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 上箭头 */}
      <Line
        points={[
          [xOff - arrowSize * 0.5, top - arrowSize, z],
          [xOff, top, z],
          [xOff + arrowSize * 0.5, top - arrowSize, z],
        ]}
        color={color}
        lineWidth={1.5}
      />
      {/* 文字标注 */}
      <Html position={[xOff, mid, z]} center distanceFactor={8}>
        <DimLabel color={color} label={label} />
      </Html>
    </group>
  );
}

export interface DenseZoneMarkProps {
  x: number;
  beamH: number;
}

/**
 * 加密区分界线（仅竖向虚线，无浮动标签）
 */
export function DenseZoneMark({ x, beamH }: DenseZoneMarkProps) {
  const points = useMemo(
    () =>
      [
        [x, -beamH * 0.08, 0] as [number, number, number],
        [x, beamH * 1.08, 0] as [number, number, number],
      ],
    [x, beamH],
  );

  return (
    <Line
      points={points}
      color="#F59E0B"
      lineWidth={1}
      dashed
      dashSize={0.025}
      gapSize={0.015}
      opacity={0.6}
      transparent
    />
  );
}
