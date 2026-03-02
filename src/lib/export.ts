/**
 * 钢筋下料单导出功能
 * 支持 CSV (可用 Excel 打开) 和 打印友好的 HTML
 */

import type { CalcItem, CalcResult } from './calc';
import { GRADE_MAP } from './rebar';

export interface ExportMeta {
  id?: string;           // 构件编号
  type?: string;         // 构件类型
  dimensions?: string;   // 截面尺寸
  concreteGrade?: string;
  seismicGrade?: string;
  exportDate?: string;
}

interface SummaryRow {
  grade: string;
  diameter: number;
  totalCount: number;
  totalLengthM: number;
  totalWeightKg: number;
}

function buildSummary(items: CalcItem[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const it of items) {
    const key = `${it.grade}-${it.diameter}`;
    const row = map.get(key);
    if (row) {
      row.totalCount += it.count;
      row.totalLengthM += it.count * it.lengthM;
      row.totalWeightKg += it.weightKg;
    } else {
      map.set(key, {
        grade: it.grade,
        diameter: it.diameter,
        totalCount: it.count,
        totalLengthM: it.count * it.lengthM,
        totalWeightKg: it.weightKg,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.diameter - b.diameter || a.grade.localeCompare(b.grade));
}

/**
 * 导出为 CSV 格式（可直接用 Excel 打开）
 */
export function exportToCSV(result: CalcResult, meta: ExportMeta = {}): void {
  const summary = buildSummary(result.items);
  const bom = '\uFEFF'; // UTF-8 BOM for Excel
  const lines: string[] = [];
  
  // 标题
  lines.push(`钢筋下料表${meta.id ? ` - ${meta.id}` : ''}`);
  if (meta.dimensions) lines.push(`截面尺寸: ${meta.dimensions}`);
  if (meta.concreteGrade) lines.push(`混凝土等级: ${meta.concreteGrade}`);
  if (meta.seismicGrade) lines.push(`抗震等级: ${meta.seismicGrade}`);
  lines.push(`导出日期: ${meta.exportDate || new Date().toLocaleDateString('zh-CN')}`);
  lines.push('');
  
  // 明细表
  lines.push('【钢筋明细】');
  lines.push('序号,名称,规格,钢种,直径(mm),根数,单根长度(m),重量(kg)');
  result.items.forEach((it, i) => {
    lines.push(`${i + 1},${it.name},${it.spec},${GRADE_MAP[it.grade] || it.grade},${it.diameter},${it.count},${it.lengthM.toFixed(2)},${it.weightKg.toFixed(2)}`);
  });
  
  lines.push('');
  lines.push('【按规格汇总】');
  lines.push('钢种,直径(mm),总根数,总长度(m),总重量(kg)');
  for (const r of summary) {
    lines.push(`${GRADE_MAP[r.grade] || r.grade},${r.diameter},${r.totalCount},${r.totalLengthM.toFixed(2)},${r.totalWeightKg.toFixed(2)}`);
  }
  lines.push(`合计,,,${summary.reduce((s, r) => s + r.totalLengthM, 0).toFixed(2)},${summary.reduce((s, r) => s + r.totalWeightKg, 0).toFixed(2)}`);
  
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meta.id || '钢筋'}_下料表.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导出为打印友好的 HTML（可另存为 PDF）
 */
export function exportToPrintHTML(result: CalcResult, meta: ExportMeta = {}): void {
  const summary = buildSummary(result.items);
  const totalWeight = summary.reduce((s, r) => s + r.totalWeightKg, 0);
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>钢筋下料表 - ${meta.id || '构件'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: "Microsoft YaHei", "SimHei", sans-serif; 
      padding: 20mm; 
      font-size: 12px;
      line-height: 1.5;
    }
    h1 { 
      font-size: 18px; 
      text-align: center; 
      margin-bottom: 10px;
      border-bottom: 2px solid #333;
      padding-bottom: 8px;
    }
    .meta { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 15px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .meta span { margin-right: 20px; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 20px;
    }
    th, td { 
      border: 1px solid #333; 
      padding: 6px 8px; 
      text-align: center;
    }
    th { 
      background: #e0e0e0; 
      font-weight: bold;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      margin: 15px 0 8px 0;
      padding-left: 8px;
      border-left: 4px solid #333;
    }
    .name-cell { text-align: left; }
    .total-row { background: #f0f0f0; font-weight: bold; }
    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #666;
    }
    @media print {
      body { padding: 10mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>钢筋下料表</h1>
  
  <div class="meta">
    <span><strong>构件编号:</strong> ${meta.id || '-'}</span>
    <span><strong>截面:</strong> ${meta.dimensions || '-'}</span>
    <span><strong>混凝土:</strong> ${meta.concreteGrade || '-'}</span>
    <span><strong>抗震等级:</strong> ${meta.seismicGrade || '-'}</span>
    <span><strong>日期:</strong> ${meta.exportDate || new Date().toLocaleDateString('zh-CN')}</span>
  </div>
  
  <div class="section-title">一、钢筋明细</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px">序号</th>
        <th style="width:100px">名称</th>
        <th style="width:100px">规格</th>
        <th>钢种</th>
        <th>直径(mm)</th>
        <th>根数</th>
        <th>单根长(m)</th>
        <th>重量(kg)</th>
      </tr>
    </thead>
    <tbody>
      ${result.items.map((it, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="name-cell">${it.name}</td>
          <td>${it.spec}</td>
          <td>${GRADE_MAP[it.grade] || it.grade}</td>
          <td>${it.diameter}</td>
          <td>${it.count}</td>
          <td>${it.lengthM.toFixed(2)}</td>
          <td>${it.weightKg.toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="section-title">二、按规格汇总</div>
  <table>
    <thead>
      <tr>
        <th>钢种</th>
        <th>直径(mm)</th>
        <th>总根数</th>
        <th>总长度(m)</th>
        <th>总重量(kg)</th>
      </tr>
    </thead>
    <tbody>
      ${summary.map(r => `
        <tr>
          <td>${GRADE_MAP[r.grade] || r.grade}</td>
          <td>${r.diameter}</td>
          <td>${r.totalCount}</td>
          <td>${r.totalLengthM.toFixed(2)}</td>
          <td>${r.totalWeightKg.toFixed(2)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="2">合计</td>
        <td>${summary.reduce((s, r) => s + r.totalCount, 0)}</td>
        <td>${summary.reduce((s, r) => s + r.totalLengthM, 0).toFixed(2)}</td>
        <td>${totalWeight.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  
  <div class="footer">
    <span>注：本表根据 22G101 图集规定计算锚固和搭接长度，未含施工损耗</span>
    <span>由 RebarViz 自动生成</span>
  </div>
  
  <script class="no-print">
    // 自动触发打印
    window.onload = () => {
      setTimeout(() => window.print(), 300);
    };
  </script>
</body>
</html>
  `.trim();
  
  // 打开新窗口显示并打印
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/**
 * 复制表格到剪贴板（可直接粘贴到 Excel）
 */
export async function copyToClipboard(result: CalcResult, meta: ExportMeta = {}): Promise<boolean> {
  const summary = buildSummary(result.items);
  const lines: string[] = [];
  
  lines.push(`钢筋下料表\t${meta.id || ''}`);
  lines.push('');
  lines.push('名称\t规格\t钢种\t直径\t根数\t单根长(m)\t重量(kg)');
  for (const it of result.items) {
    lines.push(`${it.name}\t${it.spec}\t${GRADE_MAP[it.grade] || it.grade}\t${it.diameter}\t${it.count}\t${it.lengthM.toFixed(2)}\t${it.weightKg.toFixed(2)}`);
  }
  lines.push('');
  lines.push('【汇总】\t钢种\t直径\t总根数\t总长(m)\t总重(kg)');
  for (const r of summary) {
    lines.push(`\t${GRADE_MAP[r.grade] || r.grade}\t${r.diameter}\t${r.totalCount}\t${r.totalLengthM.toFixed(2)}\t${r.totalWeightKg.toFixed(2)}`);
  }
  
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch {
    return false;
  }
}
