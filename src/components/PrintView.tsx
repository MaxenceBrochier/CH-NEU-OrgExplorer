import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CategoryLegend, TreeBlock } from './OrgChart';
import {
  DEFAULT_PRINT_OPTIONS,
  PDF_MAX_SIDE_MM,
  PLOTTER_MAX_WIDTH_MM,
  PLOTTER_MIN_LENGTH_MM,
  PLOTTER_MIN_WIDTH_MM,
  planPrint,
  pxToMm,
} from '../lib/printPlan';
import type { PrintBlock, PrintOptions, PrintPlan } from '../lib/printPlan';
import type { CategoryId } from '../lib/categories';
import type { OrgNode } from '../types';

interface PrintViewProps {
  roots: OrgNode[];
  visibleKeys: Set<string> | null;
  categories: Map<string, CategoryId[]>;
  /** Déclenche l'impression dès que la mise en page finale est prête. */
  autoPrint?: boolean;
  onPrinted?: () => void;
}

const EMPTY = new Set<string>();
const noop = () => {};

const PAPER_PRESETS: Array<{ label: string; widthMm: number }> = [
  { label: 'Laize 914,4 mm (max)', widthMm: PLOTTER_MAX_WIDTH_MM },
  { label: 'Laize 841 mm (A0)', widthMm: 841 },
  { label: 'Laize 610 mm', widthMm: 610 },
  { label: 'Laize 420 mm (A2)', widthMm: 420 },
  { label: 'Laize 297 mm (A3)', widthMm: 297 },
];

