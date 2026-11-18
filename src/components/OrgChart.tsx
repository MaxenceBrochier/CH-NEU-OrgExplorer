import { memo, useMemo } from 'react';
import type { OrgNode } from '../types';
import { NodeCard } from './NodeCard';
import { CATEGORY_META, CATEGORY_PRIORITY } from '../lib/categories';
import type { CategoryId } from '../lib/categories';
import { branchRows } from '../lib/chartLayout';
import { t } from '../i18n';

interface TreeProps {
  collapsed: Set<string>;
  visibleKeys: Set<string> | null;
  matchedKeys: Set<string>;
  categories: Map<string, CategoryId[]>;
  /** Le découpage en colonnes ne sert qu'à tenir dans la laize du plotter. */
  printMode?: boolean;
  selectedKey: string | null;
  /** Carte visée par une navigation depuis la recherche : surbrillance temporaire, sans ouvrir la fiche. */
  focusedKey?: string | null;
  onToggle: (key: string) => void;
  onSelect: (node: OrgNode) => void;
}

interface BranchProps extends TreeProps {
  node: OrgNode;
}

// Tout se raccroche à un axe vertical qui passe par le centre de la carte du manager.
// La colonne des reports individuels est symétrique (272px de vide à gauche, carte à droite)
// afin que cet axe reste le centre exact de la branche.
// L'épaisseur des traits est pilotée par --hair (= 1px / échelle) pour rester nette à tout zoom
// et à l'impression ; à défaut de variable elle vaut 1px.
const AXIS =
  "before:absolute before:left-1/2 before:w-[var(--hair,1px)] before:bg-slate-300 before:content-['']";
const IC_RAIL =
  "before:absolute before:left-[272px] before:w-[var(--hair,1px)] before:bg-slate-300 before:content-['']";
const IC_ELBOW =
  "after:absolute after:top-9 after:left-[272px] after:h-[var(--hair,1px)] after:w-8 after:bg-slate-300 after:content-['']";
const BUS =
  "after:absolute after:top-0 after:left-0 after:h-[var(--hair,1px)] after:w-full after:bg-slate-300 after:content-[''] first:after:left-1/2 first:after:w-1/2 last:after:left-0 last:after:w-1/2 only:after:hidden";
// Rattachement manuel : le trait qui rejoint la carte est en pointillé.
const AXIS_DASHED =
  "before:absolute before:left-1/2 before:w-[var(--hair,1px)] before:bg-[repeating-linear-gradient(to_bottom,#94a3b8_0_3px,transparent_3px_6px)] before:content-['']";
const BUS_DASHED =
  "after:absolute after:top-0 after:left-0 after:h-[var(--hair,1px)] after:w-full after:bg-[repeating-linear-gradient(to_right,#94a3b8_0_3px,transparent_3px_6px)] after:content-[''] first:after:left-1/2 first:after:w-1/2 last:after:left-0 last:after:w-1/2 only:after:hidden";
const IC_ELBOW_DASHED =
  "after:absolute after:top-9 after:left-[272px] after:h-[var(--hair,1px)] after:w-8 after:bg-[repeating-linear-gradient(to_right,#94a3b8_0_3px,transparent_3px_6px)] after:content-['']";
// Au-delà, la colonne est scindée pour élargir la feuille plutôt que de la rallonger.
const MAX_ROWS_PER_COLUMN = 15;
// Variante multi-colonnes : rail collé à gauche de chaque colonne (largeur fixe 304px).
const COL_RAIL =
  "before:absolute before:left-4 before:w-[var(--hair,1px)] before:bg-slate-300 before:content-['']";
const COL_ELBOW =
  "after:absolute after:top-9 after:left-4 after:h-[var(--hair,1px)] after:w-8 after:bg-slate-300 after:content-['']";
const COL_ELBOW_DASHED =
  "after:absolute after:top-9 after:left-4 after:h-[var(--hair,1px)] after:w-8 after:bg-[repeating-linear-gradient(to_right,#94a3b8_0_3px,transparent_3px_6px)] after:content-['']";
const COL_BUS =
  "after:absolute after:top-0 after:left-4 after:h-[var(--hair,1px)] after:w-full after:bg-slate-300 after:content-[''] last:after:hidden";
// Une fois entrée dans la section dotted line, la colonne verticale reste pointillée jusqu'au bas de la liste.
const IC_RAIL_DASHED =
  "before:absolute before:left-[272px] before:w-[var(--hair,1px)] before:bg-[repeating-linear-gradient(to_bottom,#94a3b8_0_3px,transparent_3px_6px)] before:content-['']";
const COL_RAIL_DASHED =
  "before:absolute before:left-4 before:w-[var(--hair,1px)] before:bg-[repeating-linear-gradient(to_bottom,#94a3b8_0_3px,transparent_3px_6px)] before:content-['']";

