import type { RebarInfo, StirrupInfo } from './types';

export const GRADE_MAP: Record<string, string> = {
  A: 'HPB300 (一级)',
  B: 'HRB335 (二级)',
  C: 'HRB400 (三级)',
  D: 'RRB400 (四级)',
  E: 'HRBF400',
};

export function parseRebar(str: string): RebarInfo {
  const m = str.match(/(\d+)([A-Za-z])(\d+)/);
  if (!m) return { count: 2, grade: 'C', diameter: 20 };
  return { count: parseInt(m[1]), grade: m[2].toUpperCase(), diameter: parseInt(m[3]) };
}

// 板筋格式: "C10@150" => { grade:'C', diameter:10, spacing:150 }
export function parseSlabRebar(str: string): { grade: string; diameter: number; spacing: number } {
  const m = str.match(/([A-Za-z])(\d+)@(\d+)/);
  if (!m) return { grade: 'C', diameter: 10, spacing: 150 };
  return { grade: m[1].toUpperCase(), diameter: parseInt(m[2]), spacing: parseInt(m[3]) };
}

export function parseStirrup(str: string): StirrupInfo {
  const m = str.match(/([A-Za-z])(\d+)@(\d+)(?:\/(\d+))?\((\d+)\)/);
  if (!m) return { grade: 'A', diameter: 8, spacingDense: 100, spacingNormal: 200, legs: 2 };
  return {
    grade: m[1].toUpperCase(),
    diameter: parseInt(m[2]),
    spacingDense: parseInt(m[3]),
    spacingNormal: m[4] ? parseInt(m[4]) : parseInt(m[3]),
    legs: parseInt(m[5]),
  };
}

export function gradeLabel(grade: string): string {
  return GRADE_MAP[grade] || grade;
}

export const BEAM_PRESETS = {
  simple: {
    id: 'KL1(2)', b: 250, h: 500, top: '2C20', bottom: '3C22',
    stirrup: 'A8@150/150(2)', leftSupport: '', rightSupport: '',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500,
  },
  standard: {
    id: 'KL1(3)', b: 300, h: 600, top: '2C25', bottom: '4C25',
    stirrup: 'A8@100/200(2)', leftSupport: '2C25', rightSupport: '4C25',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500,
  },
  complex: {
    id: 'KL2(4)', b: 350, h: 700, top: '4C25', bottom: '6C28',
    stirrup: 'A10@100/200(4)', leftSupport: '4C25', rightSupport: '6C25',
    concreteGrade: 'C35' as const, seismicGrade: '二级' as const, cover: 25, spanLength: 6000, hc: 600,
  },
} as const;

export const COLUMN_PRESETS = {
  simple:   {
    id: 'KZ1', b: 400, h: 400, main: '8C20', stirrup: 'A8@100/200(2)',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, height: 3000,
  },
  standard: {
    id: 'KZ2', b: 500, h: 500, main: '12C25', stirrup: 'A10@100/200(4)',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, height: 3000,
  },
} as const;

export const SLAB_PRESETS = {
  simple: {
    id: 'LB1', thickness: 120,
    bottomX: 'C10@150', bottomY: 'C10@200',
    topX: '', topY: '',
    distribution: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  standard: {
    id: 'LB2', thickness: 150,
    bottomX: 'C12@150', bottomY: 'C10@200',
    topX: 'C10@200', topY: 'C10@200',
    distribution: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  thick: {
    id: 'LB3', thickness: 200,
    bottomX: 'C14@150', bottomY: 'C12@150',
    topX: 'C12@200', topY: 'C10@200',
    distribution: 'A8@200',
    concreteGrade: 'C35' as const, cover: 20,
  },
} as const;

export const JOINT_PRESETS = {
  middleBent: {
    colB: 500, colH: 500, colMain: '12C25', colStirrup: 'A10@100/200(4)',
    beamB: 300, beamH: 600, beamTop: '4C25', beamBottom: '4C25', beamStirrup: 'A8@100/200(2)',
    jointType: 'middle' as const, anchorType: 'bent' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
  middleStraight: {
    colB: 600, colH: 600, colMain: '16C25', colStirrup: 'A10@100/200(4)',
    beamB: 300, beamH: 600, beamTop: '4C22', beamBottom: '4C22', beamStirrup: 'A8@100/200(2)',
    jointType: 'middle' as const, anchorType: 'straight' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
  side: {
    colB: 500, colH: 500, colMain: '12C25', colStirrup: 'A10@100/200(4)',
    beamB: 250, beamH: 500, beamTop: '3C25', beamBottom: '3C22', beamStirrup: 'A8@100/200(2)',
    jointType: 'side' as const, anchorType: 'bent' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
} as const;
