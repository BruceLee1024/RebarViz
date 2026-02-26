'use client';

export function ViewerSkeleton() {
  return (
    <div className="w-full h-[500px] lg:h-[600px] bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">加载 3D 模型中...</p>
      </div>
    </div>
  );
}
