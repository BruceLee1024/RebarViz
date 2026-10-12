import { foundationBeamLength, beamSpans, measureSolid, raftSolids, stripSolids, wallSolids, wallOpening, stairMeasuredGeometry } from './quantity-geometry';
import type { FormulaStep } from './calc';
import type { BeamParams, ColumnParams, SlabParams, ShearWallParams, StairParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams } from './types';

// ═══════════════════════════════════════════════════════════════════
// 混凝土工程量 — 当前构件几何估算，连接边界以分项说明为准
// 核心原则: 不扣除钢筋所占体积
// ═══════════════════════════════════════════════════════════════════

export interface ConcreteCalcItem {
  name: string;           // 如 "梁体"、"踏步"、"平台板"
  volume: number;         // m³
  description: string;    // 描述
  formulaSteps: FormulaStep[];
  color: string;
}

export interface ConcreteCalcResult {
  items: ConcreteCalcItem[];
  totalVolume: number;    // 总体积 m³
  notes?: string[];
}

function concreteItem(name: string, volume: number, formula: string, substitution: string): ConcreteCalcItem {
  return { name, volume, description: substitution, color: '#22b8cf', formulaSteps: [{ label: name, formula, substitution, result: volume.toFixed(4) + ' m³' }] };
}
function concreteResult(items: ConcreteCalcItem[], notes: string[] = []): ConcreteCalcResult {
  return { items, notes, totalVolume: items.reduce((sum, item) => sum + item.volume, 0) };
}

// ─── 梁混凝土 ───
// 梁体按净跨计算，梁柱节点归柱，避免跨构件重复计量。
// 含加腋增量; 不扣钢筋
export function calcBeamConcrete(p: BeamParams): ConcreteCalcResult {
  const items: ConcreteCalcItem[] = [];
  const spans = beamSpans(p);
  for (const [i, span] of spans.entries()) {
    items.push(concreteItem('第' + (i + 1) + '跨梁体', span.b * span.h * span.l / 1e9, 'b × h × 净跨', span.b + ' × ' + span.h + ' × ' + span.l + ' ÷ 10⁹'));
    if (p.haunchType !== 'none' && p.haunchLength > 0 && p.haunchHeight > 0) {
      const ends = p.haunchSide === 'both' ? 2 : 1;
      const width = p.haunchType === 'vertical' ? span.b : 2 * span.h;
      items.push(concreteItem('第' + (i + 1) + '跨加腋', ends * .5 * p.haunchLength * p.haunchHeight * width / 1e9,
        '端数 × ½ × 加腋长 × 单侧增量 × ' + (p.haunchType === 'vertical' ? '梁宽' : '2 × 梁高'), ends + ' × 0.5 × ' + p.haunchLength + ' × ' + p.haunchHeight + ' × ' + width + ' ÷ 10⁹'));
    }
  }
  return concreteResult(items, ['按各跨净长计算，梁柱交接节点归柱；水平加腋按梁两侧同时加宽。']);
}

// ─── 柱混凝土 ───
// 清单规范: 柱体积 = 截面面积 × 柱净高 (含柱头到板底)
// 梁柱节点体积归柱; 不扣钢筋
export function calcColumnConcrete(p: ColumnParams): ConcreteCalcResult {
  const height = p.height || 3000;
  const lowH = p.hasVariableSection ? Math.max(0, Math.min(p.variableStart ?? height * .7, height)) : height;
  const items = [concreteItem('柱下段', p.b * p.h * lowH / 1e9, 'b × h × H', p.b + ' × ' + p.h + ' × ' + lowH + ' ÷ 10⁹')];
  if (lowH < height) items.push(concreteItem('柱上段', (p.upperB || p.b) * (p.upperH || p.h) * (height - lowH) / 1e9, 'b上 × h上 × H上', (p.upperB || p.b) + ' × ' + (p.upperH || p.h) + ' × ' + (height - lowH) + ' ÷ 10⁹'));
  return concreteResult(items, ['按输入柱段高度计算；示意的柱顶梁板、柱根支座未另计。']);
}

