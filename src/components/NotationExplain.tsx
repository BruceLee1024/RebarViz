'use client';

import type { BeamParams, ColumnParams, SlabParams } from '@/lib/types';
import { parseRebar, parseStirrup, parseSlabRebar, GRADE_MAP, gradeLabel } from '@/lib/rebar';
import { calcAnchorAll, calcSupportRebarLength, calcSlabBottomAnchor, calcColumnLapZone, calcLaE, calcBendLength, calcBeamEndAnchor, calcBottomBarLapAtMiddleJoint } from '@/lib/anchor';

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

  // 22G101 beam end anchor
  const hc = params.hc || 500;
  const cover = params.cover || 25;
  const topEndAnchor = calcBeamEndAnchor(topR.grade, topR.diameter, params.concreteGrade, params.seismicGrade, hc, cover);
  const botEndAnchor = calcBeamEndAnchor(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, hc, cover);
  const denseZone = Math.max(2 * params.h, 500);
  const midJointLap = calcBottomBarLapAtMiddleJoint(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, params.h, cover);

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">框架梁，括号内数字表示跨数</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">截面: {params.b}×{params.h}mm</p>
        <p className="text-xs text-muted mt-1">宽 {params.b}mm，高 {params.h}mm，柱宽 hc={hc}mm</p>
      </div>

      <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">集中标注</p></div>
      <div className="p-3 bg-red-50 rounded-lg">
        <p className="font-medium text-red-800">上部通长筋: {params.top}</p>
        <p className="text-xs text-red-600 mt-1">{topR.count} 根 {gradeLabel(topR.grade)} Φ{topR.diameter}</p>
      </div>
      <div className="p-3 bg-red-50 rounded-lg">
        <p className="font-medium text-red-800">下部通长筋: {params.bottom}</p>
        <p className="text-xs text-red-600 mt-1">{botR.count} 根 {gradeLabel(botR.grade)} Φ{botR.diameter}</p>
      </div>
      <div className="p-3 bg-green-50 rounded-lg">
        <p className="font-medium text-green-800">箍筋: {params.stirrup}</p>
        <p className="text-xs text-green-600 mt-1">
          {gradeLabel(stir.grade)} Φ{stir.diameter}，加密区 {stir.spacingDense}mm，非加密区 {stir.spacingNormal}mm，{stir.legs} 肢箍
        </p>
        <p className="text-xs text-green-600 mt-0.5">加密区长度: max(2h, 500) = {denseZone}mm</p>
      </div>

      {(leftR || rightR) && (
        <>
          <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">原位标注</p></div>
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
        </>
      )}

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
    </div>
  );
}

export function ColumnExplain({ params }: { params: ColumnParams }) {
  const mainR = parseRebar(params.main);
  const stir = parseStirrup(params.stirrup);
  const anchor = calcAnchorAll(mainR.grade, mainR.diameter, params.concreteGrade, params.seismicGrade);
  const lapZone = calcColumnLapZone(params.height || 3000);

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">框架柱</p>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">截面: {params.b}×{params.h}mm</p>
      </div>
      <div className="p-3 bg-red-50 rounded-lg">
        <p className="font-medium text-red-800">全部纵筋: {params.main}</p>
        <p className="text-xs text-red-600 mt-1">{mainR.count} 根 {gradeLabel(mainR.grade)} Φ{mainR.diameter}，沿截面周边均匀布置</p>
      </div>
      <div className="p-3 bg-green-50 rounded-lg">
        <p className="font-medium text-green-800">箍筋: {params.stirrup}</p>
        <p className="text-xs text-green-600 mt-1">
          {gradeLabel(stir.grade)} Φ{stir.diameter}，加密区 {stir.spacingDense}mm，非加密区 {stir.spacingNormal}mm，{stir.legs} 肢箍
        </p>
      </div>

      <div className="p-3 bg-cyan-50 rounded-lg">
        <p className="font-medium text-cyan-800">锚固/搭接计算 ({params.concreteGrade}, {params.seismicGrade})</p>
        <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
          <p>Φ{mainR.diameter}: lab={anchor.lab}mm, la={anchor.la}mm, laE={anchor.laE}mm</p>
          <p>搭接: ll={anchor.ll}mm, llE={anchor.llE}mm</p>
          <p>搭接区域: 柱根 {lapZone.start}mm ~ {lapZone.end}mm</p>
          <p>保护层厚度: {params.cover}mm</p>
        </div>
      </div>

      <div className="p-3 bg-amber-50 rounded-lg">
        <p className="font-medium text-amber-800">识图要点</p>
        <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
          <li>纵筋沿截面周边均匀分布</li>
          <li>箍筋加密区在柱端（塑性铰区域）</li>
          <li>加密区长度取 Hn/6、500mm、hc 三者最大值</li>
          <li>角筋必须有箍筋弯钩固定</li>
        </ul>
      </div>
    </div>
  );
}

