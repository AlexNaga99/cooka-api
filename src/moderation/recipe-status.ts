import { FieldValue } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../config/firebase.config';

/**
 * Estados de uma receita.
 * - published: visível para todos (único estado que entra em feed/busca/perfis públicos)
 * - draft: rascunho do autor
 * - pending: aguardando análise automática (visível só para o autor, "Em análise")
 * - review: suspeita (análise automática duvidosa ou denúncias); escondida até revisão manual
 * - rejected: reprovada; só o autor vê
 */
export type RecipeStatusValue = 'published' | 'draft' | 'pending' | 'review' | 'rejected';

/** Estados que só o autor enxerga. */
export function isHiddenFromOthers(status: string | undefined | null): boolean {
  return (status ?? 'published') !== 'published';
}

/**
 * Troca o status da receita e mantém o contador `recipesCount` do autor coerente:
 * só receitas `published` contam.
 */
export async function transitionRecipeStatus(
  recipeId: string,
  to: RecipeStatusValue,
  extra: Record<string, unknown> = {},
): Promise<{ from: string; changed: boolean }> {
  const db = getFirestoreDb();
  const ref = db.collection('recipes').doc(recipeId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { from: 'missing', changed: false };
    const data = snap.data() as { authorId: string; status?: string };
    const from = data.status ?? 'published';
    tx.update(ref, { status: to, ...extra });
    if (from !== to) {
      const delta = to === 'published' ? 1 : from === 'published' ? -1 : 0;
      if (delta !== 0) {
        tx.set(
          db.collection('users').doc(data.authorId),
          { recipesCount: FieldValue.increment(delta) },
          { merge: true },
        );
      }
    }
    return { from, changed: from !== to };
  });
}
