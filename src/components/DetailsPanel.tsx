import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CATEGORY_META } from '../lib/categories';
import type { CategoryId } from '../lib/categories';
import { t } from '../i18n';
import type { OrgNode } from '../types';

interface DetailsPanelProps {
  node: OrgNode | null;
  /** Catégories qui correspondent à la personne, avant exclusion. */
  matchedCategories: CategoryId[];
  excludedCategories: CategoryId[];
  onToggleCategory: (id: CategoryId) => void;
  onClose: () => void;
}

function initials(name: string): string {
  const parts = name.replace(/[(),[\]]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DetailsPanel({
  node,
  matchedCategories,
  excludedCategories,
  onToggleCategory,
  onClose,
}: DetailsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(node !== null, ref, onClose);

  if (!node) return null;
  const e = node.employee;
  const directCount = node.children.filter((child) => !child.dotted).length;
  const indirectCount = node.children.filter((child) => child.dotted).length;

  const rows: Array<[string, string]> = [
    [t.details.jobTitle, e.jobTitle],
    [t.details.managementLevel, e.managementLevel],
    [t.details.manager, e.manager],
    [t.details.department, e.department],
    [t.details.service, e.service],
    [t.details.subService, e.subServices],
    [t.details.departmentServices, e.departmentServices],
    [t.details.email, e.email],
    [t.details.id, e.id],
    [t.details.employeeId, e.employeeId],
    [t.details.costCenter, e.costCenter],
  ];
  const visibleRows = rows.filter(([, value]) => value && value !== '0');
  const reportStats: Array<[string, number]> = [
    [t.details.directReports, directCount],
    [t.details.indirectReports, indirectCount],
    [t.details.totalReports, node.descendants],
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-slate-900/30 p-6 pt-[8vh] backdrop-blur-sm print:hidden"
      role="presentation"
      aria-hidden="false"
      onMouseDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={e.worker}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-in fade-in zoom-in-95 duration-200"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold tracking-wide text-white">
            {initials(e.worker)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900">{e.worker}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{e.jobTitle || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.details.close}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {reportStats.map(([label, value]) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="text-lg font-semibold text-slate-900">{value}</p>
              <p className="mt-0.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">{label}</p>
            </div>
          ))}
        </div>
        {matchedCategories.some((id) => id !== 'internal') && (
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
              {t.details.categories}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {matchedCategories.map((id) => {
                const excluded = excludedCategories.includes(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onToggleCategory(id)}
                      aria-pressed={excluded}
                      title={excluded ? t.details.categoryRestore : t.details.categoryExclude}
                      className={`group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                        excluded
                          ? 'bg-white text-slate-400 line-through ring-slate-200 hover:bg-slate-50'
                          : `${CATEGORY_META[id].chip} hover:brightness-95`
                      }`}
                    >
                      {CATEGORY_META[id].label}
                      <span aria-hidden="true" className="text-sm leading-none opacity-50 group-hover:opacity-100">
                        {excluded ? '+' : '×'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">{t.details.categoriesHint}</p>
          </div>
        )}
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 overflow-y-auto p-5">
          {visibleRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{label}</dt>
              <dd className="mt-0.5 truncate text-sm text-slate-800" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
