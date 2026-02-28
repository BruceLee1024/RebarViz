'use client';

export function ViewerSkeleton() {
  return (
    <div className="w-full h-[500px] lg:h-[600px] bg-gradient-to-b from-white to-gray-50 rounded-xl border border-gray-100 shadow-sm overflow-hidden flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 border-2 border-blue-100 rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-2 border-2 border-transparent border-t-cyan-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
        <p className="text-sm font-medium text-gray-400">加载 3D 模型中…</p>
        <p className="text-[11px] text-gray-300 mt-1">首次加载可能需要几秒</p>
      </div>
    </div>
  );
}
