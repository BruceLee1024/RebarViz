'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { BeamParams } from '@/lib/types';
import { calcBarShapes, type BarShape } from '@/lib/calc';
import { canvasPaletteColor, isDarkCanvas } from '@/lib/cs-draw';
import { createStirrupCurves, createTieBarCurves } from '@/lib/rebar-shapes';

/* ─── constants ─── */

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
const MIN_CARD_W = 260;
const MAX_CARD_W = 360;
const CARD_H = 210;
const PAD = 20;
const MIN_SEG = 32;       // minimum pixels for any segment
const BAR_LW = 3;         // bar stroke width
const DIM_LW = 0.7;       // dimension line width

const DIM_COLOR = '#1D4ED8';
const DIM_FONT = '10px "Helvetica Neue", system-ui, sans-serif';
const LABEL_FONT = 'bold 11px "Helvetica Neue", system-ui, sans-serif';
const SPEC_FONT = '10px "Helvetica Neue", system-ui, sans-serif';
const CARD_BG = '#FAFBFC';
const CARD_BORDER = '#E2E8F0';
const COL_FACE_FILL = '#E8ECF1';
const COL_FACE_DASH = '#94A3B8';

/* ─── dimension line: horizontal ─── */

function dimH(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, label: string, below = false) {
  if (Math.abs(x2 - x1) < 6) return;
  const dir = below ? 1 : -1;
  const tk = 5;
  ctx.save();
  ctx.strokeStyle = canvasPaletteColor(ctx, DIM_COLOR); ctx.fillStyle = canvasPaletteColor(ctx, DIM_COLOR);
  ctx.lineWidth = DIM_LW; ctx.font = DIM_FONT;
  ctx.beginPath();
  ctx.moveTo(x1, y); ctx.lineTo(x2, y);
  ctx.moveTo(x1, y - tk * dir); ctx.lineTo(x1, y + tk * dir);
  ctx.moveTo(x2, y - tk * dir); ctx.lineTo(x2, y + tk * dir);
  const a = Math.min(5, Math.abs(x2 - x1) * 0.15);
  ctx.moveTo(x1 + a, y - a * 0.5); ctx.lineTo(x1, y); ctx.lineTo(x1 + a, y + a * 0.5);
  ctx.moveTo(x2 - a, y - a * 0.5); ctx.lineTo(x2, y); ctx.lineTo(x2 - a, y + a * 0.5);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = below ? 'top' : 'bottom';
  ctx.fillText(label, (x1 + x2) / 2, y + dir * 3);
  ctx.restore();
}

/* ─── dimension line: vertical ─── */

