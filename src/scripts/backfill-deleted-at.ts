/**
 * Backfill: garante `deletedAt: null` em users antigos.
 * As queries de busca/cozinheiros usam where('deletedAt','==',null), que NÃO casa com
 * documentos sem o campo — esses usuários ficavam invisíveis.
 *
 * Uso (após build):  node dist/scripts/backfill-deleted-at.js
 * Requer GOOGLE_APPLICATION_CREDENTIALS no ambiente. Idempotente.
 */
import 'dotenv/config';
import { getFirestoreDb } from '../config/firebase.config';

async function main() {
  const db = getFirestoreDb();
  let updated = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('users').orderBy('__name__').limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let inBatch = 0;
    for (const d of snap.docs) {
      if (!('deletedAt' in d.data())) {
        batch.update(d.ref, { deletedAt: null });
        inBatch++;
      }
    }
    if (inBatch > 0) await batch.commit();
    updated += inBatch;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  console.log(`Backfill concluído: ${updated} usuário(s) atualizado(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
