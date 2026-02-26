import type { ConcreteGrade, SeismicGrade } from './anchor';

export interface RebarInfo {
  count: number;
  grade: string;
  diameter: number;
}

export interface StirrupInfo {
  grade: string;
  diameter: number;
  spacingDense: number;
  spacingNormal: number;
  legs: number;
}

export interface BeamParams {
  id: string;
  b: number;
  h: number;
  top: string;
  bottom: string;
  stirrup: string;
  leftSupport?: string;
  rightSupport?: string;
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;          // 保护层厚度 mm
  spanLength: number;     // 梁净跨 mm
  hc: number;             // 支座柱截面宽度 mm（沿梁方向）
}

export interface ColumnParams {
  id: string;
  b: number;
  h: number;
  main: string;
  stirrup: string;
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;
  height: number;         // 柱净高 mm
}

export interface SlabParams {
  id: string;
  thickness: number;
  bottomX: string;
  bottomY: string;
  topX: string;
  topY: string;
  distribution: string;
  // 新增
  concreteGrade: ConcreteGrade;
  cover: number;
}

export interface JointParams {
  colB: number;
  colH: number;
  colMain: string;
  colStirrup: string;
  beamB: number;
  beamH: number;
  beamTop: string;
  beamBottom: string;
  beamStirrup: string;
  jointType: 'middle' | 'side' | 'corner';
  anchorType: 'straight' | 'bent';
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;
}

export type ComponentType = 'beam' | 'column' | 'slab' | 'joint';

export interface RebarMeshInfo {
  type: 'top' | 'bottom' | 'stirrup' | 'leftSupport' | 'rightSupport' | 'main'
    | 'bottomX' | 'bottomY' | 'topX' | 'topY' | 'distribution'
    | 'colMain' | 'colStirrup' | 'beamTop' | 'beamBottom' | 'beamStirrup' | 'jointStirrup' | 'anchor';
  label: string;
  detail: string;
}
