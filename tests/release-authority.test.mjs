import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertPublishingTools, assertReleaseInputs } from '../scripts/check-release.mjs';

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('release identity names the independent repository', () => {
  const manifest = json('package.json');
  assert.equal(manifest.repository.url, 'git+https://github.com/LeMouf/konitif-workbench-runtime.git');
  assert.equal(manifest.version, '0.284.2');
  assert.equal(manifest.license, 'PolyForm-Noncommercial-1.0.0');
});

test('release inputs bind the exact package version to its repository and tag ref', () => {
  const policy = json('release-policy.json');
  const manifest = json('package.json');
  const lock = json('package-lock.json');
  const base = {
    GITHUB_REPOSITORY: 'LeMouf/konitif-workbench-runtime',
    GITHUB_REF: 'refs/tags/v0.284.2',
  };
  assert.doesNotThrow(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'push',
  }));
  assert.doesNotThrow(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    WORKBENCH_RUNTIME_RELEASE_TAG: 'v0.284.2',
  }));
  assert.throws(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    WORKBENCH_RUNTIME_RELEASE_TAG: 'v0.284.3',
  }));
  assert.throws(() => assertReleaseInputs(policy, manifest, lock, {
    ...base,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    WORKBENCH_RUNTIME_RELEASE_TAG: 'v0.284.2',
  }));
});

test('publication requires an OIDC-capable preinstalled npm without upgrading it', () => {
  assert.doesNotThrow(() => assertPublishingTools('24.20.0', '11.6.0'));
  assert.throws(() => assertPublishingTools('22.13.0', '11.6.0'));
  assert.throws(() => assertPublishingTools('24.20.0', '11.4.9'));
});

test('the publish workflow is the only constrained publication authority', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /vars\.WORKBENCH_RUNTIME_NPM_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /github\.repository == 'LeMouf\/konitif-workbench-runtime'/);
  assert.match(workflow, /environment: npm-release/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/tags\/\$\{expected\}"/);
  assert.match(workflow, /npm publish \.release\/package\.tgz --access public --provenance --ignore-scripts/);
  assert.doesNotMatch(workflow, /npm install -g|npm update/);
});

test('the release preparation retains only the archive emitted by the verifier', () => {
  const script = readFileSync(new URL('../scripts/prepare-release-archive.mjs', import.meta.url), 'utf8');
  assert.match(script, /realpathSync\(evidence\.archive\)/);
  assert.match(script, /COPYFILE_EXCL/);
  assert.doesNotMatch(script, /npm pack|readdirSync/);
});

test('the release guide confines the initial local bootstrap to version 0.284.1', () => {
  const guide = readFileSync(new URL('../RELEASE.md', import.meta.url), 'utf8');
  assert.match(guide, /explicit bootstrap exception/);
  assert.match(guide, /leave the activation variable absent\nwhile pushing `v0\.284\.1`/i);
  assert.match(guide, /bootstrap has no CI provenance and must not\s+be repeated/i);
});
