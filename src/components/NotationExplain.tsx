'use client';

import { useState } from 'react';
import type { BeamParams, ColumnParams, SlabParams, ShearWallParams, StairParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams } from '@/lib/types';
import { parseRebar, parseStirrup, parseSlabRebar, parseSideBar, gradeLabel, resolveColumnBars } from '@/lib/rebar';
import { calcAnchorAll, calcSupportRebarLength, calcSlabBottomAnchor, calcColumnLapZone, calcLaE, calcLlE, calcBendLength, calcBeamEndAnchor, calcBottomBarLapAtMiddleJoint } from '@/lib/anchor';
import { determineColFoundAnchor, slabBottomAnchorDetail, slabNegBarExtend, slabNegBarBend, slabNegBarAnchorAtSupport, cantileverSlabTopBar, SLAB_DIST_LAP_LENGTH, rebarArea } from '@/lib/construction-rules';
import { getFoundationKnowledge } from '@/lib/foundation-knowledge';
import { calcLa } from '@/lib/anchor';

function ExplainSection({ title, defaultOpen = false, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-100 pt-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-1 cursor-pointer"
        type="button"
      >
        <span className="text-xs font-medium text-gray-500">{title}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-2 pt-1 pb-1">{children}</div>}
    </div>
  );
}

function PageBadge({ page }: { page: string }) {
  return (
    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
      {page}
    </span>
  );
}

function FoundationPageIndexSection({ componentType }: { componentType: 'foundation' | 'stripfoundation' | 'pilecap' | 'raft' }) {
  const knowledge = getFoundationKnowledge(componentType);
  if (!knowledge) return null;

  return (
    <ExplainSection title="22G101-3 页码速查">
      <div className="space-y-2">
        {knowledge.pageIndex.map(item => (
          <div key={`${item.title}-${item.page}`} className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-slate-700">{item.title}</p>
              <PageBadge page={item.page} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.note}</p>
          </div>
        ))}
      </div>
    </ExplainSection>
  );
}

function FoundationNotationGuideSection({ componentType }: { componentType: 'foundation' | 'stripfoundation' | 'pilecap' | 'raft' }) {
  const knowledge = getFoundationKnowledge(componentType);
  if (!knowledge?.notationGuides?.length) return null;

  return (
    <ExplainSection title="图纸表达与识图">
      <div className="space-y-2">
        {knowledge.notationGuides.map(item => (
          <div key={`${item.text}-${item.page}`} className="rounded-lg bg-emerald-50 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-relaxed text-emerald-800">{item.text}</p>
              <PageBadge page={item.page} />
            </div>
          </div>
        ))}
      </div>
    </ExplainSection>
  );
}

function FoundationDrawingChecklistSection({ componentType }: { componentType: 'foundation' | 'stripfoundation' | 'pilecap' | 'raft' }) {
  const knowledge = getFoundationKnowledge(componentType);
  if (!knowledge?.drawingChecklist?.length) return null;

  return (
    <ExplainSection title="出图检查">
      <div className="rounded-lg bg-slate-50 p-3">
        <ul className="space-y-2 text-xs text-slate-700">
          {knowledge.drawingChecklist.map(item => (
            <li key={`${item.text}-${item.page}`} className="flex items-start justify-between gap-3">
              <span className="leading-relaxed">{item.text}</span>
              <PageBadge page={item.page} />
            </li>
          ))}
        </ul>
      </div>
    </ExplainSection>
  );
}

