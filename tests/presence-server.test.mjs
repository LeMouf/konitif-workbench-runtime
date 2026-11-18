import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresenceStore } from '@konitif/workbench-runtime/presence-server';

test('presence reports attached identities from their current experience without exposing connection credentials', () => {
  const store = createPresenceStore();
  const self = store.join({ name: 'Participant', experienceId: 'sample', revision: '1' });
  const observer = store.join({ name: 'Observer', actorKind: 'assistant', experienceId: 'sample', revision: '2' });
  const elsewhere = store.join({ name: 'Elsewhere', experienceId: 'elsewhere', revision: '3' });

  assert.deepEqual(store.snapshot(self.id, self.token).identities, []);
  store.attach(self.id, self.token);
  store.attach(observer.id, observer.token);
  store.attach(elsewhere.id, elsewhere.token);

  const snapshot = store.snapshot(self.id, self.token);
  assert.deepEqual(snapshot.identities.find(identity => identity.identityId === observer.identityId), {
    identityId: observer.identityId,
    name: 'Observer',
    actorKind: 'assistant',
    self: false,
    connections: 1,
    here: 1,
    revisions: ['2']
  });
  assert.deepEqual(snapshot.identities.find(identity => identity.identityId === elsewhere.identityId)?.revisions, []);

  const serialized = JSON.stringify(snapshot);
  for (const { token, code, id } of [self, observer, elsewhere]) {
    for (const value of [token, code, id]) assert.equal(serialized.includes(value), false);
  }
  store.leave(observer.id, observer.token);
  assert.equal(store.snapshot(self.id, self.token).identities.length, 2);
});