// ─── 板混凝土 ───
// 清单规范: 板体积 = 板面积 × 板厚 (扣柱/梁面积, 本项目暂不扣)
// 不扣钢筋
export function calcSlabConcrete(p: SlabParams): ConcreteCalcResult {
  const slabW = p.spanX;
  const slabD = p.spanY;
  const thickness = p.thickness;
  const area = slabW * slabD; // mm²

  const vol = (slabW / 1000) * (slabD / 1000) * (thickness / 1000);
  const steps: FormulaStep[] = [
    { label: '板面尺寸', formula: 'W × D', substitution: `= ${slabW} × ${slabD}`, result: `= ${(area / 1e6).toFixed(2)} m²` },
    { label: '板厚', formula: 't', substitution: `= ${thickness}`, result: `= ${thickness} mm` },
    { label: '板体积', formula: 'V = W × D × t', substitution: `= ${slabW/1000} × ${slabD/1000} × ${thickness/1000}`, result: `= ${vol.toFixed(4)} m³` },
  ];

  return {
    items: [{ name: '板体', volume: vol, description: `${slabW}×${slabD}mm × 厚${thickness}mm`, formulaSteps: steps, color: '#3B82F6' }],
    totalVolume: vol,
  };
}

// ─── 剪力墙混凝土 ───
// 清单规范: 墙体积 = 墙长 × 墙高 × 墙厚 (扣门窗洞口, 本项目暂无洞口)
// 不扣钢筋
export function calcShearWallConcrete(p: ShearWallParams): ConcreteCalcResult {
  const boxes = wallSolids(p), holes = wallOpening(p);
  const main = measureSolid(boxes.slice(0, 1), holes).volume;
  const total = measureSolid(boxes, holes).volume;
  const items = [concreteItem('墙身（扣洞口）', main, '墙体 − 洞口', p.lw + ' × ' + p.hw + ' × ' + p.bw + ' mm，按洞口与墙体实际交集扣除')];
  if (total > main) items.push(concreteItem('边缘构件净增量', total - main, '墙体与边缘构件并集 − 墙身', '重叠部分仅计一次'));
  return concreteResult(items, ['暗柱包含在墙体内，不重复增加体积；凸出边缘构件按当前模型形状并集计算。']);
}

