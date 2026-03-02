'use client';

import { useState } from 'react';
import { History, Star, StarOff, Trash2, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface HistoryItem {
  id: string;
  name: string;
  timestamp: number;
  note?: string;
}

interface HistoryPanelProps {
  history: HistoryItem[];
  favorites: HistoryItem[];
  isFavorite: boolean;  // 当前方案是否已收藏
  onSelect: (id: string, isFavorite: boolean) => void;
  onAddFavorite: () => void;
  onRemoveFavorite: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  
  // 1小时内显示"xx分钟前"
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / 60000);
    return mins <= 0 ? '刚刚' : `${mins}分钟前`;
  }
  
  // 今天内显示时间
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  // 其他日期
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function HistoryPanel({
  history,
  favorites,
  isFavorite,
  onSelect,
  onAddFavorite,
  onRemoveFavorite,
  onRemoveHistory,
  onClearHistory,
}: HistoryPanelProps) {
  const [showHistory, setShowHistory] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);

  const isEmpty = history.length === 0 && favorites.length === 0;

  return (
    <div className="space-y-3">
      {/* 收藏当前方案按钮 */}
      <button
        onClick={onAddFavorite}
        disabled={isFavorite}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
          isFavorite 
            ? 'bg-amber-50 text-amber-600 border border-amber-200'
            : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200 hover:from-amber-100 hover:to-orange-100'
        }`}
      >
        <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-500' : ''}`} />
        {isFavorite ? '已收藏当前方案' : '收藏当前方案'}
      </button>

      {isEmpty && (
        <div className="text-center py-6 text-gray-400">
          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">暂无历史记录</p>
          <p className="text-[11px] mt-1">修改参数后会自动保存</p>
        </div>
      )}

      {/* 收藏列表 */}
      {favorites.length > 0 && (
        <div className="border border-amber-100 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowFavorites(!showFavorites)}
            className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium text-amber-700">收藏 ({favorites.length})</span>
            </div>
            {showFavorites ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-400" />}
          </button>
          
          {showFavorites && (
            <div className="divide-y divide-amber-50">
              {favorites.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-amber-50/50 group"
                >
                  <button
                    onClick={() => onSelect(item.id, true)}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                    {item.note && (
                      <p className="text-[10px] text-gray-400 truncate">{item.note}</p>
                    )}
                  </button>
                  <button
                    onClick={() => onRemoveFavorite(item.id)}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="取消收藏"
                  >
                    <StarOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 历史记录列表 */}
      {history.length > 0 && (
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-600">最近记录 ({history.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onClearHistory(); }}
                className="text-[10px] text-gray-400 hover:text-red-500 cursor-pointer"
              >
                清空
              </button>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </div>
          </button>
          
          {showHistory && (
            <div className="divide-y divide-gray-50">
              {history.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group"
                >
                  <button
                    onClick={() => onSelect(item.id, false)}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <p className="text-xs text-gray-700 truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-400">{formatTime(item.timestamp)}</p>
                  </button>
                  <button
                    onClick={() => onRemoveHistory(item.id)}
                    className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
