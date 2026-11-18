import { Wts_neuchatelorgsettingsService as SettingsService } from '../generated';
import { DEFAULT_RULES } from './categories';
import type { CategoryExclusions, CategoryRules } from './categories';

export interface AppConfig {
  rules: CategoryRules;
  exclusions: CategoryExclusions;
}

export const DEFAULT_CONFIG: AppConfig = { rules: DEFAULT_RULES, exclusions: {} };

// Une seule ligne partagée par tous les utilisateurs du site.
const CONFIG_KEY = 'categories';

async function findConfigRow() {
  const result = await SettingsService.getAll({
    select: ['wts_neuchatelorgsettingid', 'wts_value'],
    filter: `wts_name eq '${CONFIG_KEY}'`,
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Lecture de la configuration impossible.');
  }
  return result.data?.[0] ?? null;
}

/** Renvoie null tant que la configuration n'a jamais été enregistrée. */
export async function loadConfig(): Promise<AppConfig | null> {
  const row = await findConfigRow();
  if (!row?.wts_value) return null;
  const stored = JSON.parse(row.wts_value) as Partial<AppConfig>;
  return {
    // Une catégorie ajoutée après l'enregistrement retombe sur ses valeurs par défaut.
    rules: { ...DEFAULT_RULES, ...stored.rules },
    exclusions: stored.exclusions ?? {},
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const value = JSON.stringify(config);
  const row = await findConfigRow();
  const result = row
    ? await SettingsService.update(row.wts_neuchatelorgsettingid, { wts_value: value })
    : // ownerid/statecode sont requis par le type généré mais Dataverse les renseigne seul.
      await SettingsService.create({
        wts_name: CONFIG_KEY,
        wts_value: value,
      } as Parameters<typeof SettingsService.create>[0]);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Enregistrement de la configuration impossible.');
  }
}
