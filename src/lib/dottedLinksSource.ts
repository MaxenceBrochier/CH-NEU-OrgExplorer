import type { DottedLinks, Employee } from '../types';
import { NO_DOTTED_LINE } from '../types';
import { personId } from './buildTree';
import { Wts_neuchatelorgdottedlinksService as DottedLinkService } from '../generated';

/**
 * Récupère les dotted links depuis Dataverse.
 * Filtre automatiquement les liens dont l'employé n'est plus actif (leaveOrNot !== 'A').
 * Supprime automatiquement les liens si l'employé est inactif, terminé ou "T".
 */
export async function fetchDottedLinks(activeEmployees: Employee[]): Promise<DottedLinks> {
  try {
    // Construit un map des employés actifs (leaveOrNot === 'A') par personId
    const activePersonIds = new Set(
      activeEmployees
        .filter((e) => e.leaveOrNot === 'A')
        .map((e) => personId(e))
    );

    const links: DottedLinks = {};
    const recordsToDelete: string[] = [];

    // Récupère tous les dotted links depuis Dataverse
    const records = await fetchDottedLinksFromDataverse();

    // Filtre : ne garde que les liens où la personne est toujours active
    for (const record of records) {
      const personIdValue = record.wts_personid?.trim();
      const managerIdValue = record.wts_managerid?.trim();

      if (!personIdValue) continue;

      if (activePersonIds.has(personIdValue)) {
        // L'employé est actif (A) : on garde le dotted link
        links[personIdValue] = managerIdValue || NO_DOTTED_LINE;
      } else {
        // L'employé n'est plus actif : marquer pour suppression
        recordsToDelete.push(record.wts_dottedlinkid);
      }
    }

    // Supprime les liens dont l'employé n'est plus actif (asynchrone, non bloquant)
    if (recordsToDelete.length > 0) {
      deleteDottedLinksInBulkAsync(recordsToDelete).catch((error) => {
        console.warn('Erreur lors de la suppression des dotted links inactifs:', error);
      });
    }

    return links;
  } catch (error) {
    console.error('Erreur lors de la récupération des dotted links :', error);
    return {}; // Fallback en cas d'erreur
  }
}

/**
 * Sauvegarde un dotted link dans Dataverse.
 * Crée ou met à jour le record.
 */
export async function saveDottedLink(
  personIdValue: string,
  managerIdValue: string,
): Promise<void> {
  try {
    const existingId = await findDottedLinkId(personIdValue);

    if (existingId) {
      // Mise à jour
      await updateDottedLinkInDataverse(existingId, managerIdValue);
    } else {
      // Création
      await createDottedLinkInDataverse(personIdValue, managerIdValue);
    }
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du dotted link :', error);
    throw error;
  }
}

/**
 * Supprime un dotted link de Dataverse.
 */
export async function deleteDottedLink(personIdValue: string): Promise<void> {
  try {
    const existingId = await findDottedLinkId(personIdValue);
    if (existingId) {
      await deleteDottedLinkFromDataverse(existingId);
    }
  } catch (error) {
    console.error('Erreur lors de la suppression du dotted link :', error);
    throw error;
  }
}

// --- Accès Dataverse via le SDK Power Apps (service généré) ---

interface DottedLinkRecord {
  wts_dottedlinkid: string;
  wts_personid: string;
  wts_managerid: string;
}

function assertOk(result: { success: boolean; error?: { message?: string } }, action: string): void {
  if (!result.success) {
    throw new Error(result.error?.message ?? `Échec Dataverse : ${action}.`);
  }
}

async function fetchDottedLinksFromDataverse(): Promise<DottedLinkRecord[]> {
  const result = await DottedLinkService.getAll({
    select: ['wts_neuchatelorgdottedlinkid', 'wts_personid', 'wts_managerid'],
  });
  assertOk(result, 'lecture des dotted links');
  return (result.data ?? []).map((r) => ({
    wts_dottedlinkid: r.wts_neuchatelorgdottedlinkid,
    wts_personid: r.wts_personid ?? '',
    wts_managerid: r.wts_managerid ?? '',
  }));
}

async function findDottedLinkId(personIdValue: string): Promise<string | null> {
  const escaped = personIdValue.replace(/'/g, "''");
  const result = await DottedLinkService.getAll({
    select: ['wts_neuchatelorgdottedlinkid'],
    filter: `wts_personid eq '${escaped}'`,
    top: 1,
  });
  assertOk(result, 'recherche du dotted link');
  return result.data?.[0]?.wts_neuchatelorgdottedlinkid ?? null;
}

async function createDottedLinkInDataverse(
  personIdValue: string,
  managerIdValue: string,
): Promise<void> {
  // ownerid/statecode sont requis par le type généré mais doivent être omis : Dataverse les renseigne seul.
  const payload = {
    wts_name: `${personIdValue} → ${managerIdValue}`,
    wts_personid: personIdValue,
    wts_managerid: managerIdValue,
  } as Parameters<typeof DottedLinkService.create>[0];
  const result = await DottedLinkService.create(payload);
  assertOk(result, 'création du dotted link');
}

async function updateDottedLinkInDataverse(
  recordId: string,
  managerIdValue: string,
): Promise<void> {
  const result = await DottedLinkService.update(recordId, { wts_managerid: managerIdValue });
  assertOk(result, 'mise à jour du dotted link');
}

async function deleteDottedLinkFromDataverse(recordId: string): Promise<void> {
  await DottedLinkService.delete(recordId);
}

/** Supprime en parallèle (non bloquant) les liens des employés devenus inactifs. */
async function deleteDottedLinksInBulkAsync(recordIds: string[]): Promise<void> {
  await Promise.all(
    recordIds.map((id) =>
      deleteDottedLinkFromDataverse(id).catch((error) => {
        console.warn(`Impossible de supprimer dotted link ${id}:`, error);
      }),
    ),
  );
}