const Branch = memo(function Branch({
  node,
  collapsed,
  visibleKeys,
  matchedKeys,
  categories,
  printMode,
  selectedKey,
  focusedKey,
  onToggle,
  onSelect,
}: BranchProps) {
  const isCollapsed = collapsed.has(node.employee.key);

  // Ce calcul (tri, groupement, colonnes) ne dépend pas de collapsed/selectedKey/focusedKey :
  // on l'isole dans un useMemo pour qu'il ne soit pas refait à chaque toggle ailleurs dans l'arbre
  // (collapsed est un Set partagé par toutes les branches, son changement invalide sinon tout le rendu mémoïsé).
  const { children, leaders, tagsOf, trailedRows, columns } = useMemo(() => {
    const {
      children,
      leaders,
      tagsOf,
      rows: trailedRows,
    } = branchRows(node, visibleKeys, categories);
    const columnCount = printMode
      ? Math.max(1, Math.ceil(trailedRows.length / MAX_ROWS_PER_COLUMN))
      : 1;
    const perColumn = Math.ceil(trailedRows.length / columnCount);

    const columns: (typeof trailedRows)[] = [];
    for (let index = 0; index < trailedRows.length; index += perColumn) {
      columns.push(trailedRows.slice(index, index + perColumn));
    }

    return { children, leaders, tagsOf, trailedRows, columns };
  }, [node, visibleKeys, categories, printMode]);

  const showChildren = children.length > 0 && !isCollapsed;

  const cardProps = (target: OrgNode) => ({
    node: target,
    tags: tagsOf(target),
    highlighted: matchedKeys.has(target.employee.key),
    selected: selectedKey === target.employee.key,
    focused: focusedKey === target.employee.key,
    onToggle,
    onSelect,
  });

  const renderRow = (
    row: { id: string; node?: OrgNode; label?: string; dashedTrail?: boolean },
    single: boolean,
    stopRail: boolean,
  ) => {
    const rail = row.dashedTrail
      ? single
        ? IC_RAIL_DASHED
        : COL_RAIL_DASHED
      : single
        ? IC_RAIL
        : COL_RAIL;
    const padding = single ? 'pl-[304px]' : 'pl-12';

    if (!row.node) {
      return (
        <div key={row.id} className={`relative pb-2 ${padding} ${rail} before:top-0 before:h-full`}>
          <span
            className={`tag-chip inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-inset ${CATEGORY_META.contractor.chip}`}
          >
            {row.label}
          </span>
        </div>
      );
    }

    const elbow =
      row.node.dotted || row.dashedTrail
        ? single
          ? IC_ELBOW_DASHED
          : COL_ELBOW_DASHED
        : single
          ? IC_ELBOW
          : COL_ELBOW;

    return (
      <div
        key={row.id}
        className={`relative ${padding} ${rail} before:top-0 ${elbow} ${
          stopRail ? 'before:h-9' : 'pb-3 before:h-full'
        }`}
      >
        <NodeCard {...cardProps(row.node)} collapsed={false} />
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center">
      <NodeCard {...cardProps(node)} collapsed={isCollapsed && node.children.length > 0} />

      {showChildren && trailedRows.length > 0 && columns.length === 1 && (
        <div className={`relative flex w-[544px] flex-col pt-2 ${IC_RAIL} before:top-0 before:h-2`}>
          {trailedRows.map((row, index) =>
            renderRow(row, true, index === trailedRows.length - 1 && leaders.length === 0),
          )}
        </div>
      )}

      {showChildren && columns.length > 1 && (
        <div
          className={`relative flex items-start justify-center pt-8 ${AXIS} before:top-0 before:h-8`}
        >
          {leaders.length > 0 && (
            <span className="absolute top-0 left-1/2 h-full w-[var(--hair,1px)] bg-slate-300" />
          )}
          {columns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              className={`relative w-[304px] pt-6 ${COL_RAIL} before:top-0 before:h-6 ${COL_BUS}`}
            >
              {column.map((row, index) => renderRow(row, false, index === column.length - 1))}
            </div>
          ))}
        </div>
      )}

      {showChildren && leaders.length > 0 && (
        <div
          className={`relative flex items-start justify-center pt-10 ${AXIS} before:top-0 before:h-10`}
        >
          {(() => {
            // Même logique que pour les rails : à partir du premier leader en dotted line, le trait
            // (vertical ET horizontal) reste pointillé pour les branches suivantes.
            let sawDottedLeader = false;
            return leaders.map((child) => {
              if (child.dotted) sawDottedLeader = true;
              const dashed = sawDottedLeader;
              return (
                <div
                  key={child.employee.key}
                  className={`relative flex flex-col items-center px-4 pt-5 ${
                    dashed ? AXIS_DASHED : AXIS
                  } before:top-0 before:h-5 ${dashed ? BUS_DASHED : BUS}`}
                >
                  <Branch
                    node={child}
                    collapsed={collapsed}
                    visibleKeys={visibleKeys}
                    matchedKeys={matchedKeys}
                    categories={categories}
                    printMode={printMode}
                    selectedKey={selectedKey}
                    focusedKey={focusedKey}
                    onToggle={onToggle}
                    onSelect={onSelect}
                  />
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
});

interface TreeBlockProps extends TreeProps {
  root: OrgNode;
}

export const TreeBlock = memo(function TreeBlock({ root, ...rest }: TreeBlockProps) {
  return (
    <section className="flex min-w-max flex-col items-center rounded-3xl border border-slate-200 bg-white/60 px-8 pt-4 pb-8 shadow-sm">
      <header className="mb-4 flex items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
        <span className="size-1.5 rounded-full bg-indigo-500" />
        {root.employee.worker}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] normal-case">
          {t.tree.people(root.descendants + 1)}
        </span>
      </header>
      <Branch node={root} {...rest} />
    </section>
  );
});

export const CategoryLegend = memo(function CategoryLegend() {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {CATEGORY_PRIORITY.map((id) => (
        <li
          key={id}
          className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-inset"
        >
          <span className={`size-2 rounded-full ${CATEGORY_META[id].bar}`} />
          {CATEGORY_META[id].label}
        </li>
      ))}
    </ul>
  );
});
