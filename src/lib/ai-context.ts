/**
 * Build context strings from component params for AI assistant
 */
import type { BeamParams, ColumnParams, SlabParams, JointParams } from './types';
import { parseRebar, parseStirrup, gradeLabel } from './rebar';

export function buildBeamContext(p: BeamParams): string {
  const topR = parseRebar(p.top);
  const botR = parseRebar(p.bottom);
  const stir = parseStirrup(p.stirrup);
  return `构件类型: 框架梁 ${p.id}
截面: ${p.b}×${p.h}mm
上部通长筋: ${p.top} (${topR.count}根 ${gradeLabel(topR.grade)} Φ${topR.diameter})
下部通长筋: ${p.bottom} (${botR.count}根 ${gradeLabel(botR.grade)} Φ${botR.diameter})
箍筋: ${p.stirrup} (${gradeLabel(stir.grade)} Φ${stir.diameter} 加密${stir.spacingDense}/非加密${stir.spacingNormal} ${stir.legs}肢箍)
左支座负筋: ${p.leftSupport || '无'}
右支座负筋: ${p.rightSupport || '无'}
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}
保护层: ${p.cover}mm，梁净跨: ${p.spanLength}mm，柱宽 hc: ${p.hc}mm`;
}

export function buildColumnContext(p: ColumnParams): string {
  const mainR = parseRebar(p.main);
  const stir = parseStirrup(p.stirrup);
  return `构件类型: 框架柱 ${p.id}
截面: ${p.b}×${p.h}mm
纵筋: ${p.main} (${mainR.count}根 ${gradeLabel(mainR.grade)} Φ${mainR.diameter})
箍筋: ${p.stirrup} (${gradeLabel(stir.grade)} Φ${stir.diameter} 加密${stir.spacingDense}/非加密${stir.spacingNormal} ${stir.legs}肢箍)
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}
保护层: ${p.cover}mm，柱净高: ${p.height}mm`;
}

export function buildSlabContext(p: SlabParams): string {
  return `构件类型: 楼板 ${p.id}
板厚: ${p.thickness}mm
X向底筋: ${p.bottomX}，Y向底筋: ${p.bottomY}
X向面筋: ${p.topX || '无'}，Y向面筋: ${p.topY || '无'}
分布筋: ${p.distribution}
混凝土等级: ${p.concreteGrade}，保护层: ${p.cover}mm`;
}

export function buildJointContext(p: JointParams): string {
  const jointTypeLabel = { middle: '中间节点', side: '边节点', corner: '角节点' };
  return `构件类型: 梁柱节点 (${jointTypeLabel[p.jointType]})
柱截面: ${p.colB}×${p.colH}mm，柱纵筋: ${p.colMain}
梁截面: ${p.beamB}×${p.beamH}mm
梁上部筋: ${p.beamTop}，梁下部筋: ${p.beamBottom}
锚固方式: ${p.anchorType === 'bent' ? '弯锚' : '直锚'}
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}
保护层: ${p.cover}mm`;
}
