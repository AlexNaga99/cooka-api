# Índices do Firestore

O Firestore exige índices compostos para queries com `where` + `orderBy` em campos diferentes.

## Índices criados manualmente

Já criei os 3 índices abaixo. **Você precisa clicar nos links e esperar ~1-5 min para ficarem prontos** antes de rodar o k6 novamente:

### 1. `recipes` — prefix-match no título
- `status` ASCENDING
- `titleLower` ASCENDING

🔗 https://console.firebase.google.com/v1/r/project/cooka-28201/firestore/indexes?create_composite=Cktwcm9qZWN0cy9jb29rYS0yODIwMS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvcmVjaXBlcy9pbmRleGVzL18QARoKCgZzdGF0dXMQARoOCgp0aXRsZUxvd2VyEAEaDAoIX19uYW1lX18QAg

### 2. `users` — top cozinhas
- `deletedAt` ASCENDING
- `recipesCount` DESCENDING

### 3. `users` — busca por nome
- `deletedAt` ASCENDING
- `nameLower` ASCENDING

## Como criar via CLI (recomendado para produção)

```bash
npm install -g firebase-tools
firebase login
firebase use cooka-28201
firebase deploy --only firestore:indexes
```

O arquivo `firestore.indexes.json` já contém as definições.

## Verificar status

https://console.firebase.google.com/project/cooka-28201/firestore/indexes

Status **READY** = pode rodar o benchmark.
