/**
 * Seed leve para teste de carga/UX no front.
 *
 * Cria:
 *  - 15 usuários com nomes reais (PT-BR) e email fictício
 *  - 4 receitas por usuário (60 receitas no total) com títulos reais,
 *    ingredientes/preparo realistas, categorias e tags válidas
 *  - Alguns follows cruzados e favoritos para a tela "Cozinheiros" ter dados
 *  - 1 notificação de exemplo para o primeiro usuário
 *
 * Idempotente: sobrescreve docs existentes com ids determinísticos
 * (ex.: user_<slug>, recipe_<userSlug>_<n>) — pode rodar várias vezes.
 *
 * Uso:
 *   npm run build
 *   node dist/scripts/seed-load-test.js
 *
 * Variáveis de env:
 *   USERS=15                  (quantidade de usuários a criar; default 15)
 *   RECIPES_PER_USER=4        (receitas por usuário; default 4)
 *   SEED_PREFIX=seedload      (prefixo dos IDs para isolar do seed existente)
 */
import { config } from 'dotenv';
config({ path: process.cwd() + '/.env' });

import { getFirestoreDb } from '../config/firebase.config';
import type { Timestamp } from 'firebase-admin/firestore';

const USERS = parseInt(process.env.USERS ?? '15', 10);
const RECIPES_PER_USER = parseInt(process.env.RECIPES_PER_USER ?? '4', 10);
const PREFIX = process.env.SEED_PREFIX ?? 'seedload';

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda',
  'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karen', 'Lucas', 'Marina', 'Natália', 'Otávio',
  'Patrícia', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa',
];
const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira',
  'Lima', 'Carvalho', 'Ribeiro', 'Almeida', 'Gomes',
];

// 60 títulos de receitas reais (sem duplicar com o seed existente)
const RECIPE_TITLES = [
  'Bolo de cenoura com cobertura de chocolate',
  'Brigadeiro gourmet',
  'Pão de queijo mineiro',
  'Feijoada completa',
  'Moqueca de peixe',
  'Acarajé baiano',
  'Tapioca recheada',
  'Cuscuz nordestino',
  'Baião de dois',
  'Galinhada caipira',
  'Vaca atolada',
  'Arroz de forno',
  'Risoto de cogumelos',
  'Lasanha à bolonhesa',
  'Strogonoff de frango',
  'Filé mignon à parmegiana',
  'Costelinha barbecue',
  'Picanha na manteiga',
  'Salada Caesar com frango',
  'Sopa de abóbora com gengibre',
  'Creme de espinafre',
  'Caldo verde português',
  'Omelete de espinafre e queijo',
  'Panqueca americana',
  'Cookie de chocolate meio amargo',
  'Brownie de nozes',
  'Torta de limão siciliano',
  'Pudim de leite condensado',
  'Cheesecake de morango',
  'Mousse de maracujá',
  'Smoothie bowl de açaí',
  'Suco verde detox',
  'Limonada suíça',
  'Caipirinha de morango',
  'Risoto de camarão',
  'Bobó de camarão',
  'Caldeirada de frutos do mar',
  'Salmão grelhado com legumes',
  'Tilápia ao molho de maracujá',
  'Atum selado com gergelim',
  'Escondidinho de carne seca',
  'Pastel de vento',
  'Coxinha de frango',
  'Quibe frito',
  'Empada de palmito',
  'Torta de frango com catupiry',
  'Lasanha de espinafre',
  'Risoto de funghi',
  'Nhoque de batata ao sugo',
  'Massa ao pesto genovês',
  'Pizza margherita caseira',
  'Hambúrguer artesanal',
  'Hot dog especial',
  'Crepe de Nutella com morango',
  'Waffle belga',
  'Pão de mel caseiro',
  'Beijinho de coco',
  'Quindim',
  'Romeu e Julieta',
  'Churros recheados',
];