export function SlabExplain({ params }: { params: SlabParams }) {
  const bx = parseSlabRebar(params.bottomX);
  const by = parseSlabRebar(params.bottomY);
  const tx = params.topX ? parseSlabRebar(params.topX) : null;
  const ty = params.topY ? parseSlabRebar(params.topY) : null;
  const dist = parseSlabRebar(params.distribution);
  const bxAnchor = calcSlabBottomAnchor(bx.grade, bx.diameter, params.concreteGrade);
  const byAnchor = calcSlabBottomAnchor(by.grade, by.diameter, params.concreteGrade);

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{params.id}</p>
        <p className="text-xs text-muted mt-1">楼板，板厚 {params.thickness}mm</p>
      </div>

      <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">底筋</p></div>
      <div className="p-3 bg-red-50 rounded-lg">
        <p className="font-medium text-red-800">X向底筋: {params.bottomX}</p>
        <p className="text-xs text-red-600 mt-1">{gradeLabel(bx.grade)} Φ{bx.diameter}@{bx.spacing}，受力方向</p>
      </div>
      <div className="p-3 bg-orange-50 rounded-lg">
        <p className="font-medium text-orange-800">Y向底筋: {params.bottomY}</p>
        <p className="text-xs text-orange-600 mt-1">{gradeLabel(by.grade)} Φ{by.diameter}@{by.spacing}</p>
      </div>

      {(tx || ty) && (
        <>
          <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">面筋</p></div>
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
        </>
      )}

      <div className="p-3 bg-green-50 rounded-lg">
        <p className="font-medium text-green-800">分布筋: {params.distribution}</p>
        <p className="text-xs text-green-600 mt-1">{gradeLabel(dist.grade)} Φ{dist.diameter}@{dist.spacing}，垂直于受力筋方向</p>
      </div>

      <div className="p-3 bg-cyan-50 rounded-lg">
        <p className="font-medium text-cyan-800">锚固计算 ({params.concreteGrade})</p>
        <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
          <p>X底筋伸入支座: {bxAnchor}mm (≥5d 且 ≥la/2)</p>
          <p>Y底筋伸入支座: {byAnchor}mm</p>
          <p>保护层厚度: {params.cover}mm</p>
        </div>
      </div>

      <div className="p-3 bg-amber-50 rounded-lg">
        <p className="font-medium text-amber-800">识图要点</p>
        <ul className="mt-1.5 space-y-1 text-xs text-amber-700 list-disc list-inside">
          <li>底筋在下，面筋在上，短方向筋在外侧</li>
          <li>板底筋伸入支座长度不小于 5d</li>
          <li>面筋一般在支座处设置，承受负弯矩</li>
          <li>分布筋垂直于受力筋，间距不大于 250mm</li>
        </ul>
      </div>
    </div>
  );
}

export function JointExplain({ params }: { params: import('@/lib/types').JointParams }) {
  const colR = parseRebar(params.colMain);
  const colStir = parseStirrup(params.colStirrup);
  const beamTopR = parseRebar(params.beamTop);
  const beamBotR = parseRebar(params.beamBottom);
  const beamStir = parseStirrup(params.beamStirrup);
  const laE = calcLaE(beamTopR.grade, beamTopR.diameter, params.concreteGrade, params.seismicGrade);
  const bendLen = calcBendLength(beamTopR.diameter);

  const jointTypeLabel = { middle: '中间节点', side: '边节点', corner: '角节点' };
  const anchorLabel = params.anchorType === 'bent' ? '弯锚' : '直锚';

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 bg-blue-50 rounded-lg">
        <p className="font-semibold text-primary">{jointTypeLabel[params.jointType]} · {anchorLabel}</p>
        <p className="text-xs text-muted mt-1">
          {params.jointType === 'middle' ? '柱两侧均有梁，梁筋可贯穿节点' : '柱一侧有梁，梁筋需锚入柱内'}
        </p>
      </div>

      <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">柱参数</p></div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">柱截面: {params.colB}×{params.colH}mm</p>
      </div>
      <div className="p-3 bg-red-50 rounded-lg">
        <p className="font-medium text-red-800">柱纵筋: {params.colMain}</p>
        <p className="text-xs text-red-600 mt-1">{colR.count} 根 {gradeLabel(colR.grade)} Φ{colR.diameter}，贯穿节点区</p>
      </div>

      <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">梁参数</p></div>
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

      <div className="pt-1"><p className="text-xs font-medium text-muted mb-2">节点构造</p></div>
      <div className="p-3 bg-orange-50 rounded-lg">
        <p className="font-medium text-orange-800">节点区箍筋</p>
        <p className="text-xs text-orange-600 mt-1">
          {gradeLabel(colStir.grade)} Φ{colStir.diameter}@{colStir.spacingDense}，节点区箍筋同柱端加密区
        </p>
      </div>

      <div className="p-3 bg-cyan-50 rounded-lg">
        <p className="font-medium text-cyan-800">锚固计算 ({params.concreteGrade}, {params.seismicGrade})</p>
        <div className="mt-1.5 space-y-1 text-xs text-cyan-700">
          <p>梁筋 Φ{beamTopR.diameter}: laE={laE}mm</p>
          <p>弯折段: 15d = {bendLen}mm</p>
          <p>保护层厚度: {params.cover}mm</p>
        </div>
      </div>

      {params.anchorType === 'bent' && (
        <div className="p-3 bg-purple-50 rounded-lg">
          <p className="font-medium text-purple-800">弯锚构造</p>
          <p className="text-xs text-purple-600 mt-1">
            梁筋伸入柱内，弯折段长度 15d = {bendLen}mm，弯折角度 90°
          </p>
        </div>
      )}

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
    </div>
  );
}
