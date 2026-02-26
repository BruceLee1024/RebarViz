import { parseRebar, parseStirrup, parseSlabRebar } from './rebar';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateRebar(str: string, fieldName: string): ValidationError | null {
  if (!str.trim()) return null; // empty is ok for optional fields
  const m = str.match(/^(\d+)([A-Za-z])(\d+)$/);
  if (!m) return { field: fieldName, message: '格式应为: 数量+等级+直径，如 2C25、4C20' };
  const count = parseInt(m[1]);
  const diameter = parseInt(m[3]);
  if (count < 1 || count > 30) return { field: fieldName, message: '钢筋数量应在 1~30 之间' };
  const validDiameters = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40];
  if (!validDiameters.includes(diameter)) return { field: fieldName, message: `直径应为标准规格: ${validDiameters.join('、')}` };
  const grade = m[2].toUpperCase();
  if (!['A', 'B', 'C', 'D', 'E'].includes(grade)) return { field: fieldName, message: '等级应为 A~E (A=HPB300, C=HRB400)' };
  return null;
}

export function validateStirrup(str: string, fieldName: string): ValidationError | null {
  if (!str.trim()) return null;
  const m = str.match(/^([A-Za-z])(\d+)@(\d+)(?:\/(\d+))?\((\d+)\)$/);
  if (!m) return { field: fieldName, message: '格式应为: 等级+直径@加密/非加密(肢数)，如 A8@100/200(2)' };
  const diameter = parseInt(m[2]);
  if (diameter < 6 || diameter > 16) return { field: fieldName, message: '箍筋直径一般为 6~16mm' };
  const legs = parseInt(m[5]);
  if (legs < 2 || legs > 8) return { field: fieldName, message: '箍筋肢数应在 2~8 之间' };
  return null;
}

export function validateSlabRebar(str: string, fieldName: string): ValidationError | null {
  if (!str.trim()) return null;
  const m = str.match(/^([A-Za-z])(\d+)@(\d+)$/);
  if (!m) return { field: fieldName, message: '格式应为: 等级+直径@间距，如 C10@150' };
  const spacing = parseInt(m[3]);
  if (spacing < 50 || spacing > 500) return { field: fieldName, message: '间距应在 50~500mm 之间' };
  return null;
}

export function validateDimension(value: number, fieldName: string, min: number, max: number): ValidationError | null {
  if (value < min || value > max) return { field: fieldName, message: `数值应在 ${min}~${max} 之间` };
  return null;
}
