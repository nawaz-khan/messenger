// Focused security regression test for the Google OAuth bootstrap routes.
//
// The project has no third-party test framework installed, so this uses Node's
// built-in test runner (`node --test`) and only the standard library.
//
// It guards against the original vulnerability class: rendering/serializing a
// Google OAuth refresh or access token into a browser-visible response.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES = [
  'src/app/api/media/google/callback/route.ts',
  'src/app/api/media/google/authorize/route.ts',
  'src/app/api/media/google/status/route.ts',
];

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

test('OAuth routes never interpolate token values into a response', () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    // No template interpolation of a token value, e.g. `${tokens.refresh_token}`.
    assert.ok(
      !/\$\{\s*tokens\.(refresh_token|access_token)/.test(src),
      `${rel} interpolates a token value into a string`
    );
    // No string concatenation of a token value.
    assert.ok(
      !/\+\s*tokens\.(refresh_token|access_token)/.test(src),
      `${rel} concatenates a token value into a string`
    );
  }
});

test('OAuth routes never touch the access token', () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.ok(
      !/\btokens\.access_token\b/.test(src),
      `${rel} references tokens.access_token`
    );
  }
});

test('OAuth bootstrap routes are disabled outside development', () => {
  for (const rel of ROUTES) {
    const src = read(rel);
    assert.ok(
      /NODE_ENV\s*!==\s*'production'/.test(src),
      `${rel} does not gate itself to non-production`
    );
    assert.ok(
      /if\s*\(\s*!IS_DEVELOPMENT\s*\)/.test(src),
      `${rel} does not return early outside development`
    );
  }
});
