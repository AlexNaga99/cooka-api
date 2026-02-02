export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    apiKey: process.env.FIREBASE_API_KEY,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 50,
  },
});
