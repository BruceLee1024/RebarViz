'use client';

import { useRef, useEffect } from 'react';
import type { BeamParams, ColumnParams, SlabParams } from '@/lib/types';
import { parseRebar, parseStirrup, parseSlabRebar } from '@/lib/rebar';

// Beam: cutPosition is in meters, range [-2, 2] (beam is 4m, centered at 0)
// Support zone: within 0.6m of each end (dense stirrup zone)
// Left support rebar zone: within 1.0m of left end
// Right support rebar zone: within 1.0m of right end
export function BeamCrossSection({ params, cutPosition }: { params: BeamParams; cutPosition?: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const maxDim = Math.max(params.b, params.h);
    const scale = 180 / maxDim;
    const dw = params.b * scale, dh = params.h * scale;
    const cover = (params.cover || 25) * scale;

    // Determine zone based on cut position
    const cutX = cutPosition ?? 0; // meters from center, range [-2, 2]
    const beamLenM = (params.spanLength || 4000) / 1000;
    const halfLen = beamLenM / 2;
    const distFromLeft = cutX + halfLen;
    const distFromRight = beamLenM - distFromLeft;
    const supportRebarZone = beamLenM / 3; // ln/3
    const inLeftSupport = distFromLeft <= supportRebarZone;
    const inRightSupport = distFromRight <= supportRebarZone;
    // 22G101: 加密区 = max(2h, 500mm) from column face
    const denseZoneM = Math.max(2 * params.h, 500) / 1000;
    const inDenseZone = distFromLeft <= denseZoneM || distFromRight <= denseZoneM;
    const hasCut = cutPosition !== null && cutPosition !== undefined;

    // Concrete
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);

    // Dimensions
    ctx.fillStyle = '#64748B';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${params.b}`, cx, cy + dh / 2 + 18);
    ctx.save();
    ctx.translate(cx - dw / 2 - 18, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${params.h}`, 0, 0);
    ctx.restore();

    const topR = parseRebar(params.top);
    const botR = parseRebar(params.bottom);
    const stir = parseStirrup(params.stirrup);
    const leftR = params.leftSupport ? parseRebar(params.leftSupport) : null;
    const rightR = params.rightSupport ? parseRebar(params.rightSupport) : null;
    const innerW = dw - 2 * cover;

    // Top rebars (always present - through bars)
    ctx.fillStyle = '#C0392B';
    const topY = cy - dh / 2 + cover;
    const topSpacing = innerW / Math.max(topR.count - 1, 1);
    for (let i = 0; i < topR.count; i++) {
      const x = cx - innerW / 2 + i * topSpacing;
      ctx.beginPath();
      ctx.arc(x, topY, Math.max(topR.diameter * scale / 2, 4), 0, Math.PI * 2);
      ctx.fill();
    }

    // Support rebars (only when cut is in support zone)
    const showLeftSupport = hasCut ? inLeftSupport : !!leftR;
    const showRightSupport = hasCut ? inRightSupport : !!rightR;
    const supportR = showLeftSupport ? leftR : showRightSupport ? rightR : null;

    if (supportR && (showLeftSupport || showRightSupport)) {
      ctx.fillStyle = '#8E44AD';
      const supportY = topY + topR.diameter * scale * 1.2;
      const supportSpacing = innerW / Math.max(supportR.count - 1, 1);
      for (let i = 0; i < supportR.count; i++) {
        const x = cx - innerW / 2 + i * supportSpacing;
        ctx.beginPath();
        ctx.arc(x, supportY, Math.max(supportR.diameter * scale / 2, 4), 0, Math.PI * 2);
        ctx.fill();
      }
      // Label
      ctx.fillStyle = '#8E44AD';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const supportLabel = showLeftSupport ? `左支座: ${params.leftSupport}` : `右支座: ${params.rightSupport}`;
      ctx.fillText(supportLabel, cx + dw / 2 + 8, supportY + 4);
    }

    // Bottom rebars
    ctx.fillStyle = '#C0392B';
    const botY = cy + dh / 2 - cover;
    const botSpacing = innerW / Math.max(botR.count - 1, 1);
    for (let i = 0; i < botR.count; i++) {
      const x = cx - innerW / 2 + i * botSpacing;
      ctx.beginPath();
      ctx.arc(x, botY, Math.max(botR.diameter * scale / 2, 4), 0, Math.PI * 2);
      ctx.fill();
    }

    // Stirrup outline
    ctx.strokeStyle = '#27AE60';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(inDenseZone || !hasCut ? [4, 3] : [8, 5]);
    ctx.strokeRect(cx - dw / 2 + cover / 2, cy - dh / 2 + cover / 2, dw - cover, dh - cover);
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#C0392B';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`上: ${params.top}`, cx + dw / 2 + 8, topY + 4);
    ctx.fillText(`下: ${params.bottom}`, cx + dw / 2 + 8, botY + 4);
    ctx.fillStyle = '#27AE60';
    const stirLabel = hasCut
      ? `箍: Φ${stir.diameter}@${inDenseZone ? stir.spacingDense : stir.spacingNormal} (${inDenseZone ? '加密区' : '非加密区'})`
      : `箍: ${params.stirrup}`;
    ctx.fillText(stirLabel, cx + dw / 2 + 8, cy + 4);

    // Cut position indicator
    if (hasCut) {
      ctx.fillStyle = '#3B82F6';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`剖切位置: ${distFromLeft.toFixed(1)}m`, cx, cy - dh / 2 - 10);
    }
  }, [params, cutPosition]);

  return <canvas ref={ref} width={400} height={280} className="max-w-full" />;
}