// ─── 楼梯混凝土 ───
// 清单规范: 按设计图示尺寸以体积计算, 含梯段板+踏步+平台板+梯梁
// 梯段板: 斜面板体积 = 斜板长 × 梯段宽 × 板厚
// 踏步: 三角形截面 = 0.5 × 踏步宽 × 踏步高 × 梯段宽 × (n-2) 个 (首末踏步含在梯梁中)
// 平台板: 长 × 宽 × 厚
// 梯梁: b × h × 梯段宽
export function calcStairConcrete(p: StairParams): ConcreteCalcResult {
  const geometry=stairMeasuredGeometry(p);
  const items: ConcreteCalcItem[] = [];
  const n = p.stepCount;
  const hMM = p.stepHeight;
  const bMM = p.stepWidth;
  const tMM = p.slabThickness;
  const wMM = p.flightWidth;
  const topPlatMM = p.topPlatformLen;
  const botPlatMM = p.botPlatformLen;
  const platTMM = p.platformThickness;
  const beamBMM = geometry.beamWidth;
  const beamHMM = p.beamH;
  const isBT = p.stairType === 'BT';
  const botFlatLenMM = isBT ? (p.botFlatLen ?? 700) : 0;

  const totalRise = n * hMM;
  const totalRun = n * bMM;
  const slopeLen = geometry.netSlope;

  // 1. 梯段斜板
  const slabVol = (slopeLen / 1000) * (wMM / 1000) * (tMM / 1000);
  const slabSteps: FormulaStep[] = [
    { label: '支座之间净斜长', formula: 'L净 = 净水平投影 × √(总高² + 总进深²) / 总进深', substitution: `= ${geometry.netRun} × √(${totalRise}² + ${totalRun}²) / ${totalRun}`, result: `= ${Math.round(slopeLen)} mm` },
    { label: '梯段板体积', formula: 'V = L × w × t', substitution: `= ${(slopeLen/1000).toFixed(3)} × ${wMM/1000} × ${tMM/1000}`, result: `= ${slabVol.toFixed(4)} m³` },
  ];
  items.push({ name: '梯段斜板', volume: slabVol, description: `斜长${Math.round(slopeLen)}mm × 宽${wMM}mm × 厚${tMM}mm`, formulaSteps: slabSteps, color: '#3B82F6' });

  // BT型专属: 低端平板
  if (isBT && botFlatLenMM > 0) {
    const flatVol = (botFlatLenMM / 1000) * (wMM / 1000) * (tMM / 1000);
    const flatSteps: FormulaStep[] = [
      { label: '低端平板体积', formula: 'V = L_flat × w × t', substitution: `= ${botFlatLenMM/1000} × ${wMM/1000} × ${tMM/1000}`, result: `= ${flatVol.toFixed(4)} m³` },
    ];
    items.push({ name: '低端平板', volume: flatVol, description: `${botFlatLenMM}×${wMM}×${tMM}mm (BT型梯板平板段)`, formulaSteps: flatSteps, color: '#38BDF8' });
  }

  // AT omits both support steps; BT omits only the final support step, as rendered.
  const omittedSteps = isBT ? 1 : 2;
  const stepCount = Math.max(n - omittedSteps, 0);
  const stepVol = stepCount * 0.5 * (bMM / 1000) * (hMM / 1000) * (wMM / 1000);
  const stepSteps: FormulaStep[] = [
    { label: '实绘踏步三角体数', formula: `n_step = n - ${omittedSteps}`, substitution: `= ${n} - ${omittedSteps}`, result: `= ${stepCount}` },
    { label: '单个踏步体积', formula: 'V₁ = 0.5 × b × h × w', substitution: `= 0.5 × ${bMM/1000} × ${hMM/1000} × ${wMM/1000}`, result: `= ${(0.5 * bMM / 1000 * hMM / 1000 * wMM / 1000).toFixed(4)} m³` },
    { label: '踏步总体积', formula: 'V = V₁ × n_step', substitution: `= ${(0.5 * bMM / 1000 * hMM / 1000 * wMM / 1000).toFixed(4)} × ${stepCount}`, result: `= ${stepVol.toFixed(4)} m³` },
  ];
  items.push({ name: '踏步', volume: stepVol, description: `${stepCount}个 × ${bMM}×${hMM}mm三角形`, formulaSteps: stepSteps, color: '#60A5FA' });

  // 3. 下平台板 (AT型: 独立平台; BT型: 梯梁外侧平台板)
  const botPlatVol = (botPlatMM / 1000) * (wMM / 1000) * (platTMM / 1000);
  const botPlatSteps: FormulaStep[] = [
    { label: isBT ? '低端梯梁外平台板体积' : '下平台板体积', formula: 'V = L × w × t', substitution: `= ${botPlatMM/1000} × ${wMM/1000} × ${platTMM/1000}`, result: `= ${botPlatVol.toFixed(4)} m³` },
  ];
  items.push({ name: isBT ? '低端平台板' : '下平台板', volume: botPlatVol, description: `${botPlatMM}×${wMM}×${platTMM}mm`, formulaSteps: botPlatSteps, color: '#93C5FD' });

  // 4. 上平台板
  const topPlatVol = (topPlatMM / 1000) * (wMM / 1000) * (platTMM / 1000);
  const topPlatSteps: FormulaStep[] = [
    { label: '上平台板体积', formula: 'V = L × w × t', substitution: `= ${topPlatMM/1000} × ${wMM/1000} × ${platTMM/1000}`, result: `= ${topPlatVol.toFixed(4)} m³` },
  ];
  items.push({ name: '上平台板', volume: topPlatVol, description: `${topPlatMM}×${wMM}×${platTMM}mm`, formulaSteps: topPlatSteps, color: '#93C5FD' });

  // 5. 低端梯梁
  const botBeamVol = (beamBMM / 1000) * (beamHMM / 1000) * (wMM / 1000);
  const botBeamSteps: FormulaStep[] = [
    { label: '低端梯梁体积', formula: 'V = b × h × w', substitution: `= ${beamBMM/1000} × ${beamHMM/1000} × ${wMM/1000}`, result: `= ${botBeamVol.toFixed(4)} m³` },
  ];
  items.push({ name: '低端梯梁', volume: botBeamVol, description: `${beamBMM}×${beamHMM}mm × 长${wMM}mm`, formulaSteps: botBeamSteps, color: '#A78BFA' });

  // 6. 高端梯梁
  const topBeamVol = (beamBMM / 1000) * (beamHMM / 1000) * (wMM / 1000);
  const topBeamSteps: FormulaStep[] = [
    { label: '高端梯梁体积', formula: 'V = b × h × w', substitution: `= ${beamBMM/1000} × ${beamHMM/1000} × ${wMM/1000}`, result: `= ${topBeamVol.toFixed(4)} m³` },
  ];
  items.push({ name: '高端梯梁', volume: topBeamVol, description: `${beamBMM}×${beamHMM}mm × 长${wMM}mm`, formulaSteps: topBeamSteps, color: '#A78BFA' });

  const totalVolume = items.reduce((s, it) => s + it.volume, 0);
  return { items, totalVolume, notes:['斜板仅计梯梁内侧之间的净段；AT模型梯梁宽度取首末踏步宽，BT取输入梯梁宽。梯梁用于示意的两侧外伸未另计。','平台按输入的独立板长计量；端部节点、施工缝及尚未建模的重叠部分需按实际详图核对。'] };
}

