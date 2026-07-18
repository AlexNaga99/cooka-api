export default () => {
  const isProd = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ?? 'change-me-in-production';

  // Fail-fast em produção com segredo padrão ou muito curto (<32 chars = ~192 bits).
  if (isProd && (!process.env.JWT_SECRET || jwtSecret === 'change-me-in-production' || jwtSecret.length < 32)) {
    throw new Error(
      'JWT_SECRET ausente ou fraco em produção. Defina JWT_SECRET com >=32 caracteres aleatórios.',
    );
  }

  // CORS: aceita lista separada por vírgula via CORS_ORIGINS.
  // - Vazio / '*' = permite qualquer origem (modo app hospedado em servidor próprio sem domínio fixo).
  // - Lista = ["https://app.example.com","https://admin.example.com"]
  const rawOrigins = process.env.CORS_ORIGINS ?? '*';
  const corsOrigins =
    rawOrigins.trim() === '*' || rawOrigins.trim() === ''
      ? true
      : rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);

  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      apiKey: process.env.FIREBASE_API_KEY,
    },
    jwt: {
      secret: jwtSecret,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
    },
    refreshToken: {
      expiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30', 10),
    },
    pagination: {
      defaultLimit: 20,
      maxLimit: 50,
    },
    cors: {
      origins: corsOrigins,
    },
  };
};