function FoundationDesignNotesSection({ componentType }: { componentType: 'foundation' | 'stripfoundation' | 'pilecap' | 'raft' }) {
  const knowledge = getFoundationKnowledge(componentType);
  if (!knowledge) return null;

  return (
    <ExplainSection title="设计提示">
      <div className="space-y-2">
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">设计需写明</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            {knowledge.mustSpecify.map(item => (
              <li key={`${item.text}-${item.page}`}>
                {item.text}
                <span className="text-amber-600">（{item.page}）</span>
              </li>
            ))}
          </ul>
        </div>
        {!!knowledge.defaultsWhenOmitted?.length && (
          <div className="rounded-lg bg-sky-50 p-3">
            <p className="text-xs font-medium text-sky-800">未注明时的默认 / 可选做法</p>
            <ul className="mt-1.5 space-y-1 text-xs text-sky-700 list-disc list-inside">
              {knowledge.defaultsWhenOmitted.map(item => (
                <li key={`${item.text}-${item.page}`}>
                  {item.text}
                  <span className="text-sky-600">（{item.page}）</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ExplainSection>
  );
}

function FoundationRelatedDetailSection({ componentType }: { componentType: 'foundation' | 'stripfoundation' | 'pilecap' | 'raft' }) {
  const knowledge = getFoundationKnowledge(componentType);
  if (!knowledge?.relatedDetails?.length) return null;

  return (
    <ExplainSection title="相关扩展构造">
      <div className="space-y-2">
        {knowledge.relatedDetails.map(item => (
          <div key={`${item.title}-${item.page}`} className="rounded-lg bg-violet-50 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-violet-800">{item.title}</p>
              <PageBadge page={item.page} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-violet-700">{item.note}</p>
          </div>
        ))}
      </div>
    </ExplainSection>
  );
}

export function BeamExplain({ params }: { params: BeamParams }) {
  const topR = parseRebar(params.top);
  const botR = parseRebar(params.bottom);
  const stir = parseStirrup(params.stirrup);
  const leftR = params.leftSupport ? parseRebar(params.leftSupport) : null;
  const rightR = params.rightSupport ? parseRebar(params.rightSupport) : null;
  const anchorTop = calcAnchorAll(topR.grade, topR.diameter, params.concreteGrade, params.seismicGrade);
  const anchorBot = calcAnchorAll(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade);
  const supportLen = calcSupportRebarLength(params.spanLength || 4000);
  const supportLen2 = calcSupportRebarLength(params.spanLength || 4000, 2);

  const hc = params.hc || 500;
  const cover = params.cover || 25;
  const topEndAnchor = calcBeamEndAnchor(topR.grade, topR.diameter, params.concreteGrade, params.seismicGrade, hc, cover);
  const botEndAnchor = calcBeamEndAnchor(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, hc, cover);
  const denseZone = Math.max(2 * params.h, 500);
  const midJointLap = calcBottomBarLapAtMiddleJoint(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, params.h, cover);

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">框架梁，括号内数字表示跨数</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">截面: {params.b}×{params.h}mm</p>
        <p className="text-xs text-muted mt-1">宽 {params.b}mm，高 {params.h}mm，柱宽 hc={hc}mm</p>
      </div>

      <ExplainSection title="集中标注" defaultOpen>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">上部通长筋: {params.top}</p>
          <p className="text-xs text-red-600 mt-1">
            {topR.segments
              ? topR.segments.map((seg, i) => `${i === 0 ? '外排' : `第${i+1}排`}: ${seg.count}根 ${gradeLabel(seg.grade)} Φ${seg.diameter}`).join('，')
              : `${topR.count} 根 ${gradeLabel(topR.grade)} Φ${topR.diameter}`}
          </p>
          {topR.segments && <p className="text-xs text-red-500 mt-0.5">22G101: 混合直径时，大直径钢筋放外排(靠截面边缘)，小直径放内排</p>}
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">下部通长筋: {params.bottom}</p>
          <p className="text-xs text-red-600 mt-1">
            {botR.segments
              ? botR.segments.map((seg, i) => `${i === 0 ? '外排' : `第${i+1}排`}: ${seg.count}根 ${gradeLabel(seg.grade)} Φ${seg.diameter}`).join('，')
              : `${botR.count} 根 ${gradeLabel(botR.grade)} Φ${botR.diameter}`}
          </p>
          {botR.segments && <p className="text-xs text-red-500 mt-0.5">22G101: 不同直径钢筋以&quot;+&quot;连接，如 2C25+2C22</p>}
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">箍筋: {params.stirrup}</p>
          <p className="text-xs text-green-600 mt-1">
            {gradeLabel(stir.grade)} Φ{stir.diameter}，加密区 {stir.spacingDense}mm，非加密区 {stir.spacingNormal}mm，{stir.legs} 肢箍
          </p>
          <p className="text-xs text-green-600 mt-0.5">加密区长度: max(2h, 500) = {denseZone}mm</p>
        </div>
      </ExplainSection>

      {params.sideBar && (() => {
        const sideInfo = parseSideBar(params.sideBar);
        if (!sideInfo) return null;
        const perSide = Math.ceil(sideInfo.count / 2);
        const prefixLabel = sideInfo.prefix === 'G' ? '构造腰筋' : '抗扭筋';
        return (
          <ExplainSection title="腰筋/抗扭筋" defaultOpen>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-800">{prefixLabel}: {params.sideBar}</p>
              <p className="text-xs text-blue-600 mt-1">
                {sideInfo.count} 根(每侧{perSide}根) {gradeLabel(sideInfo.grade)} Φ{sideInfo.diameter}，分布在梁两侧面
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                {sideInfo.prefix === 'G'
                  ? '22G101: 梁腹高 h ≥ 450mm 时需设构造腰筋，间距 ≤ 200mm'
                  : '22G101: 抗扭筋用于承担扭矩，计入抗扭计算'
                }
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                拉筋: {params.tieBar || 'A6(自动)'}，22G101: b≤350mm→A6，b&gt;350mm→同箍筋规格
              </p>
            </div>
          </ExplainSection>
        );
      })()}

      {(leftR || rightR) && (
        <ExplainSection title="原位标注">
          {leftR && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="font-medium text-purple-800">左支座负筋: {params.leftSupport}</p>
              <p className="text-xs text-purple-600 mt-1">{leftR.count} 根 {gradeLabel(leftR.grade)} Φ{leftR.diameter}，从支座伸入跨内</p>
              <p className="text-xs text-purple-600 mt-0.5">第一排: ln/3 = {supportLen}mm，第二排: ln/4 = {supportLen2}mm</p>
            </div>
          )}
          {rightR && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="font-medium text-purple-800">右支座负筋: {params.rightSupport}</p>
              <p className="text-xs text-purple-600 mt-1">{rightR.count} 根 {gradeLabel(rightR.grade)} Φ{rightR.diameter}，从支座伸入跨内</p>
              <p className="text-xs text-purple-600 mt-0.5">第一排: ln/3 = {supportLen}mm，第二排: ln/4 = {supportLen2}mm</p>
            </div>
          )}
        </ExplainSection>
      )}

      <ExplainSection title="端支座锚固">
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">22G101 端支座锚固 ({params.concreteGrade}, {params.seismicGrade})</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p className="font-medium">上部筋 Φ{topR.diameter} (laE={anchorTop.laE}mm):</p>
            {topEndAnchor.canStraight ? (
              <p className="ml-2">✓ 直锚: laE={anchorTop.laE}mm ≤ hc-c={hc - cover}mm → 直锚长度 max(laE, 0.5hc+5d) = {topEndAnchor.straightLen}mm</p>
            ) : (
              <>
                <p className="ml-2">✗ 直锚不满足: laE={anchorTop.laE}mm {'>'} hc-c={hc - cover}mm</p>
                <p className="ml-2">→ 弯锚: 直段 ≥ 0.4laE = {topEndAnchor.bentStraightPart}mm，弯折 15d = {topEndAnchor.bentBendPart}mm</p>
              </>
            )}
            <p className="font-medium mt-1">下部筋 Φ{botR.diameter} (laE={anchorBot.laE}mm):</p>
            {botEndAnchor.canStraight ? (
              <p className="ml-2">✓ 直锚: laE={anchorBot.laE}mm ≤ hc-c={hc - cover}mm → 直锚长度 {botEndAnchor.straightLen}mm</p>
            ) : (
              <>
                <p className="ml-2">✗ 直锚不满足: laE={anchorBot.laE}mm {'>'} hc-c={hc - cover}mm</p>
                <p className="ml-2">→ 弯锚: 直段 {botEndAnchor.bentStraightPart}mm，弯折 15d = {botEndAnchor.bentBendPart}mm</p>
              </>
            )}
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="连接与搭接">
        <div className="p-3 bg-teal-50 rounded-lg">
          <p className="font-medium text-teal-800">22G101 连接与搭接</p>
          <div className="mt-1.5 space-y-1 text-xs text-teal-700">
            <p>上部筋连接位置: 跨中 ln/3 范围内</p>
            <p>下部筋连接位置: 支座 ln/3 范围内</p>
            <p>搭接面积百分率 ≤ 50%</p>
            <p>搭接长度 llE = {anchorTop.llE}mm</p>
            <p>中间节点下部筋搭接: ≥ max(llE, 1.5h₀) = {midJointLap}mm</p>
            <p>架立筋与非贯通筋搭接 ≥ 150mm</p>
          </div>
        </div>
      </ExplainSection>

      {params.haunchType && params.haunchType !== 'none' && (
        <ExplainSection title="加腋构造 (22G101 2-36)" defaultOpen>
          <div className="p-3 bg-orange-50 rounded-lg">
            <p className="font-medium text-orange-800">
              {params.haunchType === 'horizontal' ? '水平加腋' : '竖向加腋'}
              {' · '}{params.haunchSide === 'both' ? '两端' : params.haunchSide === 'left' ? '左端' : '右端'}
            </p>
            <div className="mt-1.5 space-y-1 text-xs text-orange-700">
              <p>加腋长度 c₁ = {params.haunchLength}mm</p>
              <p>{params.haunchType === 'horizontal' ? '单侧加腋宽度' : '加腋高度'} c₂ = {params.haunchHeight}mm</p>
              {params.haunchType === 'vertical' && (() => {
                const botR = parseRebar(params.bottom);
                const laE = calcLaE(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade);
                const h0 = params.h - (params.cover || 25) - botR.diameter / 2;
                const hbCoeff = params.seismicGrade === '一级' ? 2.0 : 1.5;
                const denseZone1 = Math.max(hbCoeff * params.h, 500, params.haunchLength + 0.5 * h0);
                return (
                  <>
                    <p className="font-medium mt-1.5">附加筋:</p>
                    <p className="ml-2">直径同梁底纵筋第一排: Φ{botR.diameter}</p>
                    <p className="ml-2">柱内锚固 ≥ laE = {laE}mm</p>
                    <p className="ml-2">沿加腋斜面延伸入梁内 ≥ laE = {laE}mm</p>
                    <p className="font-medium mt-1.5">箍筋加密区1:</p>
                    <p className="ml-2">{params.seismicGrade === '一级' ? '一级' : '二~四级'}: ≥ {hbCoeff}h<sub>b</sub> = {Math.round(hbCoeff * params.h)}mm</p>
                    <p className="ml-2">且 ≥ 500mm</p>
                    <p className="ml-2">且 ≥ c₁ + 0.5h₀ = {params.haunchLength} + {Math.round(0.5 * h0)} = {Math.round(params.haunchLength + 0.5 * h0)}mm</p>
                    <p className="ml-2 font-medium">取值: {Math.round(denseZone1)}mm</p>
                    <p className="ml-2">加腋部位箍筋规格及肢距同梁端箍筋</p>
                  </>
                );
              })()}
              {params.haunchType === 'horizontal' && (
                <>
                  <p className="font-medium mt-1">竖向加腋构造:</p>
                  <p className="ml-2">加腋区箍筋加密区同水平加腋</p>
                  <p className="ml-2">附加筋直径分别同梁内上下纵筋</p>
                </>
              )}
            </div>
          </div>
        </ExplainSection>
      )}

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">识图要点 (22G101-1)</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>集中标注适用于梁全跨，原位标注仅在标注位置有效</li>
            <li>原位标注优先级高于集中标注</li>
            <li>端支座: 直锚条件 laE ≤ hc - 保护层</li>
            <li>弯锚: 伸至柱外侧纵筋内侧，弯折15d</li>
            <li>支座负筋第一排 ln/3，第二排 ln/4</li>
            <li>箍筋加密区 = max(2h, 500mm) 从柱面起</li>
            <li>hc = 柱截面沿框架方向的宽度</li>
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

export function ColumnExplain({ params }: { params: ColumnParams }) {
  const coverMm = params.cover || 25;
  const colH = params.height || 3000;
  const resolved = resolveColumnBars(params.main, params.cornerMain, params.bMiddleMain, params.hMiddleMain, params.b - 2 * coverMm, params.h - 2 * coverMm);
  const stir = parseStirrup(params.stirrup);
  const anchor = calcAnchorAll(resolved.corner.grade, resolved.corner.diameter, params.concreteGrade, params.seismicGrade);
  const lapZone = calcColumnLapZone(colH);

  // 纵筋配筋率计算 (GB50010 §8.5.1)
  const Ag = params.b * params.h;
  const As = resolved.bars.reduce((s, bar) => s + rebarArea(bar.diameter), 0);
  const rho = As / Ag;
  const COLUMN_RHO_MIN: Record<string, number> = { '一级': 0.01, '二级': 0.008, '三级': 0.007, '四级': 0.006, '非抗震': 0.006 };
  const rhoMin = COLUMN_RHO_MIN[params.seismicGrade] ?? 0.006;
  const rhoOk = rho >= rhoMin && rho <= 0.05;

  // 箍筋加密区 GB50011 §6.3.3
  const hcVal = Math.max(params.b, params.h);
  const denseZoneLen = Math.max(Math.ceil(colH / 6), hcVal, 500);

  // 22G101 标注格式字符串
  const notationStr = resolved.isDetailed
    ? `${params.id}  ${params.b}×${params.h}  ${params.cornerMain}/${params.bMiddleMain ?? '-'}/${params.hMiddleMain ?? '-'}  ${params.stirrup}`
    : `${params.id}  ${params.b}×${params.h}  ${params.main}  ${params.stirrup}`;

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">框架柱 · 截面 {params.b}×{params.h}mm · 净高 {colH}mm</p>
        {params.hasVariableSection && (
          <p className="text-xs text-muted mt-0.5">变截面：自 {params.variableStart}mm 高度起变为 {params.upperB}×{params.upperH}mm</p>
        )}
        <p className="text-xs text-muted mt-0.5">
          柱顶节点：{params.topNodeType === 'corner' ? '角柱' : params.topNodeType === 'edge' ? '边柱' : '中柱'}
          {' · '}柱根支承：{params.baseSupportType === 'wall' ? '剪力墙上起柱' : params.baseSupportType === 'beam' ? '梁上起柱' : '基础顶面起柱'}
        </p>
        <div className="mt-2 px-2 py-1.5 bg-white/70 rounded font-mono text-[11px] text-blue-700 break-all">{notationStr}</div>
      </div>

      <ExplainSection title="柱顶节点场景">
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="space-y-1 text-xs text-slate-700">
            <p>柱顶节点类型：{params.topNodeType === 'corner' ? '角柱' : params.topNodeType === 'edge' ? '边柱' : '中柱'}</p>
            <p>柱顶梁截面：{params.roofBeamB}×{params.roofBeamH}mm</p>
            <p>屋面板：{params.hasRoofSlab ? `${params.roofSlabThickness}mm 厚现浇板` : '未设置'}</p>
            <p>当前 3D 已按中柱 / 边柱 / 角柱分别显示不同的梁板关系，用于辅助理解 22G101-1 第 2-14~2-16 页柱顶构造。</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="配筋" defaultOpen>
        {resolved.isDetailed ? (
          <>
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="font-medium text-red-800">角筋: {params.cornerMain}</p>
              <p className="text-xs text-red-600 mt-1">4根 {gradeLabel(resolved.corner.grade)} Φ{resolved.corner.diameter}，固定于四角</p>
            </div>
            {resolved.bMiddle && (
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="font-medium text-orange-800">b边中部筋: {params.bMiddleMain}</p>
                <p className="text-xs text-orange-600 mt-1">每侧 {resolved.bMiddle.count} 根 → 共 {resolved.bMiddle.count * 2} 根 {gradeLabel(resolved.bMiddle.grade)} Φ{resolved.bMiddle.diameter}，沿 b 方向分布</p>
              </div>
            )}
            {resolved.hMiddle && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="font-medium text-purple-800">h边中部筋: {params.hMiddleMain}</p>
                <p className="text-xs text-purple-600 mt-1">每侧 {resolved.hMiddle.count} 根 → 共 {resolved.hMiddle.count * 2} 根 {gradeLabel(resolved.hMiddle.grade)} Φ{resolved.hMiddle.diameter}，沿 h 方向分布</p>
              </div>
            )}
            <div className="p-2 bg-gray-50 rounded-lg text-xs text-muted">
              总计 {resolved.totalCount} 根纵筋（22G101-1 分项标注）
            </div>
          </>
        ) : (
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="font-medium text-red-800">全部纵筋: {params.main}</p>
            <p className="text-xs text-red-600 mt-1">{resolved.totalCount} 根 {gradeLabel(resolved.corner.grade)} Φ{resolved.corner.diameter}，沿截面周边均匀布置</p>
          </div>
        )}
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">箍筋: {params.stirrup}</p>
          <p className="text-xs text-green-600 mt-1">
            {gradeLabel(stir.grade)} Φ{stir.diameter}，加密区 @{stir.spacingDense}，非加密区 @{stir.spacingNormal}，{stir.legs} 肢箍
          </p>
          {stir.typeCode && (
            <p className="text-xs text-green-600 mt-0.5">箍筋类型: {stir.typeCode}型（22G101-1）</p>
          )}
        </div>
      </ExplainSection>

      <ExplainSection title="纵筋配筋率" defaultOpen>
        <div className={`p-3 rounded-lg ${rhoOk ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <p className={`font-medium ${rhoOk ? 'text-green-800' : 'text-red-800'}`}>
              ρ = {(rho * 100).toFixed(2)}%
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${rhoOk ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>
                {rho < rhoMin ? '偏低' : rho > 0.05 ? '偏高' : '合格'}
              </span>
            </p>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-gray-600">
            <p>总纵筋面积 As = {As.toFixed(0)} mm²</p>
            <p>截面积 Ag = {params.b}×{params.h} = {Ag} mm²</p>
            <p>ρ = As/Ag = {As.toFixed(0)}/{Ag} = <span className="font-semibold">{(rho * 100).toFixed(2)}%</span></p>
            <p className={rho < rhoMin ? 'text-red-600 font-medium' : 'text-gray-500'}>
              ρmin = {(rhoMin * 100).toFixed(1)}%（{params.seismicGrade}，GB50010 §8.5.1）
              {rho < rhoMin && ` ← 不满足，差 ${((rhoMin - rho) * 100).toFixed(2)}%`}
            </p>
            <p className="text-gray-400">ρmax = 5.0%（工程上限）</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="箍筋加密区">
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">加密区长度 GB50011 §6.3.3</p>
          <div className="mt-1.5 space-y-0.5 text-xs text-green-700">
            <p>l_d = max(Hn/6, hc, 500)</p>
            <p className="ml-2">Hn/6 = {colH}/6 = {Math.ceil(colH / 6)} mm</p>
            <p className="ml-2">hc = max(b,h) = max({params.b},{params.h}) = {hcVal} mm</p>
            <p className="ml-2 font-semibold">取值 l_d = {denseZoneLen} mm（上下两端各取）</p>
            <p className="mt-1">加密区间距 @{stir.spacingDense}mm，非加密区 @{stir.spacingNormal}mm</p>
          </div>
        </div>
      </ExplainSection>

      {params.hasVariableSection && (
        <ExplainSection title="变截面位置">
          <div className="p-3 bg-amber-50 rounded-lg">
            <p className="font-medium text-amber-800">KZ 柱变截面位置纵筋构造</p>
            <div className="mt-1.5 space-y-1 text-xs text-amber-700">
              <p>下段截面: {params.b}×{params.h}mm</p>
              <p>上段截面: {params.upperB}×{params.upperH}mm</p>
              <p>变截面起始高度: {params.variableStart}mm</p>
              <p>当前 3D 已将上下两段柱身和变截面位置分段显示，对应 22G101-1 第 2-16 页。</p>
            </div>
          </div>
        </ExplainSection>
      )}

      <ExplainSection title="锚固/搭接">
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">锚固/搭接计算 ({params.concreteGrade}, {params.seismicGrade})</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p>Φ{resolved.corner.diameter}: lab={anchor.lab}mm, la={anchor.la}mm, laE={anchor.laE}mm</p>
            <p>搭接: ll={anchor.ll}mm, llE={anchor.llE}mm</p>
            <p>搭接区域: 柱根 {lapZone.start}mm ~ {lapZone.end}mm（距楼面 Hn/6 ~ Hn/3）</p>
            <p>保护层厚度: {params.cover}mm</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101-1 柱平法制图规则</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>柱纵筋分角筋、b边中部筋、h边中部筋三项分别注写</li>
            <li>对称配筋的矩形截面柱，可仅注写一侧中部筋</li>
            <li>箍筋用&quot;/&quot;区分加密区与非加密区间距</li>
            <li>全高等间距箍筋不使用&quot;/&quot;</li>
            <li>加密区长度 = max(Hn/6, hc, 500mm) = {denseZoneLen}mm</li>
            <li>ρmin({params.seismicGrade}) = {(rhoMin * 100).toFixed(1)}%，ρmax = 5%</li>
            <li>角筋必须有箍筋弯钩固定，箍筋肢距 ≤ 200mm</li>
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

export function SlabExplain({ params }: { params: SlabParams }) {
  const bx = parseSlabRebar(params.bottomX);
  const by = parseSlabRebar(params.bottomY);
  const tx = params.topX ? parseSlabRebar(params.topX) : null;
  const ty = params.topY ? parseSlabRebar(params.topY) : null;
  const dist = parseSlabRebar(params.distribution);
  const negX = params.supportNegX ? parseSlabRebar(params.supportNegX) : null;
  const negY = params.supportNegY ? parseSlabRebar(params.supportNegY) : null;
  const bxLa = calcLa(bx.grade, bx.diameter, params.concreteGrade);
  const byLa = calcLa(by.grade, by.diameter, params.concreteGrade);
  const bxAnchorDetail = slabBottomAnchorDetail(params.supportType, bx.diameter, bxLa);
  const byAnchorDetail = slabBottomAnchorDetail(params.supportType, by.diameter, byLa);
  const supportLabel = params.supportType === 'simple' ? '简支' : params.supportType === 'continuous' ? '连续' : '悬挑';
  // 简支板→端支座(ln/4)，连续板→中间支座(第一排ln/3)
  const negSupportPos = params.supportType === 'continuous' ? 'middle' as const : 'end' as const;
  const negExtendX = slabNegBarExtend(params.spanX, negSupportPos);
  const negExtendY = slabNegBarExtend(params.spanY, negSupportPos);
  const negAnchorX = negX ? slabNegBarAnchorAtSupport(negSupportPos, negX.diameter) : null;
  const negAnchorY = negY ? slabNegBarAnchorAtSupport(negSupportPos, negY.diameter) : null;

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">楼板，板厚 {params.thickness}mm · {supportLabel} · {params.spanX}×{params.spanY}mm · 梁宽 {params.supportBeamWidth}mm</p>
      </div>

      <ExplainSection title="底筋" defaultOpen>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">X向底筋: {params.bottomX}</p>
          <p className="text-xs text-red-600 mt-1">{gradeLabel(bx.grade)} Φ{bx.diameter}@{bx.spacing}，受力方向</p>
        </div>
        <div className="p-3 bg-orange-50 rounded-lg">
          <p className="font-medium text-orange-800">Y向底筋: {params.bottomY}</p>
          <p className="text-xs text-orange-600 mt-1">{gradeLabel(by.grade)} Φ{by.diameter}@{by.spacing}</p>
        </div>
      </ExplainSection>

      {(tx || ty) && (
        <ExplainSection title="面筋">
          {tx && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="font-medium text-purple-800">X向面筋: {params.topX}</p>
              <p className="text-xs text-purple-600 mt-1">{gradeLabel(tx.grade)} Φ{tx.diameter}@{tx.spacing}</p>
            </div>
          )}
          {ty && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="font-medium text-purple-800">Y向面筋: {params.topY}</p>
              <p className="text-xs text-purple-600 mt-1">{gradeLabel(ty.grade)} Φ{ty.diameter}@{ty.spacing}</p>
            </div>
          )}
        </ExplainSection>
      )}

      <ExplainSection title="分布筋">
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">分布筋: {params.distribution}</p>
          <p className="text-xs text-green-600 mt-1">{gradeLabel(dist.grade)} Φ{dist.diameter}@{dist.spacing}，垂直于受力筋方向</p>
        </div>
      </ExplainSection>

      {(negX || negY) && (
        <ExplainSection title="支座负筋 (22G101)">
          {negX && (
            <div className="p-3 bg-sky-50 rounded-lg">
              <p className="font-medium text-sky-800">X向支座负筋: {params.supportNegX}</p>
              <p className="text-xs text-sky-600 mt-1">{gradeLabel(negX.grade)} Φ{negX.diameter}@{negX.spacing}，伸入跨中 {negSupportPos === 'middle' ? 'ln/3' : 'ln/4'}={negExtendX}mm</p>
              {negAnchorX && <p className="text-xs text-sky-600">{negAnchorX.description}</p>}
            </div>
          )}
          {negY && (
            <div className="p-3 bg-teal-50 rounded-lg">
              <p className="font-medium text-teal-800">Y向支座负筋: {params.supportNegY}</p>
              <p className="text-xs text-teal-600 mt-1">{gradeLabel(negY.grade)} Φ{negY.diameter}@{negY.spacing}，伸入跨中 {negSupportPos === 'middle' ? 'ln/3' : 'ln/4'}={negExtendY}mm</p>
              {negAnchorY && <p className="text-xs text-teal-600">{negAnchorY.description}</p>}
            </div>
          )}
        </ExplainSection>
      )}

      <ExplainSection title="锚固与构造 (22G101)">
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">底筋锚固 ({params.concreteGrade}, {supportLabel})</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p>X底筋: {bxAnchorDetail.description}</p>
            <p>Y底筋: {byAnchorDetail.description}</p>
            {bxAnchorDetail.bend > 0 && <p>弯折高度: 板厚-2c = {params.thickness - 2 * params.cover}mm</p>}
            <p>保护层厚度: {params.cover}mm</p>
          </div>
        </div>
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">分布筋构造</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p>搭接长度 ≥{SLAB_DIST_LAP_LENGTH}mm</p>
            <p>距支座起始 ≤ s/2</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101 板构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>底筋在下，面筋在上，短方向筋在外侧</li>
            <li>{supportLabel}端底筋伸入支座 ≥{bxAnchorDetail.straight}mm{bxAnchorDetail.bend > 0 ? `，弯折≥${bxAnchorDetail.bend}mm` : ''}</li>
            <li>端支座负筋伸入跨中 ≥ln/4，弯折向下 ≥12d</li>
            <li>中间支座负筋: 第一排 ≥ln/3，第二排 ≥ln/4，直通过支座</li>
            <li>分布筋搭接 ≥150mm，间距 ≤250mm</li>
            {params.supportType === 'cantilever' && <li>悬臂板受力筋伸至自由端弯折 ≥12d，锚入相邻跨 ≥ln/4</li>}
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

export function JointExplain({ params }: { params: import('@/lib/types').JointParams }) {
  const colR = parseRebar(params.colMain);
  const colStir = parseStirrup(params.colStirrup);
  const beamTopR = parseRebar(params.beamTop);
  const beamBotR = parseRebar(params.beamBottom);
  const laE = calcLaE(beamTopR.grade, beamTopR.diameter, params.concreteGrade, params.seismicGrade);
  const bendLen = calcBendLength(beamTopR.diameter);

  const jointTypeLabel = { middle: '中间节点', side: '边节点', corner: '角节点' };
  const anchorLabel = params.anchorType === 'bent' ? '弯锚' : '直锚';

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{jointTypeLabel[params.jointType]} · {anchorLabel}</p>
        <p className="text-xs text-muted mt-1">
          {params.jointType === 'middle' ? '柱两侧均有梁，梁筋可贯穿节点' : '柱一侧有梁，梁筋需锚入柱内'}
        </p>
      </div>

      <ExplainSection title="柱参数" defaultOpen>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="font-medium">柱截面: {params.colB}×{params.colH}mm</p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">柱纵筋: {params.colMain}</p>
          <p className="text-xs text-red-600 mt-1">{colR.count} 根 {gradeLabel(colR.grade)} Φ{colR.diameter}，贯穿节点区</p>
        </div>
      </ExplainSection>

      <ExplainSection title="梁参数" defaultOpen>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="font-medium">梁截面: {params.beamB}×{params.beamH}mm</p>
        </div>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">梁上部筋: {params.beamTop}</p>
          <p className="text-xs text-red-600 mt-1">{beamTopR.count} 根 Φ{beamTopR.diameter}，{anchorLabel}入柱</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="font-medium text-blue-800">梁下部筋: {params.beamBottom}</p>
          <p className="text-xs text-blue-600 mt-1">{beamBotR.count} 根 Φ{beamBotR.diameter}，{anchorLabel}入柱</p>
        </div>
      </ExplainSection>

      <ExplainSection title="节点构造">
        <div className="p-3 bg-orange-50 rounded-lg">
          <p className="font-medium text-orange-800">节点区箍筋</p>
          <p className="text-xs text-orange-600 mt-1">
            {gradeLabel(colStir.grade)} Φ{colStir.diameter}@{colStir.spacingDense}，节点区箍筋同柱端加密区
          </p>
        </div>
        {params.anchorType === 'bent' && (
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="font-medium text-purple-800">弯锚构造</p>
            <p className="text-xs text-purple-600 mt-1">
              梁筋伸入柱内，弯折段长度 15d = {bendLen}mm，弯折角度 90°
            </p>
          </div>
        )}
      </ExplainSection>

      <ExplainSection title="锚固计算">
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">锚固计算 ({params.concreteGrade}, {params.seismicGrade})</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p>梁筋 Φ{beamTopR.diameter}: laE={laE}mm</p>
            <p>弯折段: 15d = {bendLen}mm</p>
            <p>保护层厚度: {params.cover}mm</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">识图要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>节点核心区箍筋必须加密，间距同柱端加密区</li>
            <li>柱纵筋贯穿节点区，不得在节点区内连接</li>
            <li>梁上部筋弯锚时弯折段朝下，下部筋弯折段朝上</li>
            <li>直锚长度 ≥ laE = {laE}mm</li>
            <li>当柱截面宽度不足时必须采用弯锚</li>
            <li>中间节点梁筋可贯穿，边节点必须锚固</li>
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

export function ShearWallExplain({ params }: { params: ShearWallParams }) {
  const vert = parseSlabRebar(params.vertBar);
  const horiz = parseSlabRebar(params.horizBar);
  const boundaryR = parseRebar(params.boundaryMain);
  const boundaryStir = parseStirrup(params.boundaryStirrup);
  const BL = params.boundaryLength || Math.max(params.bw, 400);
  const boundaryTypeLabel = params.boundaryType === 'ybz'
    ? '约束边缘构件 YBZ'
    : params.boundaryType === 'fbz'
      ? '扶壁柱 FBZ'
      : params.boundaryType === 'az'
        ? '非边缘暗柱 AZ'
        : '构造边缘构件 GBZ';
  const boundaryFormLabel = params.boundaryForm === 'endColumn'
    ? '端柱'
    : params.boundaryForm === 'wingWall'
      ? '翼墙'
      : params.boundaryForm === 'cornerWall'
        ? '转角墙'
        : '暗柱';
  const tie = params.tieBar ? parseSlabRebar(params.tieBar) : null;
  const openingVert = params.openingVertBar ? parseSlabRebar(params.openingVertBar) : null;
  const openingHoriz = params.openingHorizBar ? parseSlabRebar(params.openingHorizBar) : null;
  const llE = calcLlE(boundaryR.grade, boundaryR.diameter, params.concreteGrade, params.seismicGrade);

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">剪力墙，墙厚 {params.bw}mm</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">墙体: {params.bw}×{params.lw}mm，净高 {params.hw}mm</p>
        <p className="text-xs text-muted mt-1">边缘构件类型: {boundaryTypeLabel}</p>
      </div>

      <ExplainSection title="分布筋" defaultOpen>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">竖向分布筋: {params.vertBar}</p>
          <p className="text-xs text-red-600 mt-1">{gradeLabel(vert.grade)} Φ{vert.diameter}@{vert.spacing}，双排布置（两侧各一排）</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="font-medium text-blue-800">水平分布筋: {params.horizBar}</p>
          <p className="text-xs text-blue-600 mt-1">{gradeLabel(horiz.grade)} Φ{horiz.diameter}@{horiz.spacing}，双排布置</p>
          <p className="text-xs text-blue-600 mt-0.5">底部加密区: max(hn/6, 500mm)</p>
        </div>
      </ExplainSection>

      <ExplainSection title="边缘构件">
        <div className="p-3 bg-purple-50 rounded-lg">
          <p className="font-medium text-purple-800">纵筋: {params.boundaryMain}</p>
          <p className="text-xs text-purple-600 mt-1">{boundaryR.count}根 {gradeLabel(boundaryR.grade)} Φ{boundaryR.diameter}，两端各一组</p>
          <p className="text-xs text-purple-600 mt-0.5">边缘构件类型: {boundaryTypeLabel}</p>
          <p className="text-xs text-purple-600 mt-0.5">边缘构件外形: {boundaryFormLabel}</p>
          <p className="text-xs text-purple-600 mt-0.5">边缘构件长度: {BL}mm</p>
          {!!params.boundaryProjection && <p className="text-xs text-purple-600 mt-0.5">凸出深度: {params.boundaryProjection}mm</p>}
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">箍筋: {params.boundaryStirrup}</p>
          <p className="text-xs text-green-600 mt-1">
            {gradeLabel(boundaryStir.grade)} Φ{boundaryStir.diameter}@{boundaryStir.spacingDense}，全高加密
          </p>
        </div>
      </ExplainSection>

      <ExplainSection title="拉结筋与洞口">
        <div className="p-3 bg-teal-50 rounded-lg">
          <p className="font-medium text-teal-800">拉结筋: {params.tieBar || '未设置'}</p>
          <p className="text-xs text-teal-600 mt-1">
            {tie ? `${gradeLabel(tie.grade)} Φ${tie.diameter}@${tie.spacing}，连接墙体前后双排分布筋` : '当前未显式设置拉结筋，3D 以分布筋双排层次为主'}
          </p>
        </div>
        {params.hasOpening && (
          <div className="p-3 bg-pink-50 rounded-lg">
            <p className="font-medium text-pink-800">洞口: {params.openingWidth}×{params.openingHeight}mm</p>
            <p className="text-xs text-pink-600 mt-1">洞底距墙底 {params.openingBottom}mm，中心偏移 X={params.openingOffsetX || 0}mm</p>
            <p className="text-xs text-pink-600 mt-0.5">侧边补强: {params.openingVertBar || '未设置'}{openingVert ? ` · ${gradeLabel(openingVert.grade)} Φ${openingVert.diameter}@${openingVert.spacing}` : ''}</p>
            <p className="text-xs text-pink-600 mt-0.5">上下补强: {params.openingHorizBar || '未设置'}{openingHoriz ? ` · ${gradeLabel(openingHoriz.grade)} Φ${openingHoriz.diameter}@${openingHoriz.spacing}` : ''}</p>
          </div>
        )}
      </ExplainSection>

      <ExplainSection title="锚固/搭接">
        <div className="p-3 bg-cyan-50 rounded-lg">
          <p className="font-medium text-cyan-800">锚固/搭接 ({params.concreteGrade}, {params.seismicGrade})</p>
          <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
            <p>边缘构件纵筋搭接: llE = {llE}mm</p>
            <p>竖向分布筋搭接: ≥ 1.2la</p>
            <p>水平分布筋锚入边缘构件: ≥ laE</p>
            <p>保护层厚度: {params.cover}mm</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">识图要点 (22G101-1)</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>分布筋双排布置，当前 3D 已显示前后双排层次。</li>
            <li>底部加强区长度通常取 max(hw/6, 500mm)，当前 3D 已高亮底部加强区。</li>
            <li>约束边缘构件 (YBZ) 箍筋全高加密，构造边缘构件 (GBZ) 箍筋可不加密。</li>
            <li>水平分布筋伸入边缘构件内锚固</li>
            <li>竖向分布筋搭接位置错开，同一截面 ≤ 50%</li>
            <li>墙身水平筋在边缘构件范围内的间距同墙身</li>
            <li>洞口周边需要附加补强钢筋，当前可直接在 3D 里观察洞口与补强位置。</li>
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 楼梯标注解读 (22G101-2 AT型)
// ═══════════════════════════════════════════════════════════════════

export function StairExplain({ params }: { params: StairParams }) {
  const botR = parseSlabRebar(params.bottomBar);
  const topR = parseSlabRebar(params.topBar);
  const distR = parseSlabRebar(params.distBar);
  const totalRise = params.stepCount * params.stepHeight;
  const totalRun = params.stepCount * params.stepWidth;
  const angle = (Math.atan2(totalRise, totalRun) * 180 / Math.PI).toFixed(1);
  const slabLen = Math.round(Math.sqrt(totalRise * totalRise + totalRun * totalRun));

  return (
    <div className="space-y-2 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">AT型板式楼梯 (22G101-2)</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">AT{params.stepCount}×{params.stepHeight}/{params.stepWidth}</p>
        <p className="text-xs text-muted mt-1">
          {params.stepCount}步 · 踏步高{params.stepHeight}mm · 踏步宽{params.stepWidth}mm
        </p>
        <p className="text-xs text-muted mt-0.5">
          总升高 {totalRise}mm · 水平长 {totalRun}mm · 倾角 {angle}° · 斜长 {slabLen}mm
        </p>
      </div>

      <ExplainSection title="标注解读" defaultOpen>
        <div className="p-3 bg-red-50 rounded-lg">
          <p className="font-medium text-red-800">下部纵筋: {params.bottomBar}</p>
          <p className="text-xs text-red-600 mt-1">
            {gradeLabel(botR.grade)} Φ{botR.diameter}@{botR.spacing}，沿梯板底面斜向布置
          </p>
          <p className="text-xs text-red-600 mt-0.5">
            22G101-2: 纵筋从低端梯梁（梯板低端支座）处锚入，沿梯板底面至高端梯梁（梯板高端支座）锚入
          </p>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <p className="font-medium text-purple-800">上部纵筋: {params.topBar}</p>
          <p className="text-xs text-purple-600 mt-1">
            {gradeLabel(topR.grade)} Φ{topR.diameter}@{topR.spacing}，沿梯板顶面（踏步面下方）布置
          </p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="font-medium text-green-800">分布筋: {params.distBar}</p>
          <p className="text-xs text-green-600 mt-1">
            {gradeLabel(distR.grade)} Φ{distR.diameter}@{distR.spacing}，垂直于纵筋方向
          </p>
          <p className="text-xs text-green-600 mt-0.5">
            22G101-2: 上下两层分布筋，沿梯板斜面等间距布置
          </p>
        </div>
      </ExplainSection>

      <ExplainSection title="梯板与平台">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="font-medium text-gray-800">梯板</p>
          <p className="text-xs text-gray-600 mt-1">梯板厚 {params.slabThickness}mm · 梯段宽 {params.flightWidth}mm</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="font-medium text-gray-800">平台板</p>
          <p className="text-xs text-gray-600 mt-1">
            上平台长 {params.topPlatformLen}mm · 下平台长 {params.botPlatformLen}mm · 厚 {params.platformThickness}mm
          </p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="font-medium text-gray-800">梯梁（梯板端支座）</p>
          <p className="text-xs text-gray-600 mt-1">
            截面 {params.beamB}×{params.beamH}mm（低端/高端各一根）
          </p>
        </div>
      </ExplainSection>

      <ExplainSection title="构造要求">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101-2 AT型构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>梯板厚度一般取 L/25~L/30（L为梯板斜长）</li>
            <li>下部纵筋锚入梯梁（梯板端支座）内 ≥ la（受拉锚固长度）</li>
            <li>上部纵筋伸入平台 ≥ ln/4（ln为梯板净跨）</li>
            <li>分布筋间距 ≤ 250mm，直径不小于 6mm</li>
            <li>踏步高 h 宜为 150~175mm，2h+b ≈ 600mm</li>
            <li>保护层厚度：室内环境 15mm，室外 20mm</li>
          </ul>
        </div>
      </ExplainSection>

      <ExplainSection title="识图要点">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">识图要点 (22G101-2)</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            <li>AT型: 板式楼梯，梯板为受弯构件</li>
            <li>注写方式: AT+踏步数×踏步高/踏步宽</li>
            <li>剖面注写: 标注梯板厚度和配筋</li>
            <li>梯梁（梯板端支座梁）单独标注截面和配筋</li>
            <li>梯板纵筋沿行走方向布置，分布筋垂直于纵筋</li>
          </ul>
        </div>
      </ExplainSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOUNDATION 独立基础标注解读
// ═══════════════════════════════════════════════════════════════════
export function FoundationExplain({ params }: { params: FoundationParams }) {
  const barX = parseSlabRebar(params.bottomBarX);
  const barY = parseSlabRebar(params.bottomBarY);
  const colR = parseRebar(params.colMain);
  const isDual = (params.columnCount || 1) === 2;
  const topX = isDual && params.topBarX ? parseSlabRebar(params.topBarX) : null;
  const topY = isDual && params.topBarY ? parseSlabRebar(params.topBarY) : null;
  const knowledge = getFoundationKnowledge('foundation');

  return (
    <div className="space-y-1">
      <ExplainSection title="基础参数" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs p-2 bg-gray-50 rounded-lg">
          <div><span className="text-gray-400">编号</span> <span className="font-medium">{params.id}</span></div>
          <div><span className="text-gray-400">形状</span> <span className="font-medium">{params.shape === 'stepped' ? '阶形' : '锥形'}{isDual ? '（双柱）' : ''}</span></div>
          <div><span className="text-gray-400">底面 bx×by</span> <span className="font-medium">{params.bx}×{params.by}mm</span></div>
          <div><span className="text-gray-400">总高 h</span> <span className="font-medium">{params.h}mm</span></div>
          <div><span className="text-gray-400">柱截面</span> <span className="font-medium">{params.colBx}×{params.colBy}mm{isDual ? ' ×2' : ''}</span></div>
          <div><span className="text-gray-400">保护层</span> <span className="font-medium">{params.cover}mm</span></div>
          {isDual && params.colSpacing && (
            <div><span className="text-gray-400">柱距</span> <span className="font-medium">{params.colSpacing}mm</span></div>
          )}
          {isDual && params.topBandWidth && (
            <div><span className="text-gray-400">顶部钢筋带宽</span> <span className="font-medium">{params.topBandWidth}mm</span></div>
          )}
          {isDual && params.hasFoundationBeam && (
            <div><span className="text-gray-400">基础梁</span> <span className="font-medium">{params.foundationBeamB}×{params.foundationBeamH}mm</span></div>
          )}
        </div>
      </ExplainSection>

      <ExplainSection title="配筋解读" defaultOpen>
        <div className="space-y-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <p className="text-xs font-medium text-red-700">X向底筋: {params.bottomBarX}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {gradeLabel(barX.grade)} Φ{barX.diameter}@{barX.spacing} · 单根长 {params.by - 2 * (params.cover || 40)}mm
              {params.shortenBottomBarX ? ' · 隔一减短 10%' : ''}
            </p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-700">Y向底筋: {params.bottomBarY}</p>
            <p className="text-[11px] text-blue-600 mt-0.5">
              {gradeLabel(barY.grade)} Φ{barY.diameter}@{barY.spacing} · 单根长 {params.bx - 2 * (params.cover || 40)}mm
              {params.shortenBottomBarY ? ' · 隔一减短 10%' : ''}
            </p>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg">
            <p className="text-xs font-medium text-purple-700">柱插筋: {params.colMain}</p>
            <p className="text-[11px] text-purple-600 mt-0.5">
              {colR.count}根 {gradeLabel(colR.grade)} Φ{colR.diameter}{isDual ? ' ×2柱' : ''}
            </p>
          </div>
          {topX && (
            <div className="p-2 bg-orange-50 rounded-lg">
              <p className="text-xs font-medium text-orange-700">顶部纵向筋: {params.topBarX}</p>
              <p className="text-[11px] text-orange-600 mt-0.5">
                {gradeLabel(topX.grade)} Φ{topX.diameter}@{topX.spacing} · 柱间顶面受力钢筋
                {params.topBarXCount ? ` · 共 ${params.topBarXCount} 根` : ''}
              </p>
            </div>
          )}
          {topY && (
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs font-medium text-green-700">顶部分布筋: {params.topBarY}</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                {gradeLabel(topY.grade)} Φ{topY.diameter}@{topY.spacing} · 柱间顶面分布钢筋
                {params.topBandWidth ? ` · 带宽 ${params.topBandWidth}mm` : ''}
              </p>
            </div>
          )}
          {isDual && params.hasFoundationBeam && (
            <>
              <div className="p-2 bg-amber-50 rounded-lg">
                <p className="text-xs font-medium text-emerald-700">基础梁箍筋: {params.foundationBeamStirrup || 'A10@150(4)'}</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">
                  基础梁 JL 箍筋 · 沿梁长方向布置
                </p>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg">
                <p className="text-xs font-medium text-amber-700">基础梁底筋: {params.foundationBeamBottom || '4C22'}</p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  基础梁 JL 底部贯通纵筋 · 梁宽 {params.foundationBeamB}mm
                  {params.foundationBeamEndType ? ` · ${params.foundationBeamEndType === 'bothSides' ? '双端外伸' : params.foundationBeamEndType === 'oneSide' ? `单端外伸(${params.foundationBeamOverhangSide === 'left' ? '左' : '右'})` : '无外伸'}` : ''}
                </p>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg">
                <p className="text-xs font-medium text-orange-700">基础梁顶筋: {params.foundationBeamTop || '4C20'}</p>
                <p className="text-[11px] text-orange-600 mt-0.5">
                  基础梁 JL 顶部贯通纵筋 · 梁高 {params.foundationBeamH}mm
                  {params.foundationBeamOverhang ? ` · 外伸 ${params.foundationBeamOverhang}mm` : ''}
                </p>
              </div>
            </>
          )}
        </div>
      </ExplainSection>

      <ExplainSection title="构造要求">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101-3 独立基础构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            {knowledge?.keyRules.map(rule => <li key={rule}>{rule}</li>)}
            {(params.shortenBottomBarX || params.shortenBottomBarY) && <li>当前 3D 模型已按“隔一布一”表达底筋减短 10% 的布置效果。</li>}
            {params.hasFoundationBeam && <li>当前 3D 模型已表达设置基础梁的双柱普通独立基础做法，可同步观察梁体与梁筋。</li>}
            {isDual && <li>双柱基础宜结合第 2-12、2-13 页同步核对顶部柱间钢筋和基础梁做法。</li>}
          </ul>
        </div>
      </ExplainSection>

      <FoundationPageIndexSection componentType="foundation" />
      <FoundationNotationGuideSection componentType="foundation" />
      <FoundationDrawingChecklistSection componentType="foundation" />
      <FoundationDesignNotesSection componentType="foundation" />
      <FoundationRelatedDetailSection componentType="foundation" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STRIP FOUNDATION 条形基础标注解读
// ═══════════════════════════════════════════════════════════════════
export function StripFoundationExplain({ params }: { params: StripFoundationParams }) {
  const bottom = parseSlabRebar(params.bottomBar);
  const dist = parseSlabRebar(params.distBar);
  const top = params.topBar ? parseSlabRebar(params.topBar) : null;
  const topDist = params.topDistBar ? parseSlabRebar(params.topDistBar) : null;
  const jlBottom = params.jlBottom ? parseRebar(params.jlBottom) : null;
  const jlTop = params.jlTop ? parseRebar(params.jlTop) : null;
  const jclBottom = params.jclBottom ? parseRebar(params.jclBottom) : null;
  const jclTop = params.jclTop ? parseRebar(params.jclTop) : null;
  const knowledge = getFoundationKnowledge('stripfoundation');
  const clearGap = params.supportCount === 2 && params.supportSpacing
    ? Math.max(params.supportSpacing - params.supportWidth, 0)
    : 0;

  return (
    <div className="space-y-1">
      <ExplainSection title="条基参数" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs p-2 bg-gray-50 rounded-lg">
          <div><span className="text-gray-400">编号</span> <span className="font-medium">{params.id}</span></div>
          <div><span className="text-gray-400">类型</span> <span className="font-medium">{params.stripKind === 'beamPlate' ? '梁板式' : '板式'}</span></div>
          <div><span className="text-gray-400">底板尺寸</span> <span className="font-medium">{params.length}×{params.width}×{params.h}mm</span></div>
          <div><span className="text-gray-400">保护层</span> <span className="font-medium">{params.cover}mm</span></div>
          <div><span className="text-gray-400">支承形式</span> <span className="font-medium">{params.supportCount === 2 ? '双' : '单'}{params.supportType === 'beam' ? '梁' : '墙'}</span></div>
          <div><span className="text-gray-400">支承宽度</span> <span className="font-medium">{params.supportWidth}mm</span></div>
          <div><span className="text-gray-400">支承高度</span> <span className="font-medium">{params.supportHeight}mm</span></div>
          <div><span className="text-gray-400">中心距</span> <span className="font-medium">{params.supportSpacing ? `${params.supportSpacing}mm` : '—'}</span></div>
        </div>
      </ExplainSection>

      <ExplainSection title="配筋解读" defaultOpen>
        <div className="space-y-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <p className="text-xs font-medium text-red-700">底部横向受力筋 B: {params.bottomBar}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {gradeLabel(bottom.grade)} Φ{bottom.diameter}@{bottom.spacing} · 横向受力钢筋，沿条基长度方向重复布置
            </p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-700">底部分布筋: {params.distBar}</p>
            <p className="text-[11px] text-blue-600 mt-0.5">
              {gradeLabel(dist.grade)} Φ{dist.diameter}@{dist.spacing} · 沿条基轴线方向通长布置
            </p>
          </div>
          {top && (
            <div className="p-2 bg-orange-50 rounded-lg">
              <p className="text-xs font-medium text-orange-700">顶部横向受力筋 T: {params.topBar}</p>
              <p className="text-[11px] text-orange-600 mt-0.5">
                {gradeLabel(top.grade)} Φ{top.diameter}@{top.spacing} · 一般位于两梁(墙)之间净距 {clearGap || '—'}mm 范围内
              </p>
            </div>
          )}
          {topDist && (
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs font-medium text-green-700">顶部分布筋: {params.topDistBar}</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                {gradeLabel(topDist.grade)} Φ{topDist.diameter}@{topDist.spacing} · 与顶部横向筋配套
              </p>
            </div>
          )}
          {params.supportType === 'beam' && (params.jlBottom || params.jlTop || params.jlStirrup) && (
            <div className="p-2 bg-amber-50 rounded-lg">
              <p className="text-xs font-medium text-amber-700">JL 主梁细部筋</p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                底筋 {params.jlBottom || '未设置'}{jlBottom ? `（${jlBottom.count}根 Φ${jlBottom.diameter}）` : ''}，顶筋 {params.jlTop || '未设置'}{jlTop ? `（${jlTop.count}根 Φ${jlTop.diameter}）` : ''}，箍筋 {params.jlStirrup || '未设置'}，端部 {params.jlEndType === 'bothSides' ? `双端外伸 ${params.jlOverhang || 0}mm` : params.jlEndType === 'oneSide' ? `${params.jlOverhangSide === 'left' ? '左端' : '右端'}外伸 ${params.jlOverhang || 0}mm` : '无外伸'}
              </p>
            </div>
          )}
          {params.hasJcl && (
            <div className="p-2 bg-violet-50 rounded-lg">
              <p className="text-xs font-medium text-violet-700">JCL 次梁细部筋</p>
              <p className="text-[11px] text-violet-600 mt-0.5">
                {params.jclCount || 1}道，截面 {params.jclB || '—'}×{params.jclH || '—'}mm，底筋 {params.jclBottom || '未设置'}{jclBottom ? `（${jclBottom.count}根 Φ${jclBottom.diameter}）` : ''}，顶筋 {params.jclTop || '未设置'}{jclTop ? `（${jclTop.count}根 Φ${jclTop.diameter}）` : ''}，箍筋 {params.jclStirrup || '未设置'}，端部 {params.jclEndType === 'bothSides' ? `双端外伸 ${params.jclOverhang || 0}mm` : params.jclEndType === 'oneSide' ? `${params.jclOverhangSide === 'left' ? '下侧' : '上侧'}外伸 ${params.jclOverhang || 0}mm` : '无外伸'}
              </p>
            </div>
          )}
          {params.hasLocalOverride && (
            <div className="p-2 bg-rose-50 rounded-lg">
              <p className="text-xs font-medium text-rose-700">原位修正段</p>
              <p className="text-[11px] text-rose-600 mt-0.5">
                起点 {params.localOverrideStart || 0}mm，长度 {params.localOverrideLength || 0}mm，底筋 {params.localBottomBar || '未设置'}，顶筋 {params.localTopBar || '未设置'}{params.localOverrideNote ? ` · ${params.localOverrideNote}` : ''}
              </p>
            </div>
          )}
        </div>
      </ExplainSection>

      <ExplainSection title="构造要求">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101-3 条形基础构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            {knowledge?.keyRules.map(rule => <li key={rule}>{rule}</li>)}
            {params.supportCount === 2 && <li>当前参数为双梁/双墙条基，识图时应单独核对两支承之间的顶部钢筋与锚固做法。</li>}
            {params.stripKind === 'beamPlate' && <li>当前为梁板式条基，宜同时对照 JL / JCL 相关详图核对基础梁构造。</li>}
            {params.supportType === 'beam' && (params.jlEndType || 'none') !== 'none' && <li>当前 3D 已按“外伸部位第一排底筋上弯、其余排截断”的思路加强端部表达，用于辅助核对 2-25 / 2-29 细部构造。</li>}
          </ul>
        </div>
      </ExplainSection>

      <FoundationPageIndexSection componentType="stripfoundation" />
      <FoundationNotationGuideSection componentType="stripfoundation" />
      <FoundationDrawingChecklistSection componentType="stripfoundation" />
      <FoundationDesignNotesSection componentType="stripfoundation" />
      <FoundationRelatedDetailSection componentType="stripfoundation" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PILE CAP 承台标注解读
// ═══════════════════════════════════════════════════════════════════
export function PileCapExplain({ params }: { params: PileCapParams }) {
  const barX = parseSlabRebar(params.bottomBarX);
  const barY = parseSlabRebar(params.bottomBarY);
  const colR = parseRebar(params.colMain);
  const knowledge = getFoundationKnowledge('pilecap');

  return (
    <div className="space-y-1">
      <ExplainSection title="承台参数" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs p-2 bg-gray-50 rounded-lg">
          <div><span className="text-gray-400">编号</span> <span className="font-medium">{params.id}</span></div>
          <div><span className="text-gray-400">承台尺寸</span> <span className="font-medium">{params.bx}×{params.by}×{params.h}mm</span></div>
          <div><span className="text-gray-400">柱截面</span> <span className="font-medium">{params.colBx}×{params.colBy}mm</span></div>
          <div><span className="text-gray-400">保护层</span> <span className="font-medium">{params.cover}mm</span></div>
        </div>
      </ExplainSection>

      <ExplainSection title="桩参数" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs p-2 bg-gray-50 rounded-lg">
          <div><span className="text-gray-400">桩径</span> <span className="font-medium">Φ{params.pileDiameter}mm</span></div>
          <div><span className="text-gray-400">桩数</span> <span className="font-medium">{params.pileCount}根</span></div>
          <div><span className="text-gray-400">X向桩距</span> <span className="font-medium">{params.pileSpacingX}mm</span></div>
          <div><span className="text-gray-400">Y向桩距</span> <span className="font-medium">{params.pileSpacingY}mm</span></div>
          <div><span className="text-gray-400">桩长</span> <span className="font-medium">{params.pileLength}mm</span></div>
          <div><span className="text-gray-400">排布</span> <span className="font-medium">{params.pileLayout === 'grid' ? '矩形排布' : '环形排布'}</span></div>
        </div>
      </ExplainSection>

      <ExplainSection title="配筋解读" defaultOpen>
        <div className="space-y-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <p className="text-xs font-medium text-red-700">X向底筋: {params.bottomBarX}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {gradeLabel(barX.grade)} Φ{barX.diameter}@{barX.spacing}
            </p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-700">Y向底筋: {params.bottomBarY}</p>
            <p className="text-[11px] text-blue-600 mt-0.5">
              {gradeLabel(barY.grade)} Φ{barY.diameter}@{barY.spacing}
            </p>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg">
            <p className="text-xs font-medium text-purple-700">柱插筋: {params.colMain}</p>
            <p className="text-[11px] text-purple-600 mt-0.5">
              {colR.count}根 {gradeLabel(colR.grade)} Φ{colR.diameter}
            </p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="构造要求">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">22G101-3 承台构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            {knowledge?.keyRules.map(rule => <li key={rule}>{rule}</li>)}
            <li>当前项目承台锚固面板已结合第 2-38~2-48 页，对桩顶嵌入高度和底筋端部直段做了数值化检查。</li>
          </ul>
        </div>
      </ExplainSection>

      <FoundationPageIndexSection componentType="pilecap" />
      <FoundationNotationGuideSection componentType="pilecap" />
      <FoundationDrawingChecklistSection componentType="pilecap" />
      <FoundationDesignNotesSection componentType="pilecap" />
      <FoundationRelatedDetailSection componentType="pilecap" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RAFT FOUNDATION 筏板基础标注解读
// ═══════════════════════════════════════════════════════════════════
export function RaftExplain({ params }: { params: RaftFoundationParams }) {
  const botX = parseSlabRebar(params.bottomBarX);
  const botY = parseSlabRebar(params.bottomBarY);
  const topX = params.topBarX ? parseSlabRebar(params.topBarX) : null;
  const topY = params.topBarY ? parseSlabRebar(params.topBarY) : null;
  const colR = parseRebar(params.colMain);
  const colTotal = params.colCountX * params.colCountY;
  const knowledge = getFoundationKnowledge('raft');
  const bottomOrder = params.bottomCrossOrder ?? 'xBelowY';
  const topOrder = params.topCrossOrder ?? 'xBelowY';

  // 22G101-3 柱插筋锚固计算
  const cover = params.cover || 40;
  const laE = calcLaE(colR.grade, colR.diameter, params.concreteGrade, params.seismicGrade);
  const anchor = determineColFoundAnchor(params.h, cover, colR.diameter, laE);
  const scenarioMap: Record<string, string> = {
    a: '(a) 保护层>5d，高度满足直锚',
    b: '(b) 保护层≤5d，高度满足直锚',
    c: '(c) 保护层>5d，高度不满足直锚',
    d: '(d) 保护层≤5d，高度不满足直锚',
  };

  return (
    <div className="space-y-1">
      <ExplainSection title="筏板参数" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs p-2 bg-gray-50 rounded-lg">
          <div><span className="text-gray-400">编号</span> <span className="font-medium">{params.id}</span></div>
          <div><span className="text-gray-400">筏板尺寸</span> <span className="font-medium">{params.lx}×{params.ly}×{params.h}mm</span></div>
          <div><span className="text-gray-400">柱截面</span> <span className="font-medium">{params.colBx}×{params.colBy}mm</span></div>
          <div><span className="text-gray-400">保护层</span> <span className="font-medium">{params.cover}mm</span></div>
          <div><span className="text-gray-400">柱网</span> <span className="font-medium">{params.colCountX}×{params.colCountY} ({colTotal}根柱)</span></div>
          <div><span className="text-gray-400">柱距</span> <span className="font-medium">{params.colSpacingX}×{params.colSpacingY}mm</span></div>
          <div><span className="text-gray-400">抗震等级</span> <span className="font-medium">{params.seismicGrade}</span></div>
        </div>
      </ExplainSection>

      <ExplainSection title="配筋解读" defaultOpen>
        <div className="space-y-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <p className="text-xs font-medium text-red-700">X向底筋: {params.bottomBarX}</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {gradeLabel(botX.grade)} Φ{botX.diameter}@{botX.spacing} · 单根长 {params.ly - 2 * (params.cover || 40)}mm · {bottomOrder === 'xBelowY' ? '位于下层' : '位于上层'}
            </p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="text-xs font-medium text-blue-700">Y向底筋: {params.bottomBarY}</p>
            <p className="text-[11px] text-blue-600 mt-0.5">
              {gradeLabel(botY.grade)} Φ{botY.diameter}@{botY.spacing} · 单根长 {params.lx - 2 * (params.cover || 40)}mm · {bottomOrder === 'xBelowY' ? '位于上层' : '位于下层'}
            </p>
          </div>
          {topX && (
            <div className="p-2 bg-orange-50 rounded-lg">
              <p className="text-xs font-medium text-orange-700">X向面筋: {params.topBarX}</p>
              <p className="text-[11px] text-orange-600 mt-0.5">
                {gradeLabel(topX.grade)} Φ{topX.diameter}@{topX.spacing} · {topOrder === 'xBelowY' ? '位于下层' : '位于上层'}
              </p>
            </div>
          )}
          {topY && (
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs font-medium text-green-700">Y向面筋: {params.topBarY}</p>
              <p className="text-[11px] text-green-600 mt-0.5">
                {gradeLabel(topY.grade)} Φ{topY.diameter}@{topY.spacing} · {topOrder === 'xBelowY' ? '位于上层' : '位于下层'}
              </p>
            </div>
          )}
          <div className="p-2 bg-purple-50 rounded-lg">
            <p className="text-xs font-medium text-purple-700">柱插筋: {params.colMain}</p>
            <p className="text-[11px] text-purple-600 mt-0.5">
              每柱{colR.count}根 {gradeLabel(colR.grade)} Φ{colR.diameter} · 共{colTotal}柱
            </p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="柱插筋锚固 (22G101-3)" defaultOpen>
        <div className="space-y-2">
          <div className={`p-2 rounded-lg ${anchor.canStraight ? 'bg-emerald-50' : 'bg-yellow-50'}`}>
            <p className={`text-xs font-medium ${anchor.canStraight ? 'text-emerald-700' : 'text-yellow-700'}`}>
              {anchor.canStraight ? '✓ 直锚' : '⚠ 弯锚'} — {scenarioMap[anchor.scenario]}
            </p>
            <div className={`text-[11px] mt-1 space-y-0.5 ${anchor.canStraight ? 'text-emerald-600' : 'text-yellow-600'}`}>
              <p>laE = {laE}mm · 可用深度 = h−c = {params.h}−{cover} = {params.h - cover}mm</p>
              <p>保护层 {cover}mm {anchor.isCoverLarge ? '>' : '≤'} 5d = {5 * colR.diameter}mm</p>
              {anchor.canStraight ? (
                <p>底弯 = max(6d, 150) = max({6 * colR.diameter}, 150) = {anchor.bendLength}mm</p>
              ) : (
                <>
                  <p>底弯 = 15d = 15×{colR.diameter} = {anchor.bendLength}mm</p>
                  <p>直段 ≥ max(0.6laE, 20d) = max({Math.ceil(0.6 * laE)}, {20 * colR.diameter}) = {anchor.straightPortion}mm</p>
                </>
              )}
            </div>
          </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-xs font-medium text-slate-700">锚固区箍筋要求</p>
            <div className="text-[11px] text-slate-600 mt-0.5 space-y-0.5">
              <p>≥ 2道矩形封闭箍（非复合箍），间距 ≤ 500mm</p>
              <p>箍筋直径 ≥ d/4 = {colR.diameter}/4 = Φ{anchor.stirrupMinDia}</p>
              <p>箍筋间距 ≤ min(10d, 100) = min({10 * colR.diameter}, 100) = {anchor.stirrupMaxSpacing}mm</p>
            </div>
          </div>
          {!anchor.isCoverLarge && (
            <div className="p-2 bg-rose-50 rounded-lg">
              <p className="text-xs font-medium text-rose-700">⚠ 保护层 ≤ 5d</p>
              <p className="text-[11px] text-rose-600 mt-0.5">
                柱插筋自外皮算起 ≤ 5d 的部分应设锚固区横向钢筋（22G101-3 注3）
              </p>
            </div>
          )}
        </div>
      </ExplainSection>

      <ExplainSection title="交叉钢筋上下关系" defaultOpen>
        <div className="space-y-2">
          <div className="p-2 bg-slate-50 rounded-lg text-[11px] text-slate-700">
            <p>底筋同层交叉：{bottomOrder === 'xBelowY' ? 'X向在下，Y向在上' : 'Y向在下，X向在上'}</p>
            <p className="mt-1">面筋同层交叉：{topOrder === 'xBelowY' ? 'X向在下，Y向在上' : 'Y向在下，X向在上'}</p>
          </div>
        </div>
      </ExplainSection>

      <ExplainSection title="构造要求">
        <div className="p-3 bg-amber-50 rounded-lg">
          <p className="font-medium text-amber-800">GB50007 / 22G101-3 筏板基础构造要点</p>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
            {knowledge?.keyRules.map(rule => <li key={rule}>{rule}</li>)}
            <li>当前页面若选择梁板式或板带式，应分别对照 JL / LPB 或 ZXB / KZB / BPB 的页码，不宜混用。</li>
          </ul>
        </div>
      </ExplainSection>

      <FoundationPageIndexSection componentType="raft" />
      <FoundationNotationGuideSection componentType="raft" />
      <FoundationDrawingChecklistSection componentType="raft" />
      <FoundationDesignNotesSection componentType="raft" />
      <FoundationRelatedDetailSection componentType="raft" />
    </div>
  );
}
