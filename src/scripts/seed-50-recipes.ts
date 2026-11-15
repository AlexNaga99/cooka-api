/**
 * Insere 50 receitas brasileiras detalhadas no Firestore, atribuídas ao
 * ÚNICO usuário existente no banco.
 *
 * Uso:
 *   npm run build
 *   node dist/scripts/seed-50-recipes.js
 *
 * Variáveis:
 *   DRY_RUN=1                 — só mostra o que seria inserido, não grava
 *   AUTHOR_ID=<uid>           — força um authorId específico (default: pega o único user)
 *   SKIP_USER_LOOKUP=1        — pula a busca e exige AUTHOR_ID no env
 */
import { config } from 'dotenv';
config({ path: process.cwd() + '/.env' });

import { readFileSync } from 'fs';
import { join } from 'path';
import { getFirestoreDb } from '../config/firebase.config';

const DRY_RUN = process.env.DRY_RUN === '1';

interface RecipeSeed {
  title: string;
  description: string;
  ingredients: string;
  preparationSteps: string;
  categories: string[];
  tags: string[];
}

async function resolveAuthorId(): Promise<string> {
  if (process.env.AUTHOR_ID) return process.env.AUTHOR_ID;
  if (process.env.SKIP_USER_LOOKUP === '1') {
    throw new Error('SKIP_USER_LOOKUP=1 mas AUTHOR_ID não foi definido');
  }
  const db = getFirestoreDb();
  const snap = await db.collection('users').get();
  if (snap.size !== 1) {
    throw new Error(
      `Esperava exatamente 1 user no Firestore, encontrei ${snap.size}. ` +
      `Defina AUTHOR_ID=<uid> ou SKIP_USER_LOOKUP=1 + AUTHOR_ID.`,
    );
  }
  const doc = snap.docs[0];
  console.log(`Autor detectado: id=${doc.id} name=${(doc.data() as { name?: string }).name}`);
  return doc.id;
}

function loadRecipes(): RecipeSeed[] {
  const fromCwd = join(process.cwd(), 'src', 'scripts', 'data', '50-recipes.json');
  const raw = readFileSync(fromCwd, 'utf-8');
  return JSON.parse(raw) as RecipeSeed[];
}

async function main() {
  const authorId = await resolveAuthorId();
  const recipes = loadRecipes();
  console.log(`Receitas carregadas: ${recipes.length}`);

  if (recipes.length !== 50) {
    console.warn(`!! Esperava 50 receitas, o arquivo tem ${recipes.length}`);
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: primeiras 3 receitas ---');
    recipes.slice(0, 3).forEach((r, i) => {
      console.log(`\n[${i + 1}] ${r.title}`);
      console.log(`   cats: ${r.categories.join(', ')}`);
      console.log(`   tags: ${r.tags.join(', ')}`);
      console.log(`   desc length: ${r.description.length}`);
      console.log(`   ingr length: ${r.ingredients.length}`);
      console.log(`   steps length: ${r.preparationSteps.length}`);
    });
    return;
  }

  const db = getFirestoreDb();
  const now = new Date();
  const batch = db.batch();

  for (const r of recipes) {
    const ref = db.collection('recipes').doc();
    const ingredients = r.ingredients;
    const preparationSteps = r.preparationSteps;
    batch.set(ref, {
      authorId,
      title: r.title,
      titleLower: r.title.trim().toLowerCase(),
      description: r.description,
      ingredients,
      preparationSteps,
      mediaUrls: [],
      videoUrl: null,
      categories: r.categories,
      tags: r.tags,
      isVariation: false,
      parentRecipeId: null,
      ratingAvg: 0,
      ratingsCount: 0,
      ratingSum: 0,
      popularityScore: 0,
      status: 'published',
      createdAt: now,
    });
  }

  // Incremento desnormalizado do contador do autor (igual RecipesService.create faz).
  batch.set(
    db.collection('users').doc(authorId),
    { recipesCount: require('firebase-admin').firestore.FieldValue.increment(recipes.length) },
    { merge: true },
  );

  console.log('Gravando batch...');
  await batch.commit();
  console.log(`OK: ${recipes.length} receitas inseridas. recipesCount do autor += ${recipes.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  });
