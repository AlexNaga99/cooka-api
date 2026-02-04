export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    apiKey: process.env.FIREBASE_API_KEY,
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
  },
  refreshToken: {
    expiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30', 10),
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 50,
  },
});