export function PrintView({ roots, visibleKeys, categories, autoPrint, onPrinted }: PrintViewProps) {
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [plan, setPlan] = useState<PrintPlan | null>(null);
  const [preview, setPreview] = useState(0.2);
  const [exact, setExact] = useState<{ widthMm: number; heightMm: number } | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measures = useRef(new Map<string, PrintBlock>());

  const visibleRoots = visibleKeys
    ? roots.filter((root) => visibleKeys.has(root.employee.key))
    : roots;

  useEffect(() => setPlan(null), [roots, visibleKeys, options]);

  // Première passe : les blocs sont rendus à l'échelle 1 hors écran pour être mesurés.
  useLayoutEffect(() => {
    if (plan || !measureRef.current) return;
    const blocks: PrintBlock[] = Array.from(measureRef.current.children).map((child) => {
      const element = child as HTMLElement;
      return {
        key: element.dataset.key ?? '',
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    });
    measures.current = new Map(blocks.map((block) => [block.key, block]));
    setPlan(planPrint(blocks, options));
  }, [plan, options]);

  useEffect(() => setExact(null), [plan]);

  // Le PDF doit faire exactement la taille du rendu : on mesure la bande réellement produite.
  useLayoutEffect(() => {
    if (!plan || exact) return;
    const rendered = contentRefs.current.filter((element): element is HTMLDivElement => !!element);
    if (rendered.length === 0) return;
    const contentWidthMm = Math.max(...rendered.map((element) => pxToMm(element.offsetWidth)));
    const contentHeightMm = Math.max(...rendered.map((element) => pxToMm(element.offsetHeight)));
    const acrossMm = (options.rotate ? contentHeightMm : contentWidthMm) + 2 * options.marginMm;
    const alongMm = (options.rotate ? contentWidthMm : contentHeightMm) + 2 * options.marginMm;
    setExact({
      // Millimètres entiers : une taille de page fractionnaire fait échouer certains moteurs PDF.
      widthMm: Math.max(1, Math.floor(Math.min(options.paperWidthMm, Math.ceil(acrossMm)))),
      heightMm: Math.max(
        1,
        Math.floor(Math.min(options.maxLengthMm, PDF_MAX_SIDE_MM, Math.ceil(alongMm))),
      ),
    });
  }, [plan, exact, options]);

  // Impression demandée depuis la palette : on attend que le plan et les dimensions finales
  // (@page) soient calculés, puis peints, avant d'appeler window.print().
  useEffect(() => {
    if (!autoPrint || !plan || !exact) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        onPrinted?.();
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [autoPrint, plan, exact, onPrinted]);

  const pageWidthMm = exact?.widthMm ?? plan?.pageWidthMm ?? 0;
  const pageHeightMm = exact?.heightMm ?? plan?.pageHeightMm ?? 0;

  const rootByKey = new Map(visibleRoots.map((root) => [root.employee.key, root]));
  const blockProps = {
    collapsed: EMPTY,
    visibleKeys,
    matchedKeys: EMPTY,
    categories,
    printMode: true,
    selectedKey: null,
    onToggle: noop,
    onSelect: noop,
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-white px-6 py-4 print:hidden">
        <label className="text-xs text-slate-500">
          Laize (largeur papier)
          <select
            value={
              PAPER_PRESETS.find((preset) => preset.widthMm === options.paperWidthMm)?.label ?? ''
            }
            onChange={(event) => {
              const preset = PAPER_PRESETS.find((item) => item.label === event.target.value);
              if (preset) setOptions({ ...options, paperWidthMm: preset.widthMm });
            }}
            className="mt-1 block w-52 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
          >
            <option value="">Personnalisée</option>
            {PAPER_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Laize (mm)
          <input
            type="number"
            min={PLOTTER_MIN_WIDTH_MM}
            max={PLOTTER_MAX_WIDTH_MM}
            step={0.1}
            value={options.paperWidthMm}
            onChange={(event) =>
              setOptions({
                ...options,
                paperWidthMm: Math.min(
                  PLOTTER_MAX_WIDTH_MM,
                  Math.max(PLOTTER_MIN_WIDTH_MM, Number(event.target.value) || PLOTTER_MAX_WIDTH_MM),
                ),
              })
            }
            className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Longueur max (mm)
          <input
            type="number"
            min={PLOTTER_MIN_LENGTH_MM}
            max={PDF_MAX_SIDE_MM}
            value={options.maxLengthMm}
            onChange={(event) =>
              setOptions({
                ...options,
                maxLengthMm: Math.min(
                  PDF_MAX_SIDE_MM,
                  Math.max(PLOTTER_MIN_LENGTH_MM, Number(event.target.value) || 3000),
                ),
              })
            }
            className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex items-center gap-2 pb-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={options.rotate}
            onChange={(event) => setOptions({ ...options, rotate: event.target.checked })}
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Coucher le long du rouleau
        </label>
        <label className="text-xs text-slate-500">
          Marge (mm)
          <input
            type="number"
            min={0}
            max={50}
            value={options.marginMm}
            onChange={(event) => setOptions({ ...options, marginMm: Number(event.target.value) })}
            className="mt-1 block w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Écart blocs (mm)
          <input
            type="number"
            min={0}
            max={100}
            value={options.gapMm}
            onChange={(event) => setOptions({ ...options, gapMm: Number(event.target.value) })}
            className="mt-1 block w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
          />
        </label>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 text-sm">
            <button
              type="button"
              onClick={() => setPreview((value) => Math.max(0.05, +(value - 0.05).toFixed(2)))}
              className="px-3 py-1.5 transition hover:bg-slate-100"
            >
              −
            </button>
            <span className="w-16 border-x border-slate-200 py-1.5 text-center text-xs text-slate-500">
              {Math.round(preview * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setPreview((value) => Math.min(1, +(value + 0.05).toFixed(2)))}
              className="px-3 py-1.5 transition hover:bg-slate-100"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Imprimer / PDF
          </button>
        </div>

        {plan && (
          <div className="w-full space-y-1 text-xs text-slate-500">
            <p>
              <strong className="font-semibold text-slate-700">
                {plan.pages.length} bande{plan.pages.length > 1 ? 's' : ''}
              </strong>{' '}
              de {pageWidthMm} mm de laize × {pageHeightMm} mm de longueur, organigramme réduit à{' '}
              {Math.round(plan.scale * 100)} %.
              {options.rotate && ' Le graphe est couché : sa hauteur tient dans la laize.'}
              {plan.overflow && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                  Texte très petit : augmentez la laize ou filtrez l'organigramme.
                </span>
              )}
            </p>
            <p>
              Dans le dialogue d'impression : échelle <strong>100 %</strong> (pas « Ajuster »),
              marges <strong>Aucune</strong>, <strong>graphiques d'arrière-plan</strong> activés.
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <strong>Fichier PDF de 0 Ko ?</strong> Choisissez la destination{' '}
              <strong>« Enregistrer au format PDF »</strong> (Chrome / Edge), qui accepte les grands
              formats. La destination <strong>« Microsoft Print to PDF »</strong> refuse les tailles
              supérieures à l'A0 ({pageWidthMm}&nbsp;mm ici) et produit un fichier vide. Pour le
              plotter, sélectionnez le rouleau correspondant à la laize dans le pilote.
            </p>
          </div>
        )}
      </div>

      {!plan && (
        <div ref={measureRef} className="pointer-events-none absolute -left-[20000px] top-0">
          {visibleRoots.map((root) => (
            <div key={root.employee.key} data-key={root.employee.key} className="w-max">
              <TreeBlock root={root} {...blockProps} />
            </div>
          ))}
        </div>
      )}

      {plan && pageWidthMm > 0 && pageHeightMm > 0 && (
        <>
          <style>{`@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }`}</style>
          <div
            className="origin-top-left print:!transform-none"
            style={{ transform: `scale(${preview})` }}
          >
            {plan.pages.map((page, index) => (
              <div
                key={index}
                className={`relative overflow-hidden bg-white print:shadow-none ${
                  index < plan.pages.length - 1 ? 'break-after-page' : ''
                }`}
                style={{
                  width: `${pageWidthMm}mm`,
                  height: `${pageHeightMm}mm`,
                }}
              >
                <div
                  ref={(element) => {
                    contentRefs.current[index] = element;
                  }}
                  // Couché : le contenu pivote d'un quart de tour et se décale de sa largeur.
                  className="absolute flex w-max origin-top-left flex-col"
                  style={{
                    top: `${options.marginMm}mm`,
                    left: `${options.marginMm}mm`,
                    transform: options.rotate ? 'rotate(-90deg) translateX(-100%)' : undefined,
                  }}
                >
                  <div className="flex w-max items-start" style={{ gap: `${options.gapMm}mm` }}>
                    {page.map((key) => {
                      const measure = measures.current.get(key);
                      const root = rootByKey.get(key);
                      if (!measure || !root) return null;
                      return (
                        <div
                          key={key}
                          style={{
                            width: measure.width * plan.scale,
                            height: measure.height * plan.scale,
                          }}
                        >
                          <div
                            className="origin-top-left"
                            style={
                              {
                                width: measure.width,
                                height: measure.height,
                                transform: `scale(${plan.scale})`,
                                // Compense l'échelle pour que les traits fassent 1px réel au PDF.
                                '--hair': `${1 / plan.scale}px`,
                              } as CSSProperties
                            }
                          >
                            <TreeBlock root={root} {...blockProps} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-[12mm] flex items-end justify-between gap-8">
                    <CategoryLegend />
                    <span className="text-[10px] whitespace-nowrap text-slate-400">
                      {new Date().toLocaleDateString('fr-CH')} · bande {index + 1}/
                      {plan.pages.length}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
