/**
 * Script para inserir 50 receitas de teste na collection recipes (paginação/busca).
 * Uso: npm run seed:recipes
 * Opcional: SEED_AUTHOR_ID=uid-do-usuario (senão usa "seed-author")
 */
import { config } from 'dotenv';

config({ path: process.cwd() + '/.env' });

import { getFirestoreDb } from '../config/firebase.config';

const COUNT = 50;
const AUTHOR_ID = process.env.SEED_AUTHOR_ID ?? 'seed-author';

const TITLES = [
  'Bolo de chocolate',
  'Bolo de cenoura',
  'Arroz branco soltinho',
  'Feijão tropeiro',
  'Frango assado',
  'Salada Caesar',
  'Sopa de legumes',
  'Omelete de queijo',
  'Panqueca americana',
  'Massa ao molho branco',
  'Hambúrguer caseiro',
  'Pizza margherita',
  'Torta de limão',
  'Brigadeiro',
  'Pudim de leite',
  'Brownie de chocolate',
  'Cookie de aveia',
  'Smoothie de morango',
  'Suco verde',
  'Cuscuz nordestino',
  'Carne de sol com macaxeira',
  'Moqueca de peixe',
  'Acarajé',
  'Pão de queijo',
  'Coxinha',
  'Pastel de carne',
  'Risoto de cogumelos',
  'Lasanha à bolonhesa',
  'Strogonoff de frango',
  'Filé à parmegiana',
  'Batata frita',
  'Purê de batata',
  'Salada de folhas',
  'Creme de espinafre',
  'Quiche de legumes',
  'Torta de frango',
  'Empadão de palmito',
  'Bolinho de chuva',
  'Canjica',
  'Mungunzá',
  'Baião de dois',
  'Galinhada',
  'Vaca atolada',
  'Churrasco',
  'Costela no bafo',
  'Peixe grelhado',
  'Camarão alho e óleo',
  'Caldo de cana',
  'Vitamina de abacate',
  'Mousse de maracujá',
];

function generateRecipes() {
  const recipes = [];
  const now = new Date();
  for (let i = 0; i < COUNT; i++) {
    const title = TITLES[i % TITLES.length] + (i >= TITLES.length ? ` ${i + 1}` : '');
    const titleLower = title.trim().toLowerCase();
    recipes.push({
      authorId: AUTHOR_ID,
      title,
      titleLower,
      description: `Receita de teste para paginação e busca. ${title}.`,
      ingredients: null,
      preparationSteps: null,
      mediaUrls: [],
      videoUrl: null,
      categories: ['dessert', 'lunch', 'home-cooking'].slice(0, 1 + (i % 3)),
      tags: ['easy', 'traditional'].slice(0, 1 + (i % 2)),
      isVariation: false,
      parentRecipeId: null,
      ratingAvg: 0,
      ratingsCount: 0,
      popularityScore: i,
      status: 'published',
      createdAt: new Date(now.getTime() - (COUNT - i) * 60000),
    });
  }
  return recipes;
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Defina GOOGLE_APPLICATION_CREDENTIALS no .env');
    process.exit(1);
  }
  if (AUTHOR_ID === 'seed-author') {
    console.warn('SEED_AUTHOR_ID não definido; usando "seed-author". Defina um uid real se quiser autor válido.');
  }

  const db = getFirestoreDb();
  const recipes = generateRecipes();
  const batch = db.batch();

  recipes.forEach((data) => {
    const ref = db.collection('recipes').doc();
    batch.set(ref, data);
  });

  await batch.commit();
  console.log(`Inseridas ${COUNT} receitas de teste. authorId=${AUTHOR_ID}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
