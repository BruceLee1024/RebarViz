import type { BeamParams, ColumnParams, ComponentType, FoundationParams, JointParams, PileCapParams, RaftFoundationParams, ShearWallParams, SlabParams, StairParams, StripFoundationParams } from './types';
import { beamSpans, centeredBox, measureSolid, foundationBeamLength, overhangs, raftSolids, stripSolids, wallOpening, wallSolids, stairMeasuredGeometry } from './quantity-geometry';

export interface ComponentParamsMap {
  beam: BeamParams; column: ColumnParams; slab: SlabParams; joint: JointParams; shearwall: ShearWallParams;
  stair: StairParams; foundation: FoundationParams; stripfoundation: StripFoundationParams; pilecap: PileCapParams; raft: RaftFoundationParams;
}
export interface FormworkOptions {
  beamSlabThickness: number;
  beamSlabSides: number;
  includeBeamEnds: boolean;
  includeSlabEdges: boolean;
  includeFoundationBottom: boolean;
  includeSlopedFaces: boolean;
  deductionArea: number;
}
export const DEFAULT_FORMWORK_OPTIONS: FormworkOptions = {
  beamSlabThickness: 0, beamSlabSides: 0, includeBeamEnds: false, includeSlabEdges: false,
  includeFoundationBottom: false, includeSlopedFaces: false, deductionArea: 0,
};
export interface FormworkItem { name: string; area: number; formula: string; detail: string }
export interface FormworkResult { items: FormworkItem[]; grossArea: number; deductionArea: number; totalArea: number; notes: string[] }

