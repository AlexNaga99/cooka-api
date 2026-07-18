// k6 load test para rotas públicas do Cooka API.
//
// Cenário: simular 100 usuários ativos fazendo navegação típica (busca,
// cozinheiros recomendados, receitas por ID, perfil).
//
// Uso:
//   k6 run bench/k6-recipes.js
//   BASE_URL=http://localhost:3000 k6 run bench/k6-recipes.js
//   BASE_URL=https://api.cooka.app k6 run bench/k6-recipes.js
//
// Thresholds: o teste FALHA se p95 > 800ms em qualquer rota ou erro > 1%.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api`;

const listLatency = new Trend('list_latency', true);
const searchLatency = new Trend('search_latency', true);
const byIdsLatency = new Trend('by_ids_latency', true);
const cooksLatency = new Trend('cooks_latency', true);
const profileLatency = new Trend('profile_latency', true);
const errors = new Counter('http_errors');

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '40s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'list_latency': ['p(95)<800'],
    'search_latency': ['p(95)<800'],
    'by_ids_latency': ['p(95)<800'],
    'cooks_latency': ['p(95)<1500'],
    'profile_latency': ['p(95)<500'],
    'http_errors': ['count<100'],
    http_req_failed: ['rate<0.01'],
  },
};

const SEED_PREFIX = __ENV.SEED_PREFIX || 'seedload';
const SAMPLE_USER_ID = `${SEED_PREFIX}_ana_silva`;
const SAMPLE_RECIPE_IDS = [
  `${SEED_PREFIX}_ana_silva_0_0`,
  `${SEED_PREFIX}_bruno_santos_1_0`,
  `${SEED_PREFIX}_camila_oliveira_2_0`,
  `${SEED_PREFIX}_diego_souza_3_0`,
];

function timedGet(path, trend) {
  const res = http.get(`${API}${path}`);
  trend.add(res.timings.duration);
  if (res.status >= 400) errors.add(1);
  return res;
}

export default function () {
  const list = timedGet('/recipes?query=bolo&limit=20', listLatency);
  check(list, {
    'list 200': (r) => r.status === 200,
    'list has items': (r) => {
      try {
        const j = r.json();
        return Array.isArray(j.items);
      } catch (e) { return false; }
    },
  });
  sleep(0.5);

  const search = timedGet('/search?query=bolo&limit=20', searchLatency);
  check(search, { 'search 200': (r) => r.status === 200 });
  sleep(0.3);

  const cooks = timedGet('/users/cooks?limit=20', cooksLatency);
  check(cooks, { 'cooks 200': (r) => r.status === 200 });
  sleep(0.5);

  const idsParam = SAMPLE_RECIPE_IDS.join(',');
  const byIds = timedGet(`/recipes/by-ids?ids=${idsParam}&limit=20`, byIdsLatency);
  check(byIds, { 'by-ids 200': (r) => r.status === 200 });
  sleep(0.3);

  const profile = timedGet(`/users/${SAMPLE_USER_ID}/profile`, profileLatency);
  check(profile, { 'profile 200': (r) => r.status === 200 });
  sleep(0.4);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'bench/summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics || {};
  function val(metric, key) {
    try { return metric.values[key]; } catch (e) { return null; }
  }
  function fmt(v) { return v == null ? 'n/a' : v.toFixed(1) + 'ms'; }
  function count() { try { return m.http_reqs.values.count; } catch (e) { return 'n/a'; } }
  function failRate() {
    try {
      return (m.http_req_failed.values.rate * 100).toFixed(2) + '%';
    } catch (e) { return 'n/a'; }
  }
  return '\n'
    + '====== Cooka API Load Test ======\n'
    + 'Base URL: ' + BASE_URL + '\n'
    + 'Total requests: ' + count() + '\n'
    + 'Failed requests: ' + failRate() + '\n'
    + '\nLatências (p50 / p95 / p99):\n'
    + '  list    ' + fmt(val(m.list_latency, 'p(50)')) + ' / ' + fmt(val(m.list_latency, 'p(95)')) + ' / ' + fmt(val(m.list_latency, 'p(99)')) + '\n'
    + '  search  ' + fmt(val(m.search_latency, 'p(50)')) + ' / ' + fmt(val(m.search_latency, 'p(95)')) + ' / ' + fmt(val(m.search_latency, 'p(99)')) + '\n'
    + '  by-ids  ' + fmt(val(m.by_ids_latency, 'p(50)')) + ' / ' + fmt(val(m.by_ids_latency, 'p(95)')) + ' / ' + fmt(val(m.by_ids_latency, 'p(99)')) + '\n'
    + '  cooks   ' + fmt(val(m.cooks_latency, 'p(50)')) + ' / ' + fmt(val(m.cooks_latency, 'p(95)')) + ' / ' + fmt(val(m.cooks_latency, 'p(99)')) + '\n'
    + '  profile ' + fmt(val(m.profile_latency, 'p(50)')) + ' / ' + fmt(val(m.profile_latency, 'p(95)')) + ' / ' + fmt(val(m.profile_latency, 'p(99)')) + '\n'
    + '=================================\n';
}
