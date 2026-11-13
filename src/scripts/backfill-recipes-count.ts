/**
 * Backfill: recalcula `recipesCount` (receitas publicadas) e garante `nameLower` de cada usuário.
 * Sem `nameLower` o usuário não aparece na busca de cozinheiros por nome.
 * Usuários antigos ficaram com 0 e sumiam de /users/cooks e do "N receitas" do perfil.
 *
 * Uso (após build):  node dist/scripts/backfill-recipes-count.js [--apply]
 * Sem --apply apenas mostra o que mudaria (dry-run). Idempotente.
 */
import 'dotenv/config';
import { getFirestoreDb } from '../config/firebase.config';

async function main() {
  const apply = process.argv.includes('--apply');
  const db = getFirestoreDb();
  const users = await db.collection('users').get();
  let changed = 0;
  for (const u of users.docs) {
    const agg = await db
      .collection('recipes')
      .where('authorId', '==', u.id)
      .where('status', '==', 'published')
      .count()
      .get();
    const real = agg.data().count;
    const current = (u.data().recipesCount as number | undefined) ?? 0;
    const name = (u.data().name as string | undefined) ?? '';
    const nameLower = name.toLowerCase();
    const updates: Record<string, unknown> = {};
    if (real !== current) updates.recipesCount = real;
    if (name && u.data().nameLower !== nameLower) updates.nameLower = nameLower;
    if (Object.keys(updates).length > 0) {
      console.log(`${u.id} (${name}): ${JSON.stringify(updates)}`);
      changed++;
      if (apply) await u.ref.update(updates);
    }
  }
  console.log(`${apply ? 'Aplicado' : 'Dry-run'}: ${changed} usuário(s) a corrigir.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