function dimV(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, label: string, right = true) {
  if (Math.abs(y2 - y1) < 6) return;
  const dir = right ? 1 : -1;
  const tk = 5;
  ctx.save();
  ctx.strokeStyle = canvasPaletteColor(ctx, DIM_COLOR); ctx.fillStyle = canvasPaletteColor(ctx, DIM_COLOR);
  ctx.lineWidth = DIM_LW; ctx.font = DIM_FONT;
  ctx.beginPath();
  ctx.moveTo(x, y1); ctx.lineTo(x, y2);
  ctx.moveTo(x - tk * dir, y1); ctx.lineTo(x + tk * dir, y1);
  ctx.moveTo(x - tk * dir, y2); ctx.lineTo(x + tk * dir, y2);
  const a = Math.min(5, Math.abs(y2 - y1) * 0.15);
  ctx.moveTo(x - a * 0.5, y1 + a); ctx.lineTo(x, y1); ctx.lineTo(x + a * 0.5, y1 + a);
  ctx.moveTo(x - a * 0.5, y2 - a); ctx.lineTo(x, y2); ctx.lineTo(x + a * 0.5, y2 - a);
  ctx.stroke();
  ctx.translate(x + dir * 9, (y1 + y2) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = right ? 'bottom' : 'top';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/* ─── column face indicator: gray strip + dashed line ─── */

function colFace(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, side: 'left' | 'right' = 'left') {
  const sw = 5;
  ctx.save();
  ctx.fillStyle = isDarkCanvas(ctx) ? '#224257' : COL_FACE_FILL;
  ctx.fillRect(side === 'left' ? x - sw : x, y1, sw, y2 - y1);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = COL_FACE_DASH;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y1); ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

/* ─── rounded rect helper ─── */

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ─── ensure minimum segment px widths ─── */

function allocSegs(segs: number[], totalPx: number): number[] {
  const total = segs.reduce((s, v) => s + v, 0);
  if (total <= 0) return segs.map(() => totalPx / segs.length);
  // first pass: proportional
  let px = segs.map(s => (s / total) * totalPx);
  // second pass: enforce minimum, redistribute
  let deficit = 0;
  let flexTotal = 0;
  px = px.map((p, i) => {
    if (p < MIN_SEG && segs[i] > 0) { deficit += MIN_SEG - p; return MIN_SEG; }
    flexTotal += p;
    return p;
  });
  if (deficit > 0 && flexTotal > 0) {
    const scale = (flexTotal - deficit) / flexTotal;
    px = px.map((p, i) => (p > MIN_SEG || segs[i] === 0) ? p * Math.max(scale, 0.3) : p);
  }
  return px;
}

/* ================================================================= */
/*                        SHAPE DRAWING                              */
/* ================================================================= */

function drawShape(ctx: CanvasRenderingContext2D, shape: BarShape, ox: number, oy: number, cw: number, selected = false) {
  const area = { x: ox + PAD, y: oy + 48, w: cw - PAD * 2, h: CARD_H - 66 };

  // ── Card ──
  ctx.save();
  rrect(ctx, ox + 3, oy + 3, cw - 6, CARD_H - 6, 8);
  ctx.fillStyle = isDarkCanvas(ctx) ? (selected ? '#103e49' : '#0c2335') : (selected ? '#ECFDF5' : CARD_BG); ctx.fill();
  ctx.strokeStyle = isDarkCanvas(ctx) ? (selected ? '#22d3ee' : '#25465c') : (selected ? '#10B981' : CARD_BORDER); ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
  ctx.restore();

  // ── Header ──
  ctx.save();
  ctx.beginPath(); ctx.arc(ox + PAD + 4, oy + 16, 4, 0, Math.PI * 2);
  ctx.fillStyle = canvasPaletteColor(ctx, shape.color); ctx.fill();
  ctx.font = LABEL_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = canvasPaletteColor(ctx, '#1E293B');
  ctx.fillText(shape.name, ox + PAD + 14, oy + 16);
  ctx.fillStyle = canvasPaletteColor(ctx, '#64748B'); ctx.font = SPEC_FONT;
  const cnt = shape.count > 0 ? ` ×${shape.count}` : '';
  ctx.fillText(`${shape.spec}${cnt}   L=${Math.round(shape.totalLen)}mm`, ox + PAD + 4, oy + 34);
  ctx.restore();

  // ── Bar style ──
  ctx.save();
  ctx.strokeStyle = canvasPaletteColor(ctx, shape.color);
  ctx.lineWidth = BAR_LW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.shapeType) {

    /* ──────── 直锚通长筋 ──────── */
    case 'straight': {
      const anc = shape.anchorLen || 0;
      const body = shape.bodyLen || 0;
      const [pxA, pxB, pxA2] = allocSegs([anc, body, anc], area.w);
      const cy = area.y + area.h * 0.42;
      const x0 = area.x;
      const x1 = x0 + pxA;          // left column face
      const x2 = x1 + pxB;          // right column face
      const x3 = x2 + pxA2;         // right end

      // Column face indicators
      if (anc > 0) {
        colFace(ctx, x1, cy - 18, cy + 18, 'right');
        colFace(ctx, x2, cy - 18, cy + 18, 'left');
      }

      // Bar
      ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x3, cy); ctx.stroke();

      // Dims
      if (anc > 0) dimH(ctx, x0, x1, cy - 20, `la=${anc}`);
      dimH(ctx, x0, x3, cy + 26, `${Math.round(shape.totalLen)}`, true);
      break;
    }

    /* ──────── 弯锚通长筋 ──────── */
    case 'bentAnchor': {
      const anc = shape.anchorLen || 0;
      const body = shape.bodyLen || shape.totalLen;
      const bend = shape.bendLen || 0;
      const down = shape.bendDir !== 'up';

      const [pxA, pxB, pxA2] = allocSegs([anc, body, anc], area.w - 12);
      const bendPx = Math.min(Math.max(bend * 0.4, 22), area.h * 0.32);

      // vertical position: leave room for bend
      const cy = down ? area.y + area.h * 0.26 : area.y + area.h * 0.66;
      const bs = down ? 1 : -1;
      const x0 = area.x + 6;
      const x1 = x0 + pxA;
      const x2 = x1 + pxB;
      const x3 = x2 + pxA2;

      // Column faces
      colFace(ctx, x1, Math.min(cy, cy + bs * bendPx) - 8, Math.max(cy, cy + bs * bendPx) + 8, 'right');
      colFace(ctx, x2, Math.min(cy, cy + bs * bendPx) - 8, Math.max(cy, cy + bs * bendPx) + 8, 'left');

      // Bar: bend → horizontal → bend (continuous path)
      ctx.beginPath();
      ctx.moveTo(x0, cy + bs * bendPx);
      ctx.lineTo(x0, cy);
      ctx.lineTo(x3, cy);
      ctx.lineTo(x3, cy + bs * bendPx);
      ctx.stroke();

      // Dims
      dimH(ctx, x0, x3, down ? cy - 20 : cy + 22, `${Math.round(shape.totalLen)}`, !down);
      if (anc > 0) {
        const ay = down ? cy + bs * bendPx + 14 : cy + bs * bendPx - 14;
        dimH(ctx, x0, x1, ay, `la=${anc}`, down);
      }
      if (bend > 0) {
        dimV(ctx, x3 + 10,
          down ? cy : cy + bs * bendPx,
          down ? cy + bs * bendPx : cy,
          `15d=${bend}`);
      }
      break;
    }

    /* ──────── 支座负筋 ──────── */
    case 'support': {
      const anc = shape.anchorLen || 0;
      const body = shape.bodyLen || shape.totalLen;
      const bend = shape.bendLen || 0;
      const row = shape.supportRow || 1;
      const ratio = row === 2 ? 4 : 3;

      const segs = bend > 0 ? [bend * 0.3, anc, body] : [anc, body];
      const pxArr = allocSegs(segs, area.w - 10);

      const cy = area.y + area.h * 0.40;
      const x0 = area.x + 5;
      const cursor = x0;
      let xBendEnd = x0, xAncEnd = x0, xEnd = x0;

      if (bend > 0) {
        xBendEnd = cursor + pxArr[0];
        xAncEnd = xBendEnd + pxArr[1];
        xEnd = xAncEnd + pxArr[2];
      } else {
        xAncEnd = cursor + pxArr[0];
        xEnd = xAncEnd + pxArr[1];
      }
      const bendPx = bend > 0 ? Math.min(Math.max(bend * 0.3, 20), area.h * 0.30) : 0;

      // Column face at anchor/body boundary
      colFace(ctx, xAncEnd, cy - 18, cy + Math.max(18, bendPx + 8), 'left');

      // Bar path
      ctx.beginPath();
      if (bend > 0) {
        ctx.moveTo(x0, cy + bendPx);  // bend bottom
        ctx.lineTo(x0, cy);            // bend top → bar level
      } else {
        ctx.moveTo(x0, cy);
      }
      ctx.lineTo(xEnd, cy);
      ctx.stroke();

      // Dims
      if (bend > 0) {
        dimV(ctx, x0 - 8, cy, cy + bendPx, `15d`, false);
        dimH(ctx, x0, xAncEnd, cy - 20, `la=${anc}`);
      } else {
        dimH(ctx, x0, xAncEnd, cy - 20, `la=${anc}`);
      }
      dimH(ctx, xAncEnd, xEnd, cy + 26, `ln/${ratio}=${Math.round(body)}`, true);
      break;
    }

    /* ──────── 箍筋 ──────── */
    case 'stirrup': {
      const w = shape.width || 100;
      const h = shape.height || 200;
      const hook = shape.hookLen || 75;
      const maxD = Math.max(w, h);
      const sc = Math.min((area.w - 30) * 0.50 / maxD, (area.h - 24) * 0.50 / maxD);
      const sw = w * sc, sh = h * sc;
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2 - 22;
      const curves = createStirrupCurves({ width: w * .001, height: h * .001,
        diameter: Number(shape.spec.match(/(?:A|B|C|D|E)(\d+)/)?.[1] ?? 8),
        cornerRadius: (shape.bendRadius || 20) * .001, plane: 'yz' });
      [curves.outerCurve, ...curves.hookCurves].forEach((curve, i) => {
        ctx.setLineDash(i === 2 ? [3, 2] : []);
        ctx.beginPath();
        curve.getPoints(160).forEach((p, index) => {
          const x = cx + p.z * 1000 * sc, y = cy - p.y * 1000 * sc;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Dims
      dimH(ctx, cx - sw / 2, cx + sw / 2, cy + sh / 2 + 16, `中心线b=${Math.round(w)}`, true);
      dimV(ctx, cx + sw / 2 + 12, cy - sh / 2, cy + sh / 2, `h=${Math.round(h)}`);
      ctx.save();
      ctx.fillStyle = canvasPaletteColor(ctx, DIM_COLOR);
      ctx.font = DIM_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`135° · 每端平直段 ${Math.round(hook)}mm`, cx, area.y + area.h - 28);
      ctx.fillText(`圆弧 ${(curves.hookCurves[0].path.curves[0].getLength() * 1000).toFixed(1)}mm · 中心线R=${Math.round(shape.bendRadius || 0)}mm`, cx, area.y + area.h - 14);
      ctx.restore();
      break;
    }

    /* ──────── 拉筋 ──────── */
    case 'tie': {
      const body = shape.bodyLen || 100;
      const hook = shape.hookLen || 75;
      if (body <= 0) break;

      const diameter = Number(shape.spec.match(/(?:A|B|C|D|E)(\d+)/)?.[1] ?? 6);
      const r = shape.bendRadius || 3 * diameter;
      // Recover the bend-centre spacing from the schedule's developed body length.
      // Its longitudinal-bar diameter does not alter the resulting 2D bar path.
      const sideDiameter = Math.max(2 * (r - diameter), 1);
      const eccentricity = Math.max(r - sideDiameter / 2 - diameter / 2, 0);
      const { fullCurve } = createTieBarCurves({ sideOffset: (body / 2 + eccentricity) * .001,
        tieDiameter: diameter, sideBarDiameter: sideDiameter });
      const points = fullCurve.getPoints(200);
      const minU = Math.min(...points.map(p => p.z)), maxU = Math.max(...points.map(p => p.z));
      const minV = Math.min(...points.map(p => p.y)), maxV = Math.max(...points.map(p => p.y));
      const sc = Math.min((area.w - 36) / ((maxU - minU) * 1000),
        (area.h - 86) / ((maxV - minV) * 1000));
      const cx = area.x + area.w / 2;
      const cy = area.y + 18 + maxV * 1000 * sc;
      ctx.beginPath();
      points.forEach((p, index) => {
        const x = cx + p.z * 1000 * sc, y = cy - p.y * 1000 * sc;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      dimH(ctx, cx - body * sc / 2, cx + body * sc / 2, cy - minV * 1000 * sc + 14,
        `主体=${Math.round(body)} · L=${Math.round(shape.totalLen)}`, true);
      ctx.save();
      ctx.fillStyle = canvasPaletteColor(ctx, DIM_COLOR);
      ctx.font = DIM_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`两端135° · 每端平直段 ${Math.round(hook)}mm`, cx, area.y + area.h - 28);
      ctx.fillText(`每端圆弧 ${(r * 3 * Math.PI / 4).toFixed(1)}mm · 中心线R=${Math.round(r)}mm`, cx, area.y + area.h - 14);
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

/* ================================================================= */
/*                        COMPONENT                                  */
/* ================================================================= */

export function BarBendingSchedule({
  params,
  shapes: shapesProp,
  selectedSetId,
  onSelectShape,
  title = '钢筋弯折详图 (BBS)',
}: {
  params?: BeamParams;
  shapes?: BarShape[];
  selectedSetId?: string | null;
  onSelectShape?: (shape: BarShape) => void;
  title?: string;
}) {
  const shapes = useMemo(() => shapesProp ?? (params ? calcBarShapes(params) : []), [params, shapesProp]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cols, cardW, totalW, totalH } = useMemo(() => {
    if (containerW === 0 || shapes.length === 0)
      return { cols: 1, cardW: MIN_CARD_W, totalW: 0, totalH: 0 };
    const maxCols = Math.max(1, Math.floor(containerW / MIN_CARD_W));
    const c = Math.min(shapes.length, maxCols);
    const w = Math.min(MAX_CARD_W, Math.floor(containerW / c));
    const r = Math.ceil(shapes.length / c);
    return { cols: c, cardW: w, totalW: c * w, totalH: r * CARD_H };
  }, [containerW, shapes.length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalW === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = totalW * DPR;
    canvas.height = totalH * DPR;
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${totalH}px`;
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, totalW, totalH);
    shapes.forEach((shape, i) => {
      const selected = !!shape.setId && (
        selectedSetId === shape.setId
        || (shape.setId === 'beam.stirrup' && selectedSetId?.startsWith('beam.stirrup.'))
        || (shape.setId === 'column.stirrup' && selectedSetId?.startsWith('column.stirrup.'))
      );
      drawShape(ctx, shape, (i % cols) * cardW, Math.floor(i / cols) * CARD_H, cardW, selected);
    });
  }, [shapes, totalW, totalH, cols, cardW, selectedSetId]);

  useEffect(draw, [draw]);

  if (shapes.length === 0) return null;

  return (
    <div ref={wrapRef}>
      <h2 className="text-sm font-semibold text-primary mb-3">{title}</h2>
      <div className="overflow-x-auto">
        <canvas
          ref={canvasRef}
          className={onSelectShape ? 'mx-auto cursor-pointer' : 'mx-auto'}
          onClick={(event) => {
            if (!onSelectShape || totalW === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const col = Math.floor(x / cardW);
            const row = Math.floor(y / CARD_H);
            const index = row * cols + col;
            const shape = shapes[index];
            if (shape) onSelectShape(shape);
          }}
        />
      </div>
    </div>
  );
}
