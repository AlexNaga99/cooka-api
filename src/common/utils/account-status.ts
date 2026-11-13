import { getFirestoreDb } from '../../config/firebase.config';

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, { deleted: boolean; at: number }>();

/**
 * Retorna true se a conta foi excluída (users/{uid}.deletedAt != null).
 * Cache em memória de 60s para não gerar uma leitura no Firestore por request.
 * Em caso de falha de leitura, falha aberta (não derruba a API por indisponibilidade do Firestore).
 */
export async function isAccountDeleted(uid: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && now - hit.at < TTL_MS) return hit.deleted;
  let deleted = false;
  try {
    const doc = await getFirestoreDb().collection('users').doc(uid).get();
    deleted = doc.exists && (doc.data() as { deletedAt?: unknown }).deletedAt != null;
  } catch {
    return false;
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(uid, { deleted, at: now });
  return deleted;
}

/** Invalida o cache (ex.: logo após excluir a conta). */
export function markAccountDeleted(uid: string): void {
  cache.set(uid, { deleted: true, at: Date.now() });
}
