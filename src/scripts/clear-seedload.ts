/**
 * Apaga do Firestore APENAS os docs criados com o prefixo configurável
 * (default: 'seedload_'). Projetado para limpar dados do seed-load-test
 * sem mexer em produção, refresh_tokens, follows antigos etc.
 *
 * Coleções varridas: users, recipes.
 *
 * Uso:
 *   npm run build
 *   node dist/scripts/clear-seedload.js                # usa prefixo 'seedload_'
 *   SEED_PREFIX=seedload_ node dist/scripts/clear-seedload.js
 *   DRY_RUN=1 node dist/scripts/clear-seedload.js      # só conta, não apaga
 *
 * Como apaga em lotes de 500 (limite do batch do Firestore).
 */
import { config } from 'dotenv';
config({ path: process.cwd() + '/.env' });

import { getFirestoreDb } from '../config/firebase.config';

const PREFIX = process.env.SEED_PREFIX ?? 'seedload_';
const DRY_RUN = process.env.DRY_RUN === '1';

// chave "maior" para o range query: troca o último caractere por algo acima
// de qualquer letra/dígito — 'z' não serve porque tem letra antes; usamos
// o caractere Unicode U+FFFF que ordena depois de tudo em ASCII/Unicode básico.
const PREFIX_END = PREFIX.slice(0, -1) + String.fromCharCode(0xffff);

const COLLECTIONS = ['users', 'recipes'] as const;

async function countInRange(coll: string): Promise<number> {
  const db = getFirestoreDb();
  const snap = await db
    .collection(coll)
    .where('__name__', '>=', PREFIX)
    .where('__name__', '<', PREFIX_END)
    .get();
  return snap.size;
}

async function deleteInRange(coll: string): Promise<number> {
  const db = getFirestoreDb();
  const snap = await db
    .collection(coll)
    .where('__name__', '>=', PREFIX)
    .where('__name__', '<', PREFIX_END)
    .get();

  if (snap.empty) return 0;

  let deleted = 0;
  const docs = snap.docs;

  // Processa em chunks de 400 (sob o limite de 500 do commit batch)
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const d of slice) {
      batch.delete(d.ref);
    }
    await batch.commit();
    deleted += slice.length;
    console.log(`  ${coll}: ${deleted}/${docs.length} deletados`);
  }
  return deleted;
}

async function main() {
  console.log(`\n=== clear-seedload ===`);
  console.log(`Prefixo:   "${PREFIX}"`);
  console.log(`Range end: "${PREFIX_END}"`);
  console.log(`Modo:      ${DRY_RUN ? 'DRY RUN (não apaga)' : 'REAL (vai deletar)'}`);
  console.log(`Coleções:  ${COLLECTIONS.join(', ')}`);
  console.log('');

  // contagem prévia
  console.log('Contando docs no range...');
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) {
    counts[c] = await countInRange(c);
    console.log(`  ${c}: ${counts[c]} docs`);
  }
  console.log('');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('Nada para apagar.');
    return;
  }

  if (DRY_RUN) {
    console.log(`DRY RUN: ${total} docs seriam apagados.`);
    return;
  }

  console.log(`Apagando ${total} docs...`);
  let deleted = 0;
  for (const c of COLLECTIONS) {
    if (counts[c] > 0) {
      deleted += await deleteInRange(c);
    }
  }
  console.log(`\nPronto. ${deleted} docs apagados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  });
