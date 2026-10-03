import assert from 'node:assert/strict';
import test from 'node:test';
import { attachPlaybackLifecycle } from '../src/lib/playback-lifecycle.ts';

test('Home pauses audio and returns to the same video only if it was playing; duplicate events do not resume twice', () => {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const page = new EventTarget();
  let pauses = 0, plays = 0;
  const video = { paused: false, ended: false, pause() { pauses++; this.paused = true; }, play() { plays++; this.paused = false; return Promise.resolve(); } };
  const detach = attachPlaybackLifecycle(video, doc, page);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); page.dispatchEvent(new Event('pagehide'));
  assert.equal(pauses, 1); assert.equal(plays, 0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); page.dispatchEvent(new Event('pageshow'));
  assert.equal(plays, 1);
  video.paused = true;
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(plays, 1);
  detach();
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pauses, 2);
});

test('an ended video is never restarted after standby', () => {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const page = new EventTarget();
  let plays = 0;
  const detach = attachPlaybackLifecycle({ paused: true, ended: true, pause() {}, play() { plays++; return Promise.resolve(); } }, doc, page);
  page.dispatchEvent(new Event('pagehide')); page.dispatchEvent(new Event('pageshow'));
  assert.equal(plays, 0); detach();
});
