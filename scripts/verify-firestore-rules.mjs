import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rulesPath = resolve(process.cwd(), 'firestore.rules');
const rulesText = await readFile(rulesPath, 'utf8');

const requiredSnippets = [
  'match /templates/{templateId}',
  'match /valueSets/{valueSetId}',
  'match /users/{userId}',
  'match /{document=**}',
  'allow read, write: if false',
  'request.auth.uid',
  'ownerId',
];

for (const snippet of requiredSnippets) {
  if (!rulesText.includes(snippet)) {
    throw new Error(`Missing required Firestore rules snippet: ${snippet}`);
  }
}

console.log('firestore.rules contains the owner-based MVP baseline.');
