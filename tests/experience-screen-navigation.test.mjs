import assert from 'node:assert/strict';
import test from 'node:test';
import { createExperienceScreenNavigation } from '../dist/index.js';

test('restores the screen in the URL, and falls back without changing history', () => {
  let href = 'https://workbench.example/?experience=experience.demo&screen=compare';
  const attempts = [];
  const navigation = createExperienceScreenNavigation('experience.demo', 'main', {
    readHref: () => href,
    pushHref: () => assert.fail('restoration must not push history'),
    activate: id => {
      attempts.push(id);
      return id === 'main' || id === 'compare';
    }
  });

  assert.equal(navigation.restore(), true);
  href = href.replace('compare', 'missing');
  assert.equal(navigation.restore(), true);
  assert.deepEqual(attempts, ['compare', 'missing', 'main']);
});

test('pushes history only for a successfully activated new screen', () => {
  let href = 'https://workbench.example/?experience=experience.demo&lang=fr';
  const history = [];
  const navigation = createExperienceScreenNavigation('experience.demo', 'main', {
    readHref: () => href,
    pushHref: value => {
      href = value;
      history.push(value);
    },
    activate: id => id === 'compare'
  });

  assert.equal(navigation.select('missing'), false);
  assert.equal(navigation.select('compare'), true);
  assert.equal(navigation.select('compare'), true);
  assert.deepEqual(history, ['https://workbench.example/?experience=experience.demo&lang=fr&screen=compare']);
});