// ═══════════════════════════════════════════════════════════════════
// 条形基础 (TJ) — 混凝土工程量
// ═══════════════════════════════════════════════════════════════════

export function calcStripFoundationConcrete(p: StripFoundationParams): ConcreteCalcResult {
  const boxes = stripSolids(p), base = measureSolid(boxes.slice(0, 1)).volume, total = measureSolid(boxes).volume;
  return concreteResult([
    concreteItem('条基底板', base, 'L × B × H', p.length + ' × ' + p.width + ' × ' + p.h + ' ÷ 10⁹'),
    concreteItem('支承与次梁净增量', total - base, '构件并集 − 底板', '包含外伸段，主次梁交叉体积仅计一次'),
  ], ['主次梁按当前位置和外伸参数计算，交叠部分已扣除；示意加强区不另计混凝土。']);
}

// ═══════════════════════════════════════════════════════════════════
// 独立基础 (DJ) — 混凝土工程量
// ═══════════════════════════════════════════════════════════════════

export function calcFoundationConcrete(p: FoundationParams): ConcreteCalcResult {
  const items: ConcreteCalcItem[] = [];

  if (p.shape === 'stepped') {
    // 阶形基础: 各阶体积之和
    for (let i = 0; i < p.stepDims.length; i++) {
      const s = p.stepDims[i];
      const vol = (s.bx / 1000) * (s.by / 1000) * (s.h / 1000);
      const steps: FormulaStep[] = [
        { label: `第${i + 1}阶体积`, formula: 'V = bx × by × h', substitution: `= ${s.bx/1000} × ${s.by/1000} × ${s.h/1000}`, result: `= ${vol.toFixed(4)} m³` },
      ];
      items.push({ name: `第${i + 1}阶`, volume: vol, description: `${s.bx}×${s.by}×${s.h}mm`, formulaSteps: steps, color: i === 0 ? '#94A3B8' : '#CBD5E1' });
    }
  } else {
    // 锥形基础: V = h/6 × (A_bottom + 4 A_mid + A_top)
    const aBot = (p.bx / 1000) * (p.by / 1000);
    const aTop = (p.colBx / 1000) * (p.colBy / 1000);
    const hM = p.h / 1000;
    const midArea = ((p.bx + p.colBx) / 2000) * ((p.by + p.colBy) / 2000);
    const vol = (hM / 6) * (aBot + 4 * midArea + aTop);
    const steps: FormulaStep[] = [
      { label: '底面积', formula: 'A底 = bx × by', substitution: `= ${p.bx/1000} × ${p.by/1000}`, result: `= ${aBot.toFixed(4)} m²` },
      { label: '顶面积', formula: 'A顶 = colBx × colBy', substitution: `= ${p.colBx/1000} × ${p.colBy/1000}`, result: `= ${aTop.toFixed(4)} m²` },
      { label: '棱台体积', formula: 'V = h/6 × (A底 + 4A中 + A顶)', substitution: `= ${hM}/6 × (${aBot.toFixed(4)} + 4 × ${midArea.toFixed(4)} + ${aTop.toFixed(4)})`, result: `= ${vol.toFixed(4)} m³` },
    ];
    items.push({ name: '锥形基础', volume: vol, description: `底${p.bx}×${p.by}mm → 顶${p.colBx}×${p.colBy}mm，高${p.h}mm`, formulaSteps: steps, color: '#94A3B8' });
  }

  if (p.columnCount === 2 && p.hasFoundationBeam) {
    const l = foundationBeamLength(p), b = p.foundationBeamB || 600, h = p.foundationBeamH || 700;
    items.push(concreteItem('基础梁', l * b * h / 1e9, '含外伸梁长 × 梁宽 × 梁高', `${l} × ${b} × ${h} ÷ 10⁹`));
  }

  const total = items.reduce((s, it) => s + it.volume, 0);
  return { items, totalVolume: total };
}

