'use client';

import { useState } from 'react';
import type { ValidationError } from '@/lib/validate';

export function Field({ label, value, onChange, placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string | null;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors bg-white text-gray-800 placeholder-gray-400 ${
          error ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20' : 'border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20'
        }`} />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function NumField({ label, value, onChange, error, min, max }: {
  label: string; value: number; onChange: (v: number) => void; error?: string | null; min?: number; max?: number;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input type="number" value={value} min={min} max={max}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors bg-white text-gray-800 ${
          error ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20' : 'border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20'
        }`} />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; opacity?: number }[] }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
      <h2 className="text-sm font-semibold text-primary mb-3">图例</h2>
      <div className="space-y-2 text-sm">
        {items.map(({ color, label, opacity }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color, opacity: opacity ?? 1 }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      重置
    </button>
  );
}

export function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors bg-white text-gray-800 cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
