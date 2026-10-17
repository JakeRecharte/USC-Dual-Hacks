// A map that can't get WebGL2 shows a readable reason instead of crashing the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeMapError } from '../src/lib/webgl.ts';

test("MapLibre's WebGL JSON becomes a readable sentence with its status message", () => {
  const e = new Error(JSON.stringify({ requestedAttributes: { antialias: false, preserveDrawingBuffer: false }, statusMessage: 'Web page caused context loss and was blocked', type: 'webglcontextcreationerror' }));
  const m = describeMapError(e);
  assert.match(m, /needs WebGL2/);
  assert.match(m, /Web page caused context loss and was blocked/);
  assert.match(m, /Everything else on this page still works/);
  assert.doesNotMatch(m, /requestedAttributes/);
});

test('other errors keep their message', () => {
  assert.match(describeMapError(new Error('style failed to load')), /style failed to load/);
  assert.match(describeMapError(undefined), /unknown error/);
});