// ═══════════════════════════════════════════════════════════════════
// 承台 (CT) — 混凝土工程量
// ═══════════════════════════════════════════════════════════════════

export function calcPileCapConcrete(p: PileCapParams): ConcreteCalcResult {
  const items: ConcreteCalcItem[] = [];

  // 承台体积 = bx × by × h
  const bxM = p.bx / 1000;
  const byM = p.by / 1000;
  const hM = p.h / 1000;
  const capVol = bxM * byM * hM;
  const capSteps: FormulaStep[] = [
    { label: '承台体积', formula: 'V = bx × by × h', substitution: `= ${bxM} × ${byM} × ${hM}`, result: `= ${capVol.toFixed(4)} m³` },
  ];
  items.push({ name: '承台', volume: capVol, description: `${p.bx}×${p.by}×${p.h}mm`, formulaSteps: capSteps, color: '#94A3B8' });

  // 桩体积 = n × π/4 × d² × L
  const dM = p.pileDiameter / 1000;
  const lM = p.pileLength / 1000;
  const singlePileVol = Math.PI / 4 * dM * dM * lM;
  const totalPileVol = p.pileCount * singlePileVol;
  const pileSteps: FormulaStep[] = [
    { label: '单桩体积', formula: 'V桩 = π/4 × d² × L', substitution: `= π/4 × ${dM}² × ${lM}`, result: `= ${singlePileVol.toFixed(4)} m³` },
    { label: '桩总体积', formula: 'V总 = n × V桩', substitution: `= ${p.pileCount} × ${singlePileVol.toFixed(4)}`, result: `= ${totalPileVol.toFixed(4)} m³` },
  ];
  items.push({ name: `桩基 (${p.pileCount}根)`, volume: totalPileVol, description: `Φ${p.pileDiameter}mm × ${p.pileLength}mm`, formulaSteps: pileSteps, color: '#7F8C8D' });

  const total = items.reduce((s, it) => s + it.volume, 0);
  return { items, totalVolume: total };
}

// ═══════════════════════════════════════════════════════════════════
// 筏板基础 (FB) — 混凝土工程量
// ═══════════════════════════════════════════════════════════════════

export function calcRaftConcrete(p: RaftFoundationParams): ConcreteCalcResult {
  const base = p.lx * p.ly * p.h / 1e9, total = measureSolid(raftSolids(p)).volume;
  const items = [concreteItem('筏板', base, 'Lx × Ly × h', p.lx + ' × ' + p.ly + ' × ' + p.h + ' ÷ 10⁹')];
  if (p.raftType === 'beamSlab') items.push(concreteItem('基础梁净增量', total - base, '梁板并集 − 筏板', '扣除梁板重叠和纵横梁交叉部分'));
  return concreteResult(items, ['柱插筋的混凝土柱段仅作定位示意，未计入基础工程量。']);
}
