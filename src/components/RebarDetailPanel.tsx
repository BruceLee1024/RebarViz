'use client';

import { X, Info, Ruler, Weight, Anchor, BarChart3 } from 'lucide-react';
import type { RebarMeshInfo } from '@/lib/types';

interface RebarDetailPanelProps {
  info: RebarMeshInfo;
  onClose: () => void;
  additionalData?: {
    piecesPerStation?: number;
    length?: number;      // 钢筋总长 mm
    weight?: number;      // 单根重量 kg
    anchorLength?: number; // 锚固长度 mm
    lapLength?: number;   // 搭接长度 mm
    spacing?: number;     // 间距 mm
    hint?: string;        // 多跨提示
    groupLabel?: string;  // 钢筋组
    groupCount?: number;  // 组内数量
    distributionRange?: string; // 分布范围
    instanceIndex?: number; // 当前序号
    relatedGroups?: string[]; // 关联钢筋组
  };
}

export function RebarDetailPanel({ info, onClose, additionalData }: RebarDetailPanelProps) {
  const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    top: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-500' },
    bottom: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-500' },
    main: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-500' },
    corner: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-500' },
    bMiddle: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', icon: 'text-orange-500' },
    hMiddle: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', icon: 'text-purple-500' },
    stirrup: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: 'text-green-500' },
    leftSupport: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', icon: 'text-purple-500' },
    rightSupport: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', icon: 'text-purple-500' },
    sideBar: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'text-blue-500' },
    tieBar: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', icon: 'text-teal-500' },
    erection: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'text-amber-500' },
    haunch: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', icon: 'text-orange-500' },
  };

  const theme = colorMap[info.type] || {
    bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', icon: 'text-gray-500'
  };

  return (
    <div className={`rv-rebar-detail absolute top-3 right-3 w-80 rounded-xl border shadow-2xl z-20 ${theme.bg} ${theme.border}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border}`}>
        <div className="flex items-center gap-2">
          <Info className={`w-4 h-4 ${theme.icon}`} />
          <h3 className={`font-semibold text-sm ${theme.text}`}>{info.label}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="关闭钢筋详情"
          className={`p-1 rounded-lg hover:bg-white/50 transition-colors ${theme.text}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* 基本信息 */}
        <div className={`text-xs leading-relaxed ${theme.text} opacity-90`}>
          {info.detail}
        </div>

        {/* 详细参数 */}
        {additionalData && (
          <div className="space-y-2 pt-2 border-t border-gray-200/50">
            {(additionalData.groupLabel || info.groupLabel) && (
              <DetailRow
                icon={<Info className="w-3.5 h-3.5" />}
                label="钢筋组"
                value={additionalData.groupLabel || info.groupLabel || ''}
              />
            )}
            {(additionalData.groupCount ?? info.groupCount) != null && (
              <DetailRow
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label="组内数量"
                value={`${additionalData.groupCount ?? info.groupCount} ${additionalData.piecesPerStation ? `道 · ${additionalData.piecesPerStation}箍/道` : '根/道'}`}
              />
            )}
            {(additionalData.distributionRange || info.distributionRange) && (
              <DetailRow
                icon={<Ruler className="w-3.5 h-3.5" />}
                label="分布范围"
                value={additionalData.distributionRange || info.distributionRange || ''}
              />
            )}
            {(additionalData.instanceIndex ?? info.instanceIndex) != null && (
              <DetailRow
                icon={<Info className="w-3.5 h-3.5" />}
                label="当前序号"
                value={`#${additionalData.instanceIndex ?? info.instanceIndex}`}
              />
            )}
            {additionalData.length != null && (
              <DetailRow
                icon={<Ruler className="w-3.5 h-3.5" />}
                label={additionalData.piecesPerStation ? "每道总长" : "钢筋长度"}
                value={`${(additionalData.length / 1000).toFixed(2)} m`}
              />
            )}
            {additionalData.weight != null && (
              <DetailRow
                icon={<Weight className="w-3.5 h-3.5" />}
                label={additionalData.piecesPerStation ? "每道重量" : "单根重量"}
                value={`${additionalData.weight.toFixed(2)} kg`}
              />
            )}
            {additionalData.anchorLength != null && (
              <DetailRow
                icon={<Anchor className="w-3.5 h-3.5" />}
                label="锚固长度"
                value={`${additionalData.anchorLength} mm`}
              />
            )}
            {additionalData.lapLength != null && (
              <DetailRow
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label="搭接长度"
                value={`${additionalData.lapLength} mm`}
              />
            )}
            {additionalData.spacing != null && (
              <DetailRow
                icon={<Ruler className="w-3.5 h-3.5" />}
                label="钢筋间距"
                value={`${additionalData.spacing} mm`}
              />
            )}
            {additionalData.hint && (
              <DetailRow
                icon={<Info className="w-3.5 h-3.5" />}
                label="多跨"
                value={additionalData.hint}
              />
            )}
            {(additionalData.relatedGroups?.length || info.relatedSetIds?.length) ? (
              <DetailRow
                icon={<Info className="w-3.5 h-3.5" />}
                label="关联组"
                value={(additionalData.relatedGroups || info.relatedSetIds || []).join(' / ')}
              />
            ) : null}
          </div>
        )}

        {/* 规范提示 */}
        <div className="pt-2 border-t border-gray-200/50">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            💡 构造依据: GB50010-2010《混凝土结构设计规范》、22G101-1 图集
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5 text-gray-600">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-mono font-medium text-gray-800">{value}</span>
    </div>
  );
}
