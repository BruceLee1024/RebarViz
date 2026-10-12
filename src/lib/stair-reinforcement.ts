import * as THREE from 'three';
import type { StairParams } from './types';
import { parseSlabRebar } from './rebar';
import { normalThicknessOffset } from './reinforcement-layout';
import { roundedRebarPath } from './rebar-curve';

function atLayout(params:StairParams) {
  const S=.001;
  const {stepCount:n,stepHeight:hMM,stepWidth:bMM,slabThickness:tMM,flightWidth:wMM,beamH:beamHMM,cover:coverMM}=params;
  const h=hMM*S,b=bMM*S,t=tMM*S,w=wMM*S,beamH=beamHMM*S,cover=coverMM*S;
  const botR=parseSlabRebar(params.bottomBar),topR=parseSlabRebar(params.topBar),distR=parseSlabRebar(params.distBar);
  const totalRise=n*h,totalRun=n*b,angle=Math.atan2(totalRise,totalRun),slopeLen=Math.hypot(totalRise,totalRun),slabLen=slopeLen,slope=totalRise/totalRun;
  const tCosA=normalThicknessOffset(t,angle),cvBot=(cover+botR.diameter*S/2)/Math.cos(angle),cvTop=(cover+topR.diameter*S/2)/Math.cos(angle);
  const bot5d=5*botR.diameter*S,topHook15d=15*topR.diameter*S;
  const botBarZs = (() => {
    const spacing = botR.spacing * S;
    const bars: number[] = [];
    for (let z = -w / 2 + cover + botR.diameter * S / 2; z <= w / 2 - cover - botR.diameter * S / 2; z += spacing) {
      bars.push(z);
    }
    return bars;
  })();
  const topBarZs = (() => {
    const spacing = topR.spacing * S;
    const bars: number[] = [];
    for (let z = -w / 2 + cover + topR.diameter * S / 2; z <= w / 2 - cover - topR.diameter * S / 2; z += spacing) {
      bars.push(z);
    }
    return bars;
  })();
  const distBarPositions = (() => {
    const spacing = distR.spacing * S;
    const positions: { x: number; y: number; isFlat: boolean }[] = [];
    // 沿斜面方向每隔 spacing 布一根
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    for (let s = spacing; s < slabLen - spacing / 2; s += spacing) {
      positions.push({ x: s * cosA, y: s * sinA, isFlat: false });
    }
    return positions;
  })();
  const botBarPath = (() => {
    const botY = (x: number) => slope * x - tCosA + cvBot;

    // 低端: 梁[0,b], 中线X=b/2, 梁内侧边X=b
    // 过中线: X ≤ b/2;  伸入≥5d: X ≤ b - bot5d;  取较小值=更深入
    const lowAncX = Math.max(Math.min(b / 2, b - bot5d), cover);

    // 高端: 梁[totalRun-b, totalRun], 中线X=totalRun-b/2, 梁内侧边X=totalRun-b
    // 过中线: X ≥ totalRun-b/2;  伸入≥5d: X ≥ totalRun-b+bot5d;  取较大值=更深入
    const highAncX = Math.min(Math.max(totalRun - b / 2, totalRun - b + bot5d), totalRun - cover);

    return [
      new THREE.Vector3(lowAncX, botY(lowAncX), 0),     // 低端锚固末端(延长线上)
      new THREE.Vector3(highAncX, botY(highAncX), 0),   // 高端锚固末端(延长线上)
    ];
  })();
  const topBarPaths = (() => {
    const topY = (x: number) => slope * x - cvTop;
    const cosA = Math.cos(angle);
    const dxLn4 = (slabLen / 4) * cosA;  // ln/4 水平投影

    // === 低端负筋 ===
    // 梁[0,b]: 延长线伸入梁至外侧边附近
    const lowAncX = cover;                                    // 锚固末端(梁外侧边)
    const lowAncY = topY(lowAncX);                            // 延长线上的Y
    const lowHookBottom = Math.max(lowAncY - topHook15d, h - beamH + cover);
    const lowEndX = Math.min(totalRun - b, b + dxLn4);       // 斜段末端(ln/4)

    const low: THREE.Vector3[] = [
      new THREE.Vector3(lowAncX, lowHookBottom, 0),           // ① 弯钩底(15d向下)
      new THREE.Vector3(lowAncX, lowAncY, 0),                  // ② 弯折点(延长线上)
      new THREE.Vector3(lowEndX, topY(lowEndX), 0),            // ③ 斜段末端(ln/4)
    ];

    // === 高端负筋 ===
    // 梁[totalRun-b, totalRun]: 延长线伸入梁至外侧边附近
    const highAncX = totalRun - cover;
    const highAncY = topY(highAncX);
    const highHookBottom = Math.max(highAncY - topHook15d, totalRise - beamH + cover);
    const highStartX = Math.max(b, totalRun - b - dxLn4);

    const high: THREE.Vector3[] = [
      new THREE.Vector3(highStartX, topY(highStartX), 0),     // ① 斜段起端(ln/4)
      new THREE.Vector3(highAncX, highAncY, 0),                // ② 弯折点(延长线上)
      new THREE.Vector3(highAncX, highHookBottom, 0),          // ③ 弯钩底(15d向下)
    ];

    return { low, high };
  })();
  const bottomCurve=roundedRebarPath(botBarPath,botR.diameter*S*4);
  const topCurves=[topBarPaths.low,topBarPaths.high].map(path=>roundedRebarPath(path,topR.diameter*S*4));
  return {botBarZs,topBarZs,distBarPositions,botBarPath,topBarPaths,bottomCurve,topCurves,botR,topR,distR,distLengthM:w-2*cover};
}

