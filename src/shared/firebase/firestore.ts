import { doc, setDoc } from 'firebase/firestore';
import type { BoardTemplate, ValueSet } from '../schema';
import { getFirebaseFirestore } from './client';
import type { FirebaseSessionState } from './auth';

export const templatesCollectionName = 'templates';
export const valueSetsCollectionName = 'valueSets';

export type BoardTemplateWriteInput = Omit<BoardTemplate, 'ownerId'>;
export type ValueSetWriteInput = Omit<ValueSet, 'ownerId'>;

export async function saveBoardTemplateForCurrentUser(
  owner: FirebaseSessionState,
  template: BoardTemplateWriteInput,
) {
  const firestore = getFirebaseFirestore();

  if (!firestore) {
    throw new Error('Firebase Firestore is not ready.');
  }

  const payload: BoardTemplate = {
    ...template,
    ownerId: owner.uid,
  };

  await setDoc(doc(firestore, templatesCollectionName, template.id), payload);

  return payload;
}

export async function saveValueSetForCurrentUser(
  owner: FirebaseSessionState,
  valueSet: ValueSetWriteInput,
) {
  const firestore = getFirebaseFirestore();

  if (!firestore) {
    throw new Error('Firebase Firestore is not ready.');
  }

  const payload: ValueSet = {
    ...valueSet,
    ownerId: owner.uid,
  };

  await setDoc(doc(firestore, valueSetsCollectionName, valueSet.id), payload);

  return payload;
}
