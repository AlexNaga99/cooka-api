# Bench / Load test

Script k6 que mede a latência das rotas públicas mais quentes do Cooka API
em cenário de 100 usuários ativos navegando no app.

## Pré-requisitos

1. Instalar k6: <https://k6.io/docs/getting-started/installation/>
   - Windows: `winget install k6 --source winget` ou MSI em
     <https://github.com/grafana/k6/releases>
2. API rodando localmente (`npm run start:dev`) ou apontar para Railway:
   `BASE_URL=https://cooka-api.up.railway.app k6 run bench/k6-recipes.js`
3. Banco populado com o seed: `npm run seed:load-test`

## Como rodar

```bash
npm run build
npm run seed:load-test
npm run start:dev   # em um terminal

k6 run bench/k6-recipes.js   # em outro terminal
```

## O que o teste faz

- 20s rampa para 50 VUs, 40s rampa para 100 VUs, 60s sustentado, 20s ramp-down.
- Cada VU simula um usuário: lista → busca → cozinheiros → favoritos → perfil.
- Mede latência por rota (Trend) e contagem de erros HTTP.

## Thresholds

Falha o teste se:
- `p95 > 800ms` em rotas críticas
- `p95 > 1500ms` em `/users/cooks`
- Taxa de erro HTTP ≥ 1%

Saída também salva em `bench/summary.json`.