function btLayout(params:StairParams) {
  const S=.001;
  const {stepCount:n,stepHeight:hMM,stepWidth:bMM,slabThickness:tMM,flightWidth:wMM,beamB:beamBMM,beamH:beamHMM,cover:coverMM}=params;
  const h=hMM*S,b=bMM*S,t=tMM*S,w=wMM*S,beamB=beamBMM*S,beamH=beamHMM*S,cover=coverMM*S;
  const botFlat=(params.botFlatLen??700)*S;
  const botR=parseSlabRebar(params.bottomBar),topR=parseSlabRebar(params.topBar),distR=parseSlabRebar(params.distBar);
  const totalRise=n*h,totalRun=n*b,angle=Math.atan2(totalRise,totalRun),slopeLen=Math.hypot(totalRise,totalRun),slope=totalRise/totalRun;
  const tCosA=normalThicknessOffset(t,angle),cvBot=(cover+botR.diameter*S/2)/Math.cos(angle),cvTop=(cover+topR.diameter*S/2)/Math.cos(angle);
  const cvBotFlat=cover+botR.diameter*S/2,cvTopFlat=cover+topR.diameter*S/2,bot5d=5*botR.diameter*S,topHook15d=15*topR.diameter*S;
  const botBarZs = (() => {
    const spacing = botR.spacing * S;
    const bars: number[] = [];
    for (let z = -w / 2 + cover + botR.diameter * S / 2; z <= w / 2 - cover - botR.diameter * S / 2; z += spacing) bars.push(z);
    return bars;
  })();
  const topBarZs = (() => {
    const spacing = topR.spacing * S;
    const bars: number[] = [];
    for (let z = -w / 2 + cover + topR.diameter * S / 2; z <= w / 2 - cover - topR.diameter * S / 2; z += spacing) bars.push(z);
    return bars;
  })();
  const distBarPositions = (() => {
    const spacing = distR.spacing * S;
    const positions: { x: number; y: number; isFlat: boolean }[] = [];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    for (let x = -botFlat + spacing; x < -spacing / 2; x += spacing) {
      positions.push({ x, y: 0, isFlat: true });
    }
    const visibleSlopeArcLen = (totalRun - beamB) / cosA;
    for (let s = spacing; s < visibleSlopeArcLen - spacing / 2; s += spacing) {
      positions.push({ x: s * cosA, y: s * sinA, isFlat: false });
    }
    return positions;
  })();
  const botBarPath = (() => {
    const botAncHorizLow = Math.max(beamB / 2, bot5d);
    const yFlat = -t + cvBotFlat;
    const ySlopeAt0 = -tCosA + cvBot;
    // High anchor: pass beam centreline or >=5d from inner face, whichever is deeper (same as AT)
    const highAncX = Math.min(
      Math.max(totalRun - beamB / 2, totalRun - beamB + bot5d),
      totalRun - cover,
    );
    const highAncY = slope * highAncX - tCosA + cvBot;
    return [
      new THREE.Vector3(-botFlat - botAncHorizLow, yFlat, 0),
      new THREE.Vector3(-botFlat, yFlat, 0),
      new THREE.Vector3(0, yFlat, 0),          // keep horizontal to flat/slope junction
      new THREE.Vector3(0, ySlopeAt0, 0),      // kink down to slope bottom surface
      new THREE.Vector3(highAncX, highAncY, 0),
    ];
  })();
  const topBarPaths = (() => {
    const cosA = Math.cos(angle);
    const topY = (x: number) => slope * x - cvTop;
    // Low end: from inside low beam → flat plate top → slope ln/4
    const lowAncX = -botFlat - (beamB - cover);
    const lowAncY = -cvTopFlat;
    const lowHookBottom = lowAncY - topHook15d;
    const ln = botFlat + slopeLen;
    const ln4 = ln / 4;
    const low: THREE.Vector3[] = [
      new THREE.Vector3(lowAncX, lowHookBottom, 0),
      new THREE.Vector3(lowAncX, lowAncY, 0),
      new THREE.Vector3(-botFlat, -cvTopFlat, 0),
    ];
    if (ln4 <= botFlat) {
      // bar stays entirely in flat section
      low.push(new THREE.Vector3(-botFlat + ln4, -cvTopFlat, 0));
    } else {
      // bar crosses from flat into slope — add junction kink at X=0
      const slopeLen4 = ln4 - botFlat;
      const lowEndX = slopeLen4 * cosA;
      low.push(new THREE.Vector3(0, -cvTopFlat, 0));       // end of flat section (horizontal)
      low.push(new THREE.Vector3(lowEndX, topY(lowEndX), 0)); // continue along slope top
    }
    // High end: AT-style — outer face at X=totalRun, anchor near outer face
    const highAncX = totalRun - cover;
    const highAncY = topY(highAncX);
    const highHookBottom = Math.max(highAncY - topHook15d, totalRise - beamH + cover);
    const highStartX = Math.max(0, totalRun - beamB - (slopeLen / 4) * cosA);
    const high: THREE.Vector3[] = [
      new THREE.Vector3(highStartX, topY(highStartX), 0),
      new THREE.Vector3(highAncX, highAncY, 0),
      new THREE.Vector3(highAncX, highHookBottom, 0),
    ];
    return { low, high };
  })();
  const bottomCurve=roundedRebarPath(botBarPath,botR.diameter*S*4);
  const topCurves=[topBarPaths.low,topBarPaths.high].map(path=>roundedRebarPath(path,topR.diameter*S*4));
  return {botBarZs,topBarZs,distBarPositions,botBarPath,topBarPaths,bottomCurve,topCurves,botR,topR,distR,distLengthM:w-2*cover};
}

/** The represented AT/BT centreline paths, in metres, shared by model and quantities. */
export function stairReinforcement(p:StairParams) { return p.stairType==='BT'?btLayout(p):atLayout(p); }
