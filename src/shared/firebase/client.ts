import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseClientReadiness } from './clientConfig';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseFirestore: Firestore | null = null;

export function getFirebaseApp() {
  if (firebaseClientReadiness.status !== 'ready') {
    return null;
  }

  const appConfig = firebaseClientReadiness.config;

  if (!appConfig) {
    return null;
  }

  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(appConfig);

  return firebaseApp;
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();

  if (!app) {
    return null;
  }

  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
  }

  return firebaseAuth;
}

export function getFirebaseFirestore() {
  const app = getFirebaseApp();

  if (!app) {
    return null;
  }

  if (!firebaseFirestore) {
    firebaseFirestore = getFirestore(app);
  }

  return firebaseFirestore;
}
