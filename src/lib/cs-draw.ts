/**
 * cs-draw.ts — 截面配筋图绘图工具库
 * 纯函数，不依赖 React。供 CrossSection.tsx 各构件截面图调用。
 */

// ─── HiDPI 适配 ──────────────────────────────────────────────────
export function isDarkCanvas(ctx: CanvasRenderingContext2D): boolean {
  return !!ctx.canvas.closest('.rv-theme');
}

export function canvasPaletteColor(ctx: CanvasRenderingContext2D, color: string): string {
  if (!isDarkCanvas(ctx)) return color;
  const palette: Record<string, string> = {
    '#C0392B': '#f87171', '#E67E22': '#fbbf77', '#2980B9': '#6ab7f6',
    '#8E44AD': '#c4b5fd', '#27AE60': '#61dbaa', '#1E8449': '#61dbaa',
    '#1ABC9C': '#52d4c8', '#1D4ED8': '#7dd3fc', '#64748B': '#9db7cb',
    '#1E293B': '#dcebf6', '#334155': '#b5ccdc', '#475569': '#a3bdcf',
  };
  return palette[color.toUpperCase()] ?? color;
}

/** 设置 canvas 的物理像素尺寸以适配 Retina 屏幕，返回 ctx */
export function setupHiDPI(
  canvas: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  canvas.style.width = `${logicalW}px`;
  canvas.style.height = `${logicalH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  return ctx;
}

// ─── 混凝土截面 ──────────────────────────────────────────────────
/** 绘制混凝土截面矩形（浅灰填充 + 边框） */
export function drawConcreteSection(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  w: number, h: number,
  dark = false,
) {
  ctx.fillStyle = dark || isDarkCanvas(ctx) ? '#112c40' : '#F1F5F9';
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

// ─── 钢筋圆点 ──────────────────────────────────────────────────
/** 绘制单根钢筋截面圆点（填充 + 深色描边，更立体） */
export function drawRebarDot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  r: number, color: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = canvasPaletteColor(ctx, color);
  ctx.fill();
  // 深色描边
  ctx.strokeStyle = darken(color, 0.3);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ─── 钢筋叉号（板筋垂直方向表示） ──────────────────────────────
export function drawRebarCross(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  r: number, color: string,
) {
  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
  ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r);
  ctx.stroke();
}

// ─── 箍筋（开口圆角中心线 + 135°弯钩） ──────────────────────────────
/**
 * 绘制箍筋截面符号：三角圆弧本体 + 同一搭接角的双 135° 弯钩。
 * 截面图表达的是箍筋形状语义，不在四个角重复画弯钩。
 * @param x  矩形左上角 x
 * @param y  矩形左上角 y
 * @param w  矩形宽
 * @param h  矩形高
 * @param hookLen 弯钩延伸长度（像素）
 */
export function drawStirrup(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  color: string,
  hookLen = 8,
  cornerRadius?: number,
) {
  const r = cornerRadius ?? Math.min(Math.max(Math.min(w, h) * 0.08, 4), Math.min(w, h) * 0.22);
  const tail = hookLen;
  const sq = Math.SQRT1_2;
  ctx.save();
  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 1.7;
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The body has three corners. Two open 135° hooks form the overlapped fourth.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.stroke();

  // Rear end is dashed in this projection: depth overlap is not a welded joint.
  ctx.save();
  ctx.setLineDash([3, 2]);
  ctx.globalAlpha *= .65;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + r, y + r, r, -Math.PI / 2, -Math.PI * 5 / 4, true);
  ctx.lineTo(x + r - r * sq + tail * sq, y + r + r * sq + tail * sq);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 7 / 4);
  ctx.lineTo(x + r + r * sq + tail * sq, y + r - r * sq + tail * sq);
  ctx.stroke();
  ctx.restore();
}

// ─── 柱复合箍筋 — 内箍/拉筋 ────────────────────────────────────
/**
 * 绘制复合箍筋的内拉筋
 * @param legs  箍筋肢数（2=仅外箍, 4=外箍+2根拉筋, 6=外箍+4根拉筋 ...）
 * @param sx    外箍左上角 x
 * @param sy    外箍左上角 y
 * @param sw    外箍宽
 * @param sh    外箍高
 */
export function drawInnerTies(
  ctx: CanvasRenderingContext2D,
  legs: number,
  sx: number, sy: number,
  sw: number, sh: number,
  color: string,
  hookLen = 6,
) {
  if (legs <= 2) return; // 2肢箍无内拉筋

  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([]);

  // 内拉筋数 = legs - 2（外箍占2肢）
  // X方向拉筋（竖向穿过截面）
  const xTies = Math.floor((legs - 2) / 2);
  // Y方向拉筋
  const yTies = Math.ceil((legs - 2) / 2);

  // X 方向拉筋（水平线 + 两端弯钩）
  for (let i = 0; i < xTies; i++) {
    const x = sx + sw * (i + 1) / (xTies + 1);
    // 竖线
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x, sy + sh);
    ctx.stroke();
    // 上端弯钩（向右延伸）
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x + hookLen, sy + hookLen);
    ctx.stroke();
    // 下端弯钩（向左延伸）
    ctx.beginPath();
    ctx.moveTo(x, sy + sh);
    ctx.lineTo(x - hookLen, sy + sh - hookLen);
    ctx.stroke();
  }

  // Y 方向拉筋（水平线 + 两端弯钩）
  for (let i = 0; i < yTies; i++) {
    const y = sy + sh * (i + 1) / (yTies + 1);
    // 横线
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + sw, y);
    ctx.stroke();
    // 左端弯钩（向下延伸）
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + hookLen, y + hookLen);
    ctx.stroke();
    // 右端弯钩（向上延伸）
    ctx.beginPath();
    ctx.moveTo(sx + sw, y);
    ctx.lineTo(sx + sw - hookLen, y - hookLen);
    ctx.stroke();
  }
}

// ─── 尺寸标注线 ────────────────────────────────────────────────
/**
 * 绘制带箭头的尺寸标注线
 * @param side  标注线偏移方向: 'left'|'right'|'top'|'bottom'
 * @param offset 标注线到截面的偏移距离
 */
export function drawDimLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  label: string,
  side: 'left' | 'right' | 'top' | 'bottom' = 'bottom',
  offset = 14,
) {
  const color = '#64748B';
  const arrowSize = 4;
  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.fillStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.font = '10px system-ui, sans-serif';

  let ax1: number, ay1: number, ax2: number, ay2: number;

  if (side === 'bottom' || side === 'top') {
    const sign = side === 'bottom' ? 1 : -1;
    const oy = side === 'bottom' ? Math.max(y1, y2) + offset : Math.min(y1, y2) - offset;
    ax1 = x1; ay1 = oy;
    ax2 = x2; ay2 = oy;
    // 引出线
    ctx.beginPath();
    ctx.moveTo(x1, y1 + sign * 2); ctx.lineTo(x1, oy + sign * 3);
    ctx.moveTo(x2, y2 + sign * 2); ctx.lineTo(x2, oy + sign * 3);
    ctx.stroke();
  } else {
    const sign = side === 'right' ? 1 : -1;
    const ox = side === 'right' ? Math.max(x1, x2) + offset : Math.min(x1, x2) - offset;
    ax1 = ox; ay1 = y1;
    ax2 = ox; ay2 = y2;
    // 引出线
    ctx.beginPath();
    ctx.moveTo(x1 + sign * 2, y1); ctx.lineTo(ox + sign * 3, y1);
    ctx.moveTo(x2 + sign * 2, y2); ctx.lineTo(ox + sign * 3, y2);
    ctx.stroke();
  }

  // 标注线
  ctx.beginPath();
  ctx.moveTo(ax1, ay1);
  ctx.lineTo(ax2, ay2);
  ctx.stroke();

  // 箭头
  drawArrowHead(ctx, ax1, ay1, ax2, ay2, arrowSize);
  drawArrowHead(ctx, ax2, ay2, ax1, ay1, arrowSize);

  // 文字
  const mx = (ax1 + ax2) / 2;
  const my = (ay1 + ay2) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (side === 'bottom') {
    ctx.fillText(label, mx, my + 10);
  } else if (side === 'top') {
    ctx.fillText(label, mx, my - 10);
  } else if (side === 'left') {
    ctx.save();
    ctx.translate(mx - 10, my);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(mx + 10, my);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  size: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(
    fromX + size * Math.cos(angle - Math.PI / 6),
    fromY + size * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(
    fromX + size * Math.cos(angle + Math.PI / 6),
    fromY + size * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

// ─── 保护层标注 ──────────────────────────────────────────────────
/** 在截面左下角绘制保护层厚度标注（小三角标记） */
export function drawCoverDim(
  ctx: CanvasRenderingContext2D,
  sectionLeft: number, sectionBottom: number,
  coverPx: number,
  coverMm: number,
) {
  const color = '#94A3B8';
  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.fillStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 2]);

  // 水平保护层线
  const y2 = sectionBottom - coverPx;
  ctx.beginPath();
  ctx.moveTo(sectionLeft - 6, y2);
  ctx.lineTo(sectionLeft + coverPx + 6, y2);
  ctx.stroke();

  // 竖直保护层线
  const x2 = sectionLeft + coverPx;
  ctx.beginPath();
  ctx.moveTo(x2, sectionBottom + 6);
  ctx.lineTo(x2, sectionBottom - coverPx - 6);
  ctx.stroke();

  ctx.setLineDash([]);

  // 标注文字
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`c=${coverMm}`, sectionLeft + coverPx / 2, sectionBottom + 3);
}

// ─── 统一标签 ────────────────────────────────────────────────────
/**
 * 绘制钢筋标签，自动检测溢出
 * @param maxX  画布最大 x（超出时切换到左侧）
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  color: string,
  canvasLogicalW: number,
  align: 'left' | 'right' = 'left',
) {
  ctx.fillStyle = canvasPaletteColor(ctx, color);
  ctx.font = '11px system-ui, sans-serif';

  // 测量文字宽度
  const metrics = ctx.measureText(text);
  const textW = metrics.width;

  if (align === 'left' && x + textW > canvasLogicalW - 4) {
    // 溢出: 切换到右对齐
    ctx.textAlign = 'right';
    ctx.fillText(text, x - 16, y);
  } else if (align === 'right' && x - textW < 4) {
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 16, y);
  } else {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }
}

// ─── 引出线标签（带短线连接） ────────────────────────────────────
/** 从钢筋位置画引出线到标签 */
export function drawLeaderLabel(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  text: string,
  color: string,
) {
  ctx.strokeStyle = canvasPaletteColor(ctx, color);
  ctx.lineWidth = 0.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.fillStyle = canvasPaletteColor(ctx, color);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = toX > fromX ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  const pad = toX > fromX ? 4 : -4;
  ctx.fillText(text, toX + pad, toY);
}

// ─── 工具 ────────────────────────────────────────────────────────
/** 简易颜色加深 */
function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xFF) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xFF) * (1 - amount));
  const b = Math.max(0, (num & 0xFF) * (1 - amount));
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