/** Contact-area estimate for the represented component. Connections missing from the model are explicit options. */
export function calcFormwork<T extends ComponentType>(type: T, params: ComponentParamsMap[T], options: Partial<FormworkOptions> = {}): FormworkResult {
  const o = { ...DEFAULT_FORMWORK_OPTIONS, ...options }, items: FormworkItem[] = [], notes: string[] = [];
  const add = (name: string, area: number, formula: string, detail = '') => {
    if (Number.isFinite(area) && area > 1e-10) items.push({ name, area, formula, detail });
  };
  const foundationFaces = (boxes: ReturnType<typeof raftSolids>) => {
    const solid = measureSolid(boxes);
    add('外露竖向侧模', solid.sides, '构件并集的竖向外表面积', '相交梁、板、支承之间的内部接触面不计');
    if (o.includeFoundationBottom) add('底模', solid.bottom, '构件并集的向下外表面积');
    notes.push(o.includeFoundationBottom ? '底面按实际支模计入。' : '底面默认落在垫层上，不计底模；土胎或砖胎侧面可在扣减面积中调整。');
  };
  switch (type) {
    case 'beam': {
      const p = params as BeamParams, spans = beamSpans(p);
      for (const [i, s] of spans.entries()) {
        const prefix = `第${i + 1}跨`;
        const slabSides = Math.max(0, Math.min(2, o.beamSlabSides));
        const contactHeight = 2 * s.h - slabSides * Math.max(0, Math.min(s.h, o.beamSlabThickness));
        add(`${prefix}底模`, s.b * s.l / 1e6, 'b × L净', `${s.b} × ${s.l} ÷ 10⁶`);
        add(`${prefix}侧模`, contactHeight * s.l / 1e6, '(2h − 接板侧数 × 板厚) × L净', `(${2 * s.h} − ${slabSides} × ${Math.min(s.h, o.beamSlabThickness)}) × ${s.l} ÷ 10⁶`);
        if (p.haunchType !== 'none' && p.haunchLength > 0 && p.haunchHeight > 0) {
          const ends = p.haunchSide === 'both' ? 2 : 1, l = p.haunchLength, dh = p.haunchHeight, slope = Math.hypot(l, dh);
          if (p.haunchType === 'vertical') {
            add(`${prefix}竖向加腋侧模增量`, ends * l * dh / 1e6, '端数 × 2 × ½ × 加腋长 × 加腋高');
            add(`${prefix}加腋底模增量`, ends * s.b * (slope - l) / 1e6, '端数 × b × (斜长 − 水平长)');
          } else {
            add(`${prefix}水平加腋底模增量`, ends * l * dh / 1e6, '端数 × 2 × ½ × 加腋长 × 单侧加宽');
            add(`${prefix}加腋侧模增量`, ends * contactHeight * (slope - l) / 1e6, '端数 × 外露侧模高度合计 × (斜长 − 水平长)');
          }
        }
      }
      if (o.includeBeamEnds) {
        const first = spans[0], last = spans[spans.length - 1];
        add('两端封头模板', (first.b * first.h + last.b * last.h) / 1e6, '首端 b×h + 末端 b×h', '仅用于两端确实需要独立封模的施工段；加腋端面需另行补充');
      }
      notes.push('按净跨计底模和侧模，柱支座及内部节点不计梁模板。', '接板侧数指实际与楼板相接、需要扣除板厚的梁侧；建筑边缘的外侧梁模保留全高。');
      break;
    }
    case 'column': {
      const p = params as ColumnParams, h = p.height || 3000, lower = p.hasVariableSection ? Math.max(0, Math.min(p.variableStart ?? h * .7, h)) : h;
      add('柱下段侧模', 2 * (p.b + p.h) * lower / 1e6, '2(b+h) × H下');
      if (lower < h) add('柱上段侧模', 2 * ((p.upperB || p.b) + (p.upperH || p.h)) * (h - lower) / 1e6, '2(b上+h上) × H上');
      notes.push('不计柱顶、柱底；梁板接触面和变截面斜过渡未提供完整连接尺寸，可按实际扣减。');
      break;
    }
    case 'slab': {
      const p = params as SlabParams;
      add('板底模', p.spanX * p.spanY / 1e6, 'Lx × Ly');
      if (o.includeSlabEdges) add('四周板边模', 2 * (p.spanX + p.spanY) * p.thickness / 1e6, '2(Lx+Ly) × t');
      notes.push('板底按输入平面范围计算；与梁、柱重叠或无需支模的边界由扣减面积调整。');
      break;
    }
    case 'shearwall': {
      const p = params as ShearWallParams, openings = wallOpening(p);
      const largeHoles = openings.filter(b => (b.x1 - b.x0) * (b.y1 - b.y0) > 300000);
      const solid = measureSolid(wallSolids(p), largeHoles);
      add('墙身、边缘构件及洞侧模板', solid.sides, '墙体并集竖向外表面积（扣大洞、计洞侧）');
      add('洞口顶面底模', largeHoles.reduce((sum, hole) => sum + (hole.y1 < p.hw ? (hole.x1 - hole.x0) * p.bw / 1e6 : 0), 0), '洞口宽 × 墙厚（洞顶有墙体）');
      notes.push('单洞面积大于 0.3m² 时扣洞并计洞侧；小洞不扣且不增洞侧。', '墙端按外露面计入，连接其他构件的墙端请在扣减面积中扣除；窗台上表面不计模板。');
      break;
    }
    case 'stair': {
      const p = params as StairParams, geometry=stairMeasuredGeometry(p), slope=geometry.netSlope;
      const flat = geometry.flat;
      add('梯段底模', slope * p.flightWidth / 1e6, '支座间净斜长 × 梯宽');
      add('平台与低端平板底模', (p.topPlatformLen + p.botPlatformLen + flat) * p.flightWidth / 1e6, '(上平台长+下平台长+低端平板长) × 梯宽');
      add('踏步踢面模板', geometry.stepTriangles * p.stepHeight * p.flightWidth / 1e6, '实绘踏步数 × 踏步高 × 梯宽（梁侧另计）');
      // Slope slab thickness is measured normal to the flight.
      add('梯段两侧模板', (2 * slope * p.slabThickness + geometry.stepTriangles * p.stepWidth * p.stepHeight + 2 * flat * p.slabThickness) / 1e6, '2 × 净斜长 × 板厚 + 实绘踏步数 × 踏步宽 × 踏步高 + 平板两侧');
      add('两端梯梁底模', 2 * geometry.beamWidth * p.flightWidth / 1e6, '2 × 实绘梯梁宽 × 梯宽');
      add('梯梁外露侧模', 4 * Math.max(0, p.beamH - Math.max(p.platformThickness, p.slabThickness)) * p.flightWidth / 1e6, '4 × max(梁高 − 相邻板厚, 0) × 梯宽');
      if (o.includeSlabEdges) add('平台外缘侧模', (2 * (p.topPlatformLen + p.botPlatformLen) + 2 * p.flightWidth) * p.platformThickness / 1e6, '平台两侧及两端周边 × 板厚');
      notes.push('梯段、平台和梯梁按独立净尺寸分项；平台若已包含梯梁投影，应扣除重复底模。', '梯段两侧及踢面按支模计算；靠墙侧不支模时按实际面积扣减。');
      break;
    }
    case 'foundation': {
      const p = params as FoundationParams;
      if (p.shape === 'stepped') {
        let height = 0;
        const boxes = p.stepDims.map(s => { const b = centeredBox(s.bx, s.h, s.by, 0, height + s.h / 2); height += s.h; return b; });
        if (p.hasFoundationBeam && p.columnCount === 2) {
          const [left, right] = overhangs(p.foundationBeamEndType, p.foundationBeamOverhangSide, p.foundationBeamOverhang ?? 300);
          const h = p.foundationBeamH || 700;
          boxes.push(centeredBox(foundationBeamLength(p), h, p.foundationBeamB || 600, (right-left)/2, p.h+h/2));
        }
        foundationFaces(boxes);
      } else {
        if (o.includeSlopedFaces) {
          const sx = Math.hypot(p.h, (p.bx - p.colBx) / 2), sy = Math.hypot(p.h, (p.by - p.colBy) / 2);
          add('锥形基础斜面模板', ((p.bx + p.colBx) * sy + (p.by + p.colBy) * sx) / 1e6, '(bx+顶宽) × Y向斜高 + (by+顶深) × X向斜高');
        }
        if (o.includeFoundationBottom) add('基础底模', p.bx * p.by / 1e6, 'bx × by');
        notes.push('斜面默认采用敞口浇筑，不计斜面模板；采用支模施工时勾选斜面模板。底面默认落在垫层上。');
      }
      if (p.shape !== 'stepped' && p.hasFoundationBeam && p.columnCount === 2) {
        const l = foundationBeamLength(p);
        add('基础梁两侧模', 2 * l * (p.foundationBeamH || 700) / 1e6, '2 × 含外伸梁长 × 梁高');
        add('基础梁端模', 2 * (p.foundationBeamB || 600) * (p.foundationBeamH || 700) / 1e6, '2 × 梁宽 × 梁高');
        notes.push('基础梁坐落于基础顶面，不另计梁底模；外伸悬空段的底模需按实际施工补充。');
      }
      break;
    }
    case 'stripfoundation': foundationFaces(stripSolids(params as StripFoundationParams)); break;
    case 'raft': foundationFaces(raftSolids(params as RaftFoundationParams)); break;
    case 'pilecap': {
      const p = params as PileCapParams;
      foundationFaces([centeredBox(p.bx, p.h, p.by)]);
      notes.push('仅计承台。桩的施工方法未指定，不将桩侧面自动计为模板；定位柱段不另计。');
      break;
    }
    case 'joint': notes.push('节点模板随相接梁、柱计算，不独立累计，避免重复计量。请在梁、柱页面查看模板工程量。'); break;
  }
  const grossArea = items.reduce((sum, item) => sum + item.area, 0);
  const deductionArea = Math.min(grossArea, Math.max(0, Number.isFinite(o.deductionArea) ? o.deductionArea : 0));
  return { items, grossArea, deductionArea, totalArea: grossArea - deductionArea, notes };
}
