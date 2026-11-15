/**
 * Lista todos os users do Firestore (debug).
 */
import { config } from 'dotenv';
config({ path: process.cwd() + '/.env' });

import { getFirestoreDb } from '../config/firebase.config';

async function main() {
  const db = getFirestoreDb();
  const snap = await db.collection('users').get();
  console.log(`Total users: ${snap.size}`);
  for (const d of snap.docs) {
    const data = d.data();
    console.log(`- id=${d.id} name=${data.name} email=${data.email} recipesCount=${data.recipesCount ?? 0}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
