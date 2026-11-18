import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchEmployees, SOURCE_LABEL } from './lib/employeeSource';
import { fetchDottedLinks, saveDottedLink, deleteDottedLink } from './lib/dottedLinksSource';
import { ancestorKeys, buildTree, filterKeys, flatten, personId } from './lib/buildTree';
import { OrgChart } from './components/VirtualOrgChart';
import { DetailsPanel } from './components/DetailsPanel';
import { Header } from './components/Header';
import { CommandPalette, type Command } from './components/CommandPalette';
import { useCategoryConfig } from './hooks/useCategoryConfig';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { usePanZoom } from './hooks/usePanZoom';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { classifyAll } from './lib/categories';
import type { CategoryId } from './lib/categories';
import { normalize } from './lib/normalize';
import { t } from './i18n';
import type { DottedLinks, Employee, OrgNode, View } from './types';

const EMPTY_SET = new Set<string>();
const DottedLinesPage = lazy(() =>
  import('./components/DottedLinesPage').then((module) => ({ default: module.DottedLinesPage })),
);
const ConfigPage = lazy(() =>
  import('./components/ConfigPage').then((module) => ({ default: module.ConfigPage })),
);
const PrintView = lazy(() =>
  import('./components/PrintView').then((module) => ({ default: module.PrintView })),
);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [service, setService] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [view, setView] = useState<View>('chart');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const [importSeq, setImportSeq] = useState(0);
  const [dottedLinks, setDottedLinks] = useState<DottedLinks>({});
  const [dottedLinksSaving, setDottedLinksSaving] = useState(false);
  const [dottedLinksError, setDottedLinksError] = useState('');
  const dottedLinksRef = useRef<DottedLinks>({});
  const saveDottedLinkTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const {
    rules,
    exclusions,
    status: configStatus,
    error: configError,
    setRules,
    toggleExclusion,
  } = useCategoryConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  const debouncedQuery = useDebouncedValue(query, 150);
  const { zoom, setZoom, zoomBy, onPointerDown, onPointerMove, onPointerUp, didPan } = usePanZoom(
    stageRef,
    view === 'chart',
  );
  useKeyboardShortcuts(useCallback(() => setPaletteOpen((open) => !open), []));

  const tree = useMemo(() => buildTree(employees, dottedLinks), [employees, dottedLinks]);
  const allNodes = useMemo(() => tree.roots.flatMap((root) => flatten(root)), [tree]);

  // L'arbre courant est gardé dans une ref pour appliquer le repli par défaut après un import,
  // sans recalculer buildTree une seconde fois.
  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  useEffect(() => {
    if (importSeq === 0) return;
    // Affiche les trois premiers niveaux par défaut, les équipes plus profondes restent repliées.
    const foldable = treeRef.current.roots
      .flatMap((root) => flatten(root))
      .filter((node) => node.depth >= 2 && node.children.length > 0)
      .map((node) => node.employee.key);
    setCollapsed(new Set(foldable));
  }, [importSeq]);

  // Charge les dotted links depuis Dataverse quand les employés changent
  useEffect(() => {
    if (employees.length === 0) {
      setDottedLinks({});
      return;
    }
    const loadDottedLinks = async () => {
      try {
        const links = await fetchDottedLinks(employees);
        setDottedLinks(links);
        dottedLinksRef.current = links;
        setDottedLinksError('');
      } catch (error) {
        console.error('Erreur chargement dotted links:', error);
        setDottedLinksError(
          error instanceof Error ? error.message : 'Erreur lors du chargement des dotted links',
        );
      }
    };
    loadDottedLinks();
  }, [employees]);

  // Sauvegarde automatique des dotted links dans Dataverse (avec debounce)
  useEffect(() => {
    if (Object.keys(dottedLinks).length === 0 && Object.keys(dottedLinksRef.current).length === 0) {
      return; // Rien à sauvegarder
    }

    // Identifie les changements
    const changed = new Set<string>();
    for (const id in dottedLinks) {
      if (dottedLinks[id] !== dottedLinksRef.current[id]) {
        changed.add(id);
      }
    }
    for (const id in dottedLinksRef.current) {
      if (!(id in dottedLinks)) {
        changed.add(id);
      }
    }

    if (changed.size === 0) return; // Pas de changement

    // Debounce: attendre 2 secondes avant de sauvegarder
    if (saveDottedLinkTimeoutRef.current) {
      clearTimeout(saveDottedLinkTimeoutRef.current);
    }

    setDottedLinksSaving(true);
    saveDottedLinkTimeoutRef.current = setTimeout(async () => {
      try {
        for (const id of changed) {
          if (id in dottedLinks) {
            await saveDottedLink(id, dottedLinks[id]);
          } else {
            await deleteDottedLink(id);
          }
        }
        dottedLinksRef.current = { ...dottedLinks };
        setDottedLinksSaving(false);
        setDottedLinksError('');
      } catch (error) {
        console.error('Erreur sauvegarde dotted links:', error);
        setDottedLinksSaving(false);
        setDottedLinksError(
          error instanceof Error ? error.message : 'Erreur lors de la sauvegarde des dotted links',
        );
      }
    }, 2000);

    return () => {
      if (saveDottedLinkTimeoutRef.current) {
        clearTimeout(saveDottedLinkTimeoutRef.current);
      }
    };
  }, [dottedLinks]);

  // Cleanup: annule les timeouts en attente au unmount
  useEffect(() => {
    return () => {
      if (saveDottedLinkTimeoutRef.current) {
        clearTimeout(saveDottedLinkTimeoutRef.current);
      }
    };
  }, []);

  // Fonctions globales : aucun manager ne correspond à un people leader du site.
  const globalKeys = useMemo(() => new Set(tree.unmanaged.map((e) => e.key)), [tree]);

  const categories = useMemo(
    () => classifyAll(employees, globalKeys, rules, exclusions),
    [employees, globalKeys, rules, exclusions],
  );

  // Catégories qui correspondent avant exclusion : permet de rétablir une catégorie écartée.
  const matchedCategories = useMemo(
    () => classifyAll(employees, globalKeys, rules),
    [employees, globalKeys, rules],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryId, number>();
    categories.forEach((tags) => {
      tags.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    });
    return counts;
  }, [categories]);

  const departments = useMemo(() => uniqueSorted(employees.map((e) => e.department)), [employees]);
  const services = useMemo(
    () =>
      uniqueSorted(
        employees.filter((e) => !department || e.department === department).map((e) => e.service),
      ),
    [employees, department],
  );

  const loadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const { parseWorkbook } = await import('./lib/parseExcel');
      const parsed = await parseWorkbook(file);
      setEmployees(parsed);
      setFileName(file.name);
      setSourceFailed(false);
      setSelected(null);
      setQuery('');
      setDepartment('');
      setService('');
      setImportSeq((seq) => seq + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lire le fichier.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Source par défaut : le fichier Excel SharePoint, lu via le flow Power Automate.
  const loadFromSource = useCallback(async () => {
    setLoading(true);
    setSourceFailed(false);
    setError('');
    try {
      const snapshot = await fetchEmployees();
      setEmployees(snapshot.employees);
      const readAt = snapshot.readAt ?? new Date();
      setFileName(`${SOURCE_LABEL} — ${t.app.syncedAt(readAt.toLocaleString('fr-CH'))}`);
      setSelected(null);
      setQuery('');
      setDepartment('');
      setService('');
      setImportSeq((seq) => seq + 1);
    } catch (cause) {
      setSourceFailed(true);
      setError(
        cause instanceof Error
          ? `Lecture du fichier impossible : ${cause.message}`
          : 'Lecture du fichier impossible.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFromSource();
  }, [loadFromSource]);

  // Normalisée une seule fois par import plutôt qu'à chaque frappe dans la recherche.
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const node of allNodes) {
      const e = node.employee;
      index.set(
        e.key,
        normalize(
          [
            e.worker,
            e.jobTitle,
            e.managementLevel,
            e.manager,
            e.department,
            e.service,
            e.subServices,
            e.email,
            e.id,
            e.employeeId,
            e.costCenter,
          ].join(' '),
        ),
      );
    }
    return index;
  }, [allNodes]);

  const matchedKeys = useMemo(() => {
    const term = normalize(debouncedQuery.trim());
    if (!term) return EMPTY_SET;
    const keys = new Set<string>();
    for (const node of allNodes) {
      if (searchIndex.get(node.employee.key)?.includes(term)) keys.add(node.employee.key);
    }
    return keys;
  }, [allNodes, debouncedQuery, searchIndex]);

  const filtersActive = Boolean(debouncedQuery.trim() || department || service);

  const visibleKeys = useMemo(() => {
    if (!filtersActive) return null;
    return filterKeys(tree.roots, (node) => {
      const e = node.employee;
      if (debouncedQuery.trim() && !matchedKeys.has(e.key)) return false;
      if (department && e.department !== department) return false;
      if (service && e.service !== service) return false;
      return true;
    });
  }, [filtersActive, tree, debouncedQuery, matchedKeys, department, service]);

  // Déplie automatiquement les ancêtres nécessaires pour révéler les résultats, sans empêcher
  // l'utilisateur de replier ensuite manuellement une branche pendant la recherche.
  useEffect(() => {
    if (!visibleKeys) return;
    setCollapsed((previous) => {
      let changed = false;
      const next = new Set(previous);
      const walk = (parent: OrgNode) => {
        for (const child of parent.children) {
          if (!visibleKeys.has(child.employee.key)) continue;
          if (next.delete(parent.employee.key)) changed = true;
          walk(child);
        }
      };
      tree.roots.forEach(walk);
      return changed ? next : previous;
    });
  }, [visibleKeys, tree]);

  const toggle = useCallback((key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(
    () =>
      setCollapsed(
        new Set(
          allNodes
            .filter((node) => node.depth >= 1 && node.children.length > 0)
            .map((n) => n.employee.key),
        ),
      ),
    [allNodes],
  );

  const requestPrint = useCallback(() => {
    setView('print');
    setAutoPrint(true);
  }, []);

  // Un glissement du pointeur déplace le plan, il ne doit pas ouvrir la fiche.
  const handleSelect = useCallback(
    (node: OrgNode) => {
      if (didPan()) return;
      setSelected(node);
    },
    [didPan],
  );

  // La recherche mène directement à la carte dans l'organigramme, sans ouvrir la fiche.
  const goToNode = useCallback(
    (node: OrgNode) => {
      setView('chart');
      const path = ancestorKeys(tree.roots, node.employee.key);
      if (path.length > 0) {
        setCollapsed((previous) => {
          let changed = false;
          const next = new Set(previous);
          path.forEach((key) => {
            if (next.delete(key)) changed = true;
          });
          return changed ? next : previous;
        });
      }
      setFocusedKey(node.employee.key);
    },
    [tree],
  );

  // La surbrillance de la carte visée s'estompe d'elle-même après la navigation.
  useEffect(() => {
    if (!focusedKey) return;
    const timer = window.setTimeout(() => setFocusedKey(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focusedKey]);

  const commands = useMemo<Command[]>(() => {
    if (!paletteOpen) return [];
    const actions: Command[] = [
      {
        id: 'refresh',
        group: 'Fichier',
        label: 'Actualiser depuis SharePoint',
        run: () => void loadFromSource(),
      },
      {
        id: 'import',
        group: 'Fichier',
        label: employees.length ? 'Remplacer le fichier Excel' : 'Importer un fichier Excel',
        run: () => inputRef.current?.click(),
      },
      {
        id: 'view-chart',
        group: 'Navigation',
        label: 'Ouvrir l’organigramme',
        run: () => setView('chart'),
      },
      {
        id: 'view-dotted',
        group: 'Navigation',
        label: 'Ouvrir les dotted lines',
        run: () => setView('dotted'),
      },
      {
        id: 'view-config',
        group: 'Navigation',
        label: 'Ouvrir la configuration des catégories',
        run: () => setView('config'),
      },
      {
        id: 'view-print',
        group: 'Navigation',
        label: 'Ouvrir la mise en page d’impression',
        run: () => setView('print'),
      },
      {
        id: 'print',
        group: 'Fichier',
        label: 'Imprimer / exporter en PDF',
        hint: 'Ctrl + P',
        run: requestPrint,
      },
      {
        id: 'search',
        group: 'Navigation',
        label: 'Aller à la recherche',
        run: () => {
          setView('chart');
          setTimeout(() => searchRef.current?.focus(), 0);
        },
      },
      { id: 'expand', group: 'Affichage', label: 'Tout déplier', run: expandAll },
      { id: 'collapse', group: 'Affichage', label: 'Tout replier', run: collapseAll },
      {
        id: 'zoom-in',
        group: 'Affichage',
        label: 'Zoom avant',
        hint: 'Ctrl + ↑',
        run: () => zoomBy(0.1),
      },
      {
        id: 'zoom-out',
        group: 'Affichage',
        label: 'Zoom arrière',
        hint: 'Ctrl + ↓',
        run: () => zoomBy(-0.1),
      },
      {
        id: 'zoom-reset',
        group: 'Affichage',
        label: 'Réinitialiser le zoom',
        run: () => setZoom(1),
      },
      {
        id: 'clear-filters',
        group: 'Filtres',
        label: 'Effacer les filtres',
        run: () => {
          setQuery('');
          setDepartment('');
          setService('');
        },
      },
    ];

    const people = allNodes.map<Command>((node) => ({
      id: `person-${node.employee.key}`,
      group: 'Personne',
      label: node.employee.jobTitle
        ? `${node.employee.worker} — ${node.employee.jobTitle}`
        : node.employee.worker,
      run: () => goToNode(node),
    }));

    return [...actions, ...people];
  }, [
    paletteOpen,
    allNodes,
    employees.length,
    zoomBy,
    setZoom,
    expandAll,
    collapseAll,
    requestPrint,
    goToNode,
    loadFromSource,
  ]);

  return (
    <div
      className={`flex h-screen flex-col bg-slate-50 text-slate-900 print:block print:h-auto print:bg-white transition-colors duration-300`}
    >
      <Header
        fileName={fileName}
        hasData={employees.length > 0}
        view={view}
        orphanCount={tree.orphanCount}
        refreshing={loading}
        inputRef={inputRef}
        onView={setView}
        onOpenPalette={() => setPaletteOpen(true)}
        onImportClick={() => inputRef.current?.click()}
        onRefresh={() => void loadFromSource()}
        onFile={(file) => void loadFile(file)}
      />

      {employees.length > 0 && view === 'chart' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur print:hidden animate-fade-in">
          <input
            ref={searchRef}
            type="search"
            placeholder={t.filters.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher un employé"
            className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
          />
          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setService('');
            }}
            aria-label="Filtrer par département"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
          >
            <option value="">{t.filters.allDepartments}</option>
            {departments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={service}
            onChange={(event) => setService(event.target.value)}
            aria-label="Filtrer par service"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
          >
            <option value="">{t.filters.allServices}</option>
            {services.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-slate-200 text-sm">
              <button
                type="button"
                onClick={expandAll}
                className="px-3 py-1.5 transition hover:bg-slate-100"
              >
                {t.filters.expandAll}
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="border-l border-slate-200 px-3 py-1.5 transition hover:bg-slate-100"
              >
                {t.filters.collapseAll}
              </button>
            </div>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 text-sm">
              <button
                type="button"
                onClick={() => zoomBy(-0.1)}
                className="px-3 py-1.5 transition hover:bg-slate-100"
              >
                −
              </button>
              <span
                title={t.filters.zoomHint}
                className="w-14 border-x border-slate-200 py-1.5 text-center text-xs text-slate-500"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => zoomBy(0.1)}
                className="px-3 py-1.5 transition hover:bg-slate-100"
              >
                +
              </button>
            </div>
            <span className="text-xs text-slate-500">
              {t.summary(tree.total, tree.roots.length, tree.orphanCount)}
            </span>
          </div>
        </div>
      )}

      {configError && (
        <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800 print:hidden">
          <span>Configuration non enregistrée : {configError}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-4 border-b border-rose-200 bg-rose-50 px-6 py-2 text-sm text-rose-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label={t.filters.dismissError}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-base text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
          >
            ×
          </button>
        </div>
      )}

      <main
        ref={stageRef}
        className={`flex-1 overflow-auto print:overflow-visible ${
          view === 'chart' ? 'cursor-grab touch-none select-none active:cursor-grabbing' : ''
        }`}
        onPointerDown={view === 'chart' ? onPointerDown : undefined}
        onPointerMove={view === 'chart' ? onPointerMove : undefined}
        onPointerUp={view === 'chart' ? onPointerUp : undefined}
        onPointerCancel={view === 'chart' ? onPointerUp : undefined}
        onPointerLeave={view === 'chart' ? onPointerUp : undefined}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void loadFile(file);
        }}
      >
        {loading && (
          <p className="p-16 text-center text-sm text-slate-500">{t.stage.loadingSource}</p>
        )}
        {!loading && employees.length === 0 && sourceFailed && (
          <section className="m-10 flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-8 py-16 text-center">
            <h2 className="text-xl font-semibold text-slate-800">{t.stage.sourceUnavailable}</h2>
            <p className="mt-2 max-w-lg text-sm text-slate-600">{t.stage.sourceRetryHint}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void loadFromSource()}
                disabled={loading}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t.stage.retrySource}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                {t.stage.manualFallback}
              </button>
            </div>
          </section>
        )}
        {!loading && employees.length === 0 && !sourceFailed && (
          <div
            onClick={() => inputRef.current?.click()}
            className="m-10 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/60 px-10 py-24 text-center transition hover:border-indigo-400 hover:bg-white"
          >
            <h2 className="text-xl font-semibold text-slate-800">{t.stage.dropTitle}</h2>
            <p className="mt-2 max-w-lg text-sm text-slate-500">{t.stage.dropHint}</p>
            <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
              {t.stage.dropBadge}
            </span>
          </div>
        )}
        {!loading && employees.length > 0 && view === 'chart' && (
          <OrgChart
            roots={tree.roots}
            collapsed={collapsed}
            visibleKeys={visibleKeys}
            matchedKeys={matchedKeys}
            categories={categories}
            selectedKey={selected?.employee.key ?? null}
            focusedKey={focusedKey}
            zoom={zoom}
            stageRef={stageRef}
            onToggle={toggle}
            onSelect={handleSelect}
          />
        )}
        <Suspense
          fallback={
            <p className="p-16 text-center text-sm text-slate-500">{t.stage.loadingSource}</p>
          }
        >
          {!loading && employees.length > 0 && view === 'dotted' && (
            <div>
              {dottedLinksError && (
                <div className="mx-auto w-full max-w-4xl px-8 pt-4">
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200">
                    ⚠️ {dottedLinksError}
                  </div>
                </div>
              )}
              {dottedLinksSaving && (
                <div className="mx-auto w-full max-w-4xl px-8 pt-4">
                  <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 border border-blue-200">
                    💾 Sauvegarde en cours...
                  </div>
                </div>
              )}
              <DottedLinesPage
                employees={employees}
                unmanaged={tree.unmanaged}
                links={dottedLinks}
                onChange={setDottedLinks}
              />
            </div>
          )}
          {!loading && employees.length > 0 && view === 'config' && (
            <ConfigPage
              rules={rules}
              counts={categoryCounts}
              employees={employees}
              matched={matchedCategories}
              exclusions={exclusions}
              saving={configStatus === 'saving'}
              onChange={setRules}
              onToggleExclusion={toggleExclusion}
            />
          )}
          {!loading && employees.length > 0 && view === 'print' && (
            <PrintView
              roots={tree.roots}
              visibleKeys={visibleKeys}
              categories={categories}
              autoPrint={autoPrint}
              onPrinted={() => setAutoPrint(false)}
            />
          )}
        </Suspense>
      </main>

      <DetailsPanel
        node={selected}
        matchedCategories={selected ? (matchedCategories.get(selected.employee.key) ?? []) : []}
        excludedCategories={selected ? (exclusions[personId(selected.employee)] ?? []) : []}
        onToggleCategory={(id) => selected && toggleExclusion(personId(selected.employee), id)}
        onClose={() => setSelected(null)}
      />
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
