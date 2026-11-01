/**
 * custom_taxonomy discoveries are per gardener and may include a camera photo.
 * Another signed-in user must not be able to read or list them.
 *
 * Requires the Firestore emulator (rules from ../../firestore.rules):
 *   firebase emulators:exec --only firestore --project demo-taxonomy-access \
 *     "npx tsx src/lib/taxonomyAccess.test.ts"
 */
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-taxonomy-access';
const HOST = process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1';
const PORT = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080);

function client(name: string, token: string | { sub: string; user_id: string }): { app: FirebaseApp; db: Firestore } {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo' }, name);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, PORT, { mockUserToken: token });
  return { app, db };
}

async function expectDenied(label: string, op: Promise<unknown>) {
  try {
    await op;
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    if (code === 'permission-denied' || String(error).includes('permission')) {
      console.log(`denied as expected: ${label}`);
      return;
    }
    throw error;
  }
  throw new Error(`expected permission-denied for ${label}`);
}

async function main() {
  const apps: FirebaseApp[] = [];
  const owner = client('owner', 'owner');
  const alice = client('alice', { sub: 'alice', user_id: 'alice' });
  const bob = client('bob', { sub: 'bob', user_id: 'bob' });
  apps.push(owner.app, alice.app, bob.app);

  await setDoc(doc(owner.db, 'custom_taxonomy', 'alices-weed'), {
    name: 'Bindweed',
    type: 'weed',
    discoveredBy: 'alice',
    imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
    isCustom: true,
  });

  const snap = await getDoc(doc(alice.db, 'custom_taxonomy', 'alices-weed'));
  if (!snap.exists() || snap.data().imageUrl !== 'data:image/png;base64,iVBORw0KGgo=') {
    throw new Error('owner could not read their discovery photo');
  }
  console.log('owner read: ok');

  const ownList = await getDocs(
    query(collection(alice.db, 'custom_taxonomy'), where('discoveredBy', '==', 'alice'))
  );
  if (ownList.size !== 1) throw new Error(`owner list returned ${ownList.size}, expected 1`);
  console.log('owner list by discoveredBy: ok');

  await expectDenied('stranger get', getDoc(doc(bob.db, 'custom_taxonomy', 'alices-weed')));
  await expectDenied('stranger list', getDocs(collection(bob.db, 'custom_taxonomy')));
  await expectDenied('unfiltered owner list', getDocs(collection(alice.db, 'custom_taxonomy')));
  await expectDenied(
    'legacy ownerUid list',
    getDocs(query(collection(alice.db, 'custom_taxonomy'), where('ownerUid', '==', 'alice')))
  );

  await Promise.all(apps.map((app) => deleteApp(app)));
  console.log('taxonomy access rules: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
