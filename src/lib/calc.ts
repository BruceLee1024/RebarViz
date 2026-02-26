import { parseRebar, parseStirrup, parseSlabRebar } from './rebar';
import { calcLaE, calcSupportRebarLength, calcLlE, calcSlabBottomAnchor, calcBeamEndAnchor } from './anchor';
import type { BeamParams, ColumnParams, SlabParams } from './types';

const WEIGHT_PER_M: Record<number, number> = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888,
  14: 1.21, 16: 1.58, 18: 2.0, 20: 2.47,
  22: 2.98, 25: 3.85, 28: 4.83, 32: 6.31,
  36: 7.99, 40: 9.87,
};

function w(diameter: number): number {
  return WEIGHT_PER_M[diameter] || (diameter * diameter * 0.00617);
}

export interface CalcResult {
  items: { name: string; spec: string; length: string; weight: string; color: string }[];
  total: string;
}

export function calcBeam(p: BeamParams): CalcResult {
  const top = parseRebar(p.top);
  const bot = parseRebar(p.bottom);
  const stir = parseStirrup(p.stirrup);
  const leftR = p.leftSupport ? parseRebar(p.leftSupport) : null;
  const rightR = p.rightSupport ? parseRebar(p.rightSupport) : null;
  const beamLen = p.spanLength || 4000;
  const cover = p.cover || 25;

  const items: CalcResult['items'] = [];
  let total = 0;

  // 上部通长筋 (含两端锚固, 按22G101-1)
  const hc = p.hc || 500;
  const topAnchor = calcBeamEndAnchor(top.grade, top.diameter, p.concreteGrade, p.seismicGrade, hc, cover);
  const topAnchorLen = topAnchor.canStraight ? topAnchor.straightLen : (topAnchor.bentStraightPart + topAnchor.bentBendPart);
  const topL = (beamLen + 2 * topAnchorLen) / 1000;
  const topW = top.count * topL * w(top.diameter);
  const topAnchorDesc = topAnchor.canStraight
    ? `直锚${topAnchor.straightLen}mm` : `弯锚(直段${topAnchor.bentStraightPart}+弯折${topAnchor.bentBendPart}mm)`;
  items.push({
    name: '上部通长筋', spec: p.top,
    length: `${topL.toFixed(2)}m × ${top.count} (${topAnchorDesc}×2)`,
    weight: `${topW.toFixed(2)} kg`, color: '#C0392B',
  });
  total += topW;

  // 下部通长筋 (含两端锚固, 按22G101-1)
  const botAnchor = calcBeamEndAnchor(bot.grade, bot.diameter, p.concreteGrade, p.seismicGrade, hc, cover);
  const botAnchorLen = botAnchor.canStraight ? botAnchor.straightLen : (botAnchor.bentStraightPart + botAnchor.bentBendPart);
  const botL = (beamLen + 2 * botAnchorLen) / 1000;
  const botW = bot.count * botL * w(bot.diameter);
  const botAnchorDesc = botAnchor.canStraight
    ? `直锚${botAnchor.straightLen}mm` : `弯锚(直段${botAnchor.bentStraightPart}+弯折${botAnchor.bentBendPart}mm)`;
  items.push({
    name: '下部通长筋', spec: p.bottom,
    length: `${botL.toFixed(2)}m × ${bot.count} (${botAnchorDesc}×2)`,
    weight: `${botW.toFixed(2)} kg`, color: '#C0392B',
  });
  total += botW;

  // 支座负筋 (伸入跨内 ln/3)
  if (leftR) {
    const supportLen = calcSupportRebarLength(beamLen);
    const lLen = supportLen / 1000;
    const lW = leftR.count * lLen * w(leftR.diameter);
    items.push({
      name: '左支座负筋', spec: p.leftSupport!,
      length: `${lLen.toFixed(2)}m × ${leftR.count} (ln/3=${supportLen}mm)`,
      weight: `${lW.toFixed(2)} kg`, color: '#8E44AD',
    });
    total += lW;
  }
  if (rightR) {
    const supportLen = calcSupportRebarLength(beamLen);
    const rLen = supportLen / 1000;
    const rW = rightR.count * rLen * w(rightR.diameter);
    items.push({
      name: '右支座负筋', spec: p.rightSupport!,
      length: `${rLen.toFixed(2)}m × ${rightR.count} (ln/3=${supportLen}mm)`,
      weight: `${rW.toFixed(2)} kg`, color: '#8E44AD',
    });
    total += rW;
  }

  // 箍筋 (加密区按22G101: max(2h, 500mm) from column face)
  const innerB = p.b - 2 * cover;
  const innerH = p.h - 2 * cover;
  const perimeter = 2 * (innerB + innerH) / 1000;
  const denseZoneLen = Math.max(2 * p.h, 500); // 22G101 加密区长度
  const denseCount = Math.ceil((2 * denseZoneLen) / stir.spacingDense); // 两端加密区
  const normalCount = Math.ceil(Math.max(beamLen - 2 * denseZoneLen, 0) / stir.spacingNormal);
  const stirCount = denseCount + normalCount;
  const stirW = stirCount * perimeter * w(stir.diameter) * stir.legs / 2;
  items.push({
    name: '箍筋', spec: p.stirrup,
    length: `${stirCount}根 × ${perimeter.toFixed(2)}m`,
    weight: `${stirW.toFixed(2)} kg`, color: '#27AE60',
  });
  total += stirW;

  return { items, total: `${total.toFixed(2)} kg` };
}

