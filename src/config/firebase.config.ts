import { readFileSync } from 'fs';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

let firebaseApp: App;

function getServiceAccountFromEnv(): object {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw || !raw.trim()) {
    throw new Error('Firebase credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS (path ou base64).');
  }
  const value = raw.trim();

  const isFilePath =
    value.endsWith('.json') ||
    value.startsWith('.') ||
    value.startsWith('/') ||
    value.includes('\\') ||
    (value.length < 200 && (value.includes('/') || value.includes('\\')));

  if (isFilePath) {
    const content = readFileSync(value, 'utf-8');
    return JSON.parse(content) as object;
  }

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8');
    return JSON.parse(decoded) as object;
  } catch {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS inválido. Use caminho para .json ou o conteúdo do Service Account em base64.',
    );
  }
}

export function getFirebaseApp(): App {
  if (!firebaseApp) {
    const apps = getApps();
    if (apps.length > 0) {
      firebaseApp = apps[0] as App;
    } else {
      const serviceAccount = getServiceAccountFromEnv();
      firebaseApp = initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }
  }
  return firebaseApp;
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}