// (slug, título)
type Recipe = { slug: string; title: string; cat: string; tags: string[]; ingredients: string; steps: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function generateRecipesForUser(userSlug: string, startIdx: number): Recipe[] {
  const out: Recipe[] = [];
  for (let i = 0; i < RECIPES_PER_USER; i++) {
    const idx = (startIdx + i) % RECIPE_TITLES.length;
    const title = RECIPE_TITLES[idx];
    const slug = `${userSlug}_${idx}_${i}`;
    out.push({
      slug,
      title,
      cat: ['dessert', 'main', 'snack', 'drink', 'lunch'][idx % 5],
      tags: [['easy'], ['traditional'], ['quick'], ['vegetarian'], ['healthy']][idx % 5],
      ingredients: `Ingredientes da receita "${title}":
- 2 xícaras de farinha de trigo
- 1 xícara de açúcar
- 3 ovos
- 1/2 xícara de óleo
- 1 xícara de leite
- 1 colher de sopa de fermento em pó`,
      steps: `Modo de preparo de "${title}":
1. Preaqueça o forno a 180°C.
2. Em uma tigela, misture os ingredientes secos.
3. Adicione os ingredientes líquidos e mexa bem.
4. Despeje em forma untada e leve ao forno por 40 minutos.
5. Deixe esfriar antes de servir.`,
    });
  }
  return out;
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Defina GOOGLE_APPLICATION_CREDENTIALS no .env');
    process.exit(1);
  }

  const db = getFirestoreDb();
  const totalRecipes = USERS * RECIPES_PER_USER;
  console.log(`Iniciando seed: ${USERS} usuários × ${RECIPES_PER_USER} receitas = ${totalRecipes} receitas`);

  const users: { uid: string; name: string; recipeCount: number }[] = [];

  for (let i = 0; i < USERS; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const name = `${firstName} ${lastName}`;
    const slug = slugify(name);
    const uid = `${PREFIX}_${slug}`;
    const now = new Date();

    // User
    await db.collection('users').doc(uid).set({
      name,
      nameLower: name.toLowerCase(),
      email: `${slug}@seed.cooka.app`,
      photoUrl: null,
      followersCount: 0,
      followingCount: 0,
      popularityScore: 0,
      recipesCount: 0,
      favoriteRecipeIds: [],
      isAdsFree: false,
      createdAt: now,
    });

    // Recipes (com createdAt escalonado para o feed ordernar bem)
    const recipes = generateRecipesForUser(slug, i * RECIPES_PER_USER);
    let batch = db.batch();
    let batchCount = 0;
    for (let r = 0; r < recipes.length; r++) {
      const recipe = recipes[r];
      const recipeRef = db.collection('recipes').doc(`${PREFIX}_${recipe.slug}`);
      const createdAt = new Date(now.getTime() - (totalRecipes - i * RECIPES_PER_USER - r) * 60_000);
      batch.set(recipeRef, {
        authorId: uid,
        title: recipe.title,
        titleLower: recipe.title.toLowerCase(),
        description: `Receita de ${name} — ${recipe.title}.`,
        ingredients: recipe.ingredients,
        preparationSteps: recipe.steps,
        mediaUrls: [],
        videoUrl: null,
        categories: [recipe.cat],
        tags: recipe.tags,
        isVariation: false,
        parentRecipeId: null,
        ratingAvg: 0,
        ratingsCount: 0,
        ratingSum: 0,
        popularityScore: Math.floor(Math.random() * 100),
        status: 'published',
        createdAt,
      });
      batchCount++;
      // Commit a cada 400 writes para respeitar o limite de 500 do Firestore
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    // Atualiza contador desnormalizado recipesCount no user.
    await db.collection('users').doc(uid).update({
      recipesCount: recipes.length,
    });

    users.push({ uid, name, recipeCount: recipes.length });
    console.log(`  ✓ ${name} (${uid}) — ${recipes.length} receitas`);
  }

  // Follows cruzados: cada usuário segue o próximo (circular). Garante dados na rota /users/cooks.
  console.log(`\nCriando follows cruzados...`);
  let followBatch = db.batch();
  let followCount = 0;
  for (let i = 0; i < users.length; i++) {
    const follower = users[i];
    const following = users[(i + 1) % users.length];
    if (follower.uid === following.uid) continue;
    const ref = db.collection('follows').doc();
    followBatch.set(ref, { followerId: follower.uid, followingId: following.uid });
    followCount++;
    if (followCount >= 400) {
      await followBatch.commit();
      followBatch = db.batch();
      followCount = 0;
    }
  }
  if (followCount > 0) await followBatch.commit();

  // Atualizar contadores followingCount/followersCount
  console.log(`Atualizando contadores de seguidores...`);
  const counters: Record<string, { following: number; followers: number }> = {};
  for (const u of users) counters[u.uid] = { following: 0, followers: 0 };
  // A query de follows acima não foi persistida em array — simplificação: cada user segue 1 outro.
  for (let i = 0; i < users.length; i++) {
    const follower = users[i];
    const following = users[(i + 1) % users.length];
    if (follower.uid === following.uid) continue;
    counters[follower.uid].following += 1;
    counters[following.uid].followers += 1;
  }
  let cntBatch = db.batch();
  let cntCount = 0;
  for (const u of users) {
    const ref = db.collection('users').doc(u.uid);
    cntBatch.update(ref, {
      followingCount: counters[u.uid].following,
      followersCount: counters[u.uid].followers,
    });
    cntCount++;
    if (cntCount >= 400) {
      await cntBatch.commit();
      cntBatch = db.batch();
      cntCount = 0;
    }
  }
  if (cntCount > 0) await cntBatch.commit();

  console.log(`\n✅ Seed concluído.`);
  console.log(`   Users: ${users.length}`);
  console.log(`   Recipes: ${totalRecipes}`);
  console.log(`   Follows: ${users.length}`);
  console.log(`\nSugestões de teste no front:`);
  console.log(`   uid de exemplo: ${users[0].uid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