export function calcColumn(p: ColumnParams): CalcResult {
  const main = parseRebar(p.main);
  const stir = parseStirrup(p.stirrup);
  const colHeight = p.height || 3000;
  const cover = p.cover || 25;
  const items: CalcResult['items'] = [];
  let total = 0;

  // 纵筋 (含搭接)
  const llE = calcLlE(main.grade, main.diameter, p.concreteGrade, p.seismicGrade);
  const mainL = (colHeight + llE) / 1000;
  const mainW = main.count * mainL * w(main.diameter);
  items.push({
    name: '纵向钢筋', spec: p.main,
    length: `${mainL.toFixed(2)}m × ${main.count} (含搭接${llE}mm)`,
    weight: `${mainW.toFixed(2)} kg`, color: '#C0392B',
  });
  total += mainW;

  const innerB = p.b - 2 * cover;
  const innerH = p.h - 2 * cover;
  const perimeter = 2 * (innerB + innerH) / 1000;
  const denseCount = Math.ceil(1000 / stir.spacingDense);
  const normalCount = Math.ceil((colHeight - 1000) / stir.spacingNormal);
  const stirCount = denseCount + normalCount;
  const stirW = stirCount * perimeter * w(stir.diameter) * stir.legs / 2;
  items.push({
    name: '箍筋', spec: p.stirrup,
    length: `${stirCount}根 × ${perimeter.toFixed(2)}m`,
    weight: `${stirW.toFixed(2)} kg`, color: '#27AE60',
  });
  total += stirW;

  return { items, total: `${total.toFixed(2)} kg` };
}

export function calcSlab(p: SlabParams, slabW = 3000, slabD = 3000): CalcResult {
  const bx = parseSlabRebar(p.bottomX);
  const by = parseSlabRebar(p.bottomY);
  const tx = p.topX ? parseSlabRebar(p.topX) : null;
  const ty = p.topY ? parseSlabRebar(p.topY) : null;
  const items: CalcResult['items'] = [];
  let total = 0;

  // 底筋含伸入支座长度
  const bxAnchor = calcSlabBottomAnchor(bx.grade, bx.diameter, p.concreteGrade);
  const bxCount = Math.ceil(slabD / bx.spacing);
  const bxLen = (slabW + 2 * bxAnchor) / 1000;
  const bxW = bxCount * bxLen * w(bx.diameter);
  items.push({
    name: 'X向底筋', spec: p.bottomX,
    length: `${bxLen.toFixed(2)}m × ${bxCount} (含锚${bxAnchor}mm×2)`,
    weight: `${bxW.toFixed(2)} kg`, color: '#C0392B',
  });
  total += bxW;

  const byAnchor = calcSlabBottomAnchor(by.grade, by.diameter, p.concreteGrade);
  const byCount = Math.ceil(slabW / by.spacing);
  const byLen = (slabD + 2 * byAnchor) / 1000;
  const byW = byCount * byLen * w(by.diameter);
  items.push({
    name: 'Y向底筋', spec: p.bottomY,
    length: `${byLen.toFixed(2)}m × ${byCount} (含锚${byAnchor}mm×2)`,
    weight: `${byW.toFixed(2)} kg`, color: '#E67E22',
  });
  total += byW;

  if (tx) {
    const txCount = Math.ceil(slabD / tx.spacing);
    const txLen = slabW / 1000;
    const txW = txCount * txLen * w(tx.diameter);
    items.push({ name: 'X向面筋', spec: p.topX, length: `${txLen.toFixed(1)}m × ${txCount}`, weight: `${txW.toFixed(2)} kg`, color: '#8E44AD' });
    total += txW;
  }
  if (ty) {
    const tyCount = Math.ceil(slabW / ty.spacing);
    const tyLen = slabD / 1000;
    const tyW = tyCount * tyLen * w(ty.diameter);
    items.push({ name: 'Y向面筋', spec: p.topY, length: `${tyLen.toFixed(1)}m × ${tyCount}`, weight: `${tyW.toFixed(2)} kg`, color: '#7D3C98' });
    total += tyW;
  }

  return { items, total: `${total.toFixed(2)} kg` };
}
