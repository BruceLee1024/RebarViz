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
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">图例</h2>
      <div className="grid grid-cols-1 gap-1.5">
        {items.map(({ color, label, opacity }) => (
          <div key={label} className="flex items-center gap-2 py-0.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/5" style={{ background: color, opacity: opacity ?? 1 }} />
            <span className="text-xs text-gray-600">{label}</span>
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

export function Section({ title, defaultOpen = false, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 rounded-lg bg-gray-50/60 border border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer group"
        type="button"
      >
        <span className="text-xs font-semibold text-primary">{title}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </div>
  );
}

