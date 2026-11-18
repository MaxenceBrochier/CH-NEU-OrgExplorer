import type { RefObject } from 'react';
import { t } from '../i18n';
import type { View } from '../types';

interface HeaderProps {
  fileName: string;
  hasData: boolean;
  view: View;
  orphanCount: number;
  refreshing: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onView: (view: View) => void;
  onOpenPalette: () => void;
  onImportClick: () => void;
  onRefresh: () => void;
  onFile: (file: File) => void;
}

const NAV: Array<{ id: View; label: string; badge?: boolean }> = [
  { id: 'chart', label: t.app.navChart },
  { id: 'dotted', label: t.app.navDotted, badge: true },
  { id: 'config', label: t.app.navConfig },
  { id: 'print', label: t.app.navPrint },
];

const takedaLogoSrc = `${import.meta.env.BASE_URL}takeda-logo.png`;

export function Header({
  fileName,
  hasData,
  view,
  orphanCount,
  refreshing,
  inputRef,
  onView,
  onOpenPalette,
  onImportClick,
  onRefresh,
  onFile,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 print:hidden">
      <div className="flex items-center gap-3">
        <img src={takedaLogoSrc} alt="Takeda" className="h-9 w-auto object-contain" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t.app.title}</h1>
          <p className="text-xs text-slate-500">{fileName || t.app.subtitleEmpty}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {hasData && (
          <nav className="flex overflow-hidden rounded-lg border border-slate-200 text-sm" aria-label="Navigation principale">
            {NAV.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onView(item.id)}
                aria-current={view === item.id ? 'page' : undefined}
                aria-label={`${item.label}${item.badge && orphanCount > 0 ? `, ${orphanCount} liens pointillés` : ''}`}
                className={`px-3 py-1.5 transition ${index > 0 ? 'border-l border-slate-200' : ''} ${
                  view === item.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
                }`}
              >
                {item.label}
                {item.badge && orphanCount > 0 && (
                  <span aria-hidden="true" className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">
                    {orphanCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100"
        >
          {t.app.actions}
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]">
            Ctrl K
          </kbd>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={onImportClick}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
        >
          {hasData ? t.app.replace : t.app.import}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? t.app.refreshing : t.app.refresh}
        </button>
      </div>
    </header>
  );
}
