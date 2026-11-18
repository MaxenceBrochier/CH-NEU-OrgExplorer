import { memo } from 'react';
import type { OrgNode } from '../types';
import { CATEGORY_META } from '../lib/categories';
import type { CategoryId } from '../lib/categories';
import { t } from '../i18n';

interface NodeCardProps {
  node: OrgNode;
  tags: CategoryId[];
  collapsed: boolean;
  highlighted: boolean;
  selected: boolean;
  /** Carte visée depuis la recherche : surbrillance temporaire sans ouvrir la fiche. */
  focused?: boolean;
  onToggle: (key: string) => void;
  onSelect: (node: OrgNode) => void;
}

function initials(name: string): string {
  const parts = name.replace(/[(),[\]]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const NodeCard = memo(function NodeCard({
  node,
  tags,
  collapsed,
  highlighted,
  selected,
  focused,
  onToggle,
  onSelect,
}: NodeCardProps) {
  const { employee, children, descendants } = node;
  const level = employee.managementLevel.trim();
  const meta = CATEGORY_META[tags[0] ?? 'internal'];
  const unit = employee.subServices || employee.service || employee.department;

  const ring = focused
    ? 'ring-4 ring-indigo-400 shadow-lg shadow-indigo-100'
    : selected
      ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-100'
      : highlighted
        ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-100'
        : 'ring-1 ring-slate-200 shadow-sm';

  return (
    <div
      id={`node-${employee.key}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node);
        }
      }}
      aria-label={`${employee.worker}${employee.jobTitle ? `, ${employee.jobTitle}` : ''}`}
      aria-pressed={selected}
      className={`relative z-10 w-60 cursor-pointer overflow-hidden rounded-2xl bg-white pb-2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${ring}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${meta.bar}`} />

      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold tracking-wide text-white">
          {initials(employee.worker)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900" title={employee.worker}>
            {employee.worker}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500" title={employee.jobTitle}>
            {employee.jobTitle || '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 px-4">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`tag-chip rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CATEGORY_META[tag].chip}`}
          >
            {CATEGORY_META[tag].label}
          </span>
        ))}
        {unit && (
          <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {unit}
          </span>
        )}
        {level && (
          <span className="max-w-full truncate rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 ring-inset">
            {level}
          </span>
        )}
        {node.dotted && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 ring-inset">
            {t.card.dotted}
          </span>
        )}
      </div>

      {children.length > 0 && (
        <button
          type="button"
          aria-label={collapsed ? t.card.expand : t.card.collapse}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(employee.key);
          }}
          className="mt-3 flex w-full items-center justify-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500 transition hover:text-indigo-600"
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
            {collapsed ? '+' : '−'}
          </span>
            {t.card.reports(children.length, descendants)}
        </button>
      )}
    </div>
  );
});
