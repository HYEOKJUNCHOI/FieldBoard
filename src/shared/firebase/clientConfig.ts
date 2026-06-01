import type { FirebaseOptions } from 'firebase/app';

export const requiredFirebaseEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export type FirebaseEnvKey = (typeof requiredFirebaseEnvKeys)[number];

export type FirebaseEnvSource = Readonly<Partial<Record<FirebaseEnvKey, string>>> & {
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
};

export type FirebaseClientReadiness =
  | {
      readonly status: 'ready';
      readonly config: FirebaseOptions;
      readonly missingKeys: [];
    }
  | {
      readonly status: 'missing';
      readonly config: null;
      readonly missingKeys: FirebaseEnvKey[];
    };

const viteFirebaseEnv: FirebaseEnvSource = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasEnvValue = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function readFirebaseClientConfig(
  env: FirebaseEnvSource = viteFirebaseEnv,
): FirebaseClientReadiness {
  const completeEnv = {
    VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY ?? '',
    VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID ?? '',
    VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID ?? '',
    VITE_FIREBASE_MEASUREMENT_ID: env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const missingKeys = requiredFirebaseEnvKeys.filter(
    (key) => !hasEnvValue(completeEnv[key]),
  );

  if (missingKeys.length > 0) {
    return {
      status: 'missing',
      config: null,
      missingKeys,
    };
  }

  return {
    status: 'ready',
    config: {
      apiKey: completeEnv.VITE_FIREBASE_API_KEY,
      authDomain: completeEnv.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: completeEnv.VITE_FIREBASE_PROJECT_ID,
      storageBucket: completeEnv.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: completeEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: completeEnv.VITE_FIREBASE_APP_ID,
      measurementId: completeEnv.VITE_FIREBASE_MEASUREMENT_ID,
    },
    missingKeys: [],
  };
}

export const firebaseClientReadiness = readFirebaseClientConfig();
export const firebaseClientConfig = firebaseClientReadiness.config;
