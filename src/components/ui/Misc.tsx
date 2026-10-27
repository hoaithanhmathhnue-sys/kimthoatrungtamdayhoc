import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...props }) => (
  <select
    className={cn("w-full h-10 px-3 py-2 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", className)}
    {...props}
  />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
  <textarea
    className={cn("w-full min-h-[90px] p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", className)}
    {...props}
  />
);

export const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
  <div className={className}>
    <label className="text-sm font-medium text-slate-700 block mb-1">{label}</label>
    {children}
  </div>
);

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-700',
};

export type BadgeTone = keyof typeof BADGE_TONES;

export const Badge: React.FC<{ tone?: BadgeTone; className?: string; children: React.ReactNode }> = ({ tone = 'slate', className, children }) => (
  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap", BADGE_TONES[tone], className)}>{children}</span>
);

export const Tabs: React.FC<{ tabs: { id: string; label: React.ReactNode; count?: number }[]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {tabs.map(t => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5",
          active === t.id ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
        )}
      >
        {t.label}
        {!!t.count && <span className="px-1.5 rounded-full bg-red-500 text-white text-[10px] leading-4">{t.count}</span>}
      </button>
    ))}
  </div>
);

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone = 'text-slate-800' }) => (
  <Card className="p-4">
    <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
    <div className={cn("text-xl font-bold mt-1", tone)}>{value}</div>
    {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
  </Card>
);

export const Modal: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ open, title, onClose, children, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={cn("w-full bg-white rounded-2xl shadow-2xl my-8", wide ? 'max-w-4xl' : 'max-w-xl')} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-[16px] font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export const EmptyRow: React.FC<{ colSpan: number; text: string }> = ({ colSpan, text }) => (
  <tr><td colSpan={colSpan} className="px-6 py-8 text-center text-slate-400">{text}</td></tr>
);

export const PageHeader: React.FC<{ icon?: React.ElementType; title: string; subtitle?: string; actions?: React.ReactNode }> = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
    <div>
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        {Icon && <Icon className="w-7 h-7 text-primary" />} {title}
      </h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