// Column: cutPosition is in meters, range [0, 3] (column height 3m)
// Dense zone: bottom 0.5m and top 0.5m
export function ColumnCrossSection({ params, cutPosition }: { params: ColumnParams; cutPosition?: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const maxDim = Math.max(params.b, params.h);
    const scale = 180 / maxDim;
    const dw = params.b * scale, dh = params.h * scale;
    const cover = (params.cover || 25) * scale;

    const cutY = cutPosition ?? 1.5;
    const hasCut = cutPosition !== null && cutPosition !== undefined;
    const colH = (params.height || 3000) * 0.001;
    const inDenseZone = cutY <= 0.5 || cutY >= (colH - 0.5);

    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);

    ctx.fillStyle = '#64748B';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${params.b}`, cx, cy + dh / 2 + 18);
    ctx.save();
    ctx.translate(cx - dw / 2 - 18, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${params.h}`, 0, 0);
    ctx.restore();

    const mainR = parseRebar(params.main);
    const stir = parseStirrup(params.stirrup);
    const innerW = dw - 2 * cover;
    const innerH = dh - 2 * cover;
    const perSide = Math.max(Math.round(mainR.count / 4), 2);

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < perSide; i++) pts.push({ x: -innerW / 2 + (innerW * i) / (perSide - 1), y: -innerH / 2 });
    for (let i = 1; i < perSide; i++) pts.push({ x: innerW / 2, y: -innerH / 2 + (innerH * i) / (perSide - 1) });
    for (let i = 1; i < perSide; i++) pts.push({ x: innerW / 2 - (innerW * i) / (perSide - 1), y: innerH / 2 });
    for (let i = 1; i < perSide - 1; i++) pts.push({ x: -innerW / 2, y: innerH / 2 - (innerH * i) / (perSide - 1) });

    ctx.fillStyle = '#C0392B';
    pts.slice(0, mainR.count).forEach(p => {
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, Math.max(mainR.diameter * scale / 2, 4), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = '#27AE60';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(inDenseZone || !hasCut ? [4, 3] : [8, 5]);
    ctx.strokeRect(cx - dw / 2 + cover / 2, cy - dh / 2 + cover / 2, dw - cover, dh - cover);
    ctx.setLineDash([]);

    ctx.fillStyle = '#C0392B';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`纵筋: ${params.main}`, cx + dw / 2 + 8, cy - 6);
    ctx.fillStyle = '#27AE60';
    const stirLabel = hasCut
      ? `箍: Φ${stir.diameter}@${inDenseZone ? stir.spacingDense : stir.spacingNormal} (${inDenseZone ? '加密区' : '非加密区'})`
      : `箍筋: ${params.stirrup}`;
    ctx.fillText(stirLabel, cx + dw / 2 + 8, cy + 12);

    if (hasCut) {
      ctx.fillStyle = '#3B82F6';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`剖切高度: ${(cutY * 1000).toFixed(0)}mm`, cx, cy - dh / 2 - 10);
    }
  }, [params, cutPosition]);

  return <canvas ref={ref} width={400} height={280} className="max-w-full" />;
}

export function SlabCrossSection({ params }: { params: SlabParams }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const stripW = 600;
    const scale = 220 / stripW;
    const dw = stripW * scale;
    const dh = params.thickness * scale;
    const cover = (params.cover || 15) * scale;

    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.strokeRect(cx - dw / 2, cy - dh / 2, dw, dh);

    ctx.fillStyle = '#64748B';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${params.thickness}mm`, cx + dw / 2 + 30, cy);

    const bx = parseSlabRebar(params.bottomX);
    const by = parseSlabRebar(params.bottomY);
    const tx = params.topX ? parseSlabRebar(params.topX) : null;

    const bxSpacing = bx.spacing * scale;
    const bxY = cy + dh / 2 - cover;
    ctx.fillStyle = '#C0392B';
    for (let x = cx - dw / 2 + cover; x <= cx + dw / 2 - cover; x += bxSpacing) {
      ctx.beginPath();
      ctx.arc(x, bxY, Math.max(bx.diameter * scale / 2, 3), 0, Math.PI * 2);
      ctx.fill();
    }

    const bySpacing = by.spacing * scale;
    const byY = bxY - bx.diameter * scale;
    ctx.strokeStyle = '#E67E22';
    ctx.lineWidth = 1.5;
    for (let x = cx - dw / 2 + cover; x <= cx + dw / 2 - cover; x += bySpacing) {
      const r = Math.max(by.diameter * scale / 2, 3);
      ctx.beginPath();
      ctx.moveTo(x - r, byY - r); ctx.lineTo(x + r, byY + r);
      ctx.moveTo(x - r, byY + r); ctx.lineTo(x + r, byY - r);
      ctx.stroke();
    }

    if (tx) {
      const txSpacing = tx.spacing * scale;
      const txY = cy - dh / 2 + cover;
      ctx.fillStyle = '#8E44AD';
      for (let x = cx - dw / 2 + cover; x <= cx + dw / 2 - cover; x += txSpacing) {
        ctx.beginPath();
        ctx.arc(x, txY, Math.max(tx.diameter * scale / 2, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const labelX = cx + dw / 2 + 8;
    ctx.fillStyle = '#C0392B';
    ctx.fillText(`X底: ${params.bottomX}`, labelX, bxY + 3);
    ctx.fillStyle = '#E67E22';
    ctx.fillText(`Y底: ${params.bottomY}`, labelX, byY + 3);
    if (tx) {
      ctx.fillStyle = '#8E44AD';
      ctx.fillText(`X面: ${params.topX}`, labelX, cy - dh / 2 + cover + 3);
    }
  }, [params]);

  return <canvas ref={ref} width={420} height={200} className="max-w-full" />;
}
