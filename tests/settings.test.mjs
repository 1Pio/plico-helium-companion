import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizeSettings, migrateSettings } from '../extension/settings.mjs';
test('settings validate delay bounds and reserve ordinary editing', () => {
  assert.deepEqual(normalizeSettings(defaults), defaults);
  for (const delay of [-1, 2001, NaN, 1.2])
    assert.throws(() => normalizeSettings({ ...defaults, revealDelayMs: delay }));
  assert.throws(() => normalizeSettings({ ...defaults, keys: { ...defaults.keys, toggle: 'c' } }));
});
test('shortcut conflicts reject the entire update', () => {
  assert.throws(() => normalizeSettings({ ...defaults, keys: { ...defaults.keys, edit: 'h' } }));
  assert.throws(() =>
    normalizeSettings({ ...defaults, keys: { ...defaults.keys, left: 'Backspace' } }),
  );
  const value = normalizeSettings({
    ...defaults,
    revealDelayMs: 300,
    keys: { ...defaults.keys, toggle: 'o' },
  });
  assert.equal(value.keys.toggle, 'o');
  assert.equal(value.revealDelayMs, 300);
});

test('shift-sensitive punctuation is not offered for movement or copy', () => {
  for (const action of ['left', 'copy', 'toggle', 'back'])
    assert.throws(() =>
      normalizeSettings({ ...defaults, keys: { ...defaults.keys, edit: 'e', [action]: ';' } }),
    );
  assert.deepEqual(normalizeSettings(defaults), defaults);
});

test('theme defaults migrate older settings and reject invalid values', () => {
  const { theme, ...old } = defaults;
  assert.equal(normalizeSettings(old).theme, 'system');
  for (const theme of ['light', 'dark', 'system'])
    assert.equal(normalizeSettings({ ...defaults, theme }).theme, theme);
  assert.throws(() => normalizeSettings({ ...defaults, theme: 'purple' }));
  for (const toggle of ['w', 'm'])
    assert.throws(() => normalizeSettings({ ...defaults, keys: { ...defaults.keys, toggle } }));
});

test('old reserved shortcuts migrate without losing delay or unrelated keys', () => {
  const result = migrateSettings({
    ...defaults,
    revealDelayMs: 1000,
    keys: { ...defaults.keys, toggle: 'm', edit: 'b', back: 'w' },
  });
  assert.equal(result.revealDelayMs, 1000);
  assert.equal(result.keys.edit, 'b');
  assert.equal(result.keys.left, 'h');
  assert(!['w', 'm'].includes(result.keys.toggle));
  assert.equal(new Set(Object.values(result.keys)).size, 9);
});

test('old settings and fresh defaults free Command+0 while retaining ten slots', () => {
  const { slots, ...old } = defaults;
  for (const value of [defaults, migrateSettings(old)]) {
    assert.equal(value.slots.length, 10);
    assert.equal(value.slots[9], null);
    assert.deepEqual(value.slots[0], { key: '1', modifiers: 1 });
  }
});
test('slot chords validate duplicates, modifiers, unbinding and zoom reservation', () => {
  const slots = structuredClone(defaults.slots);
  slots[9] = { key: '0', modifiers: 2 };
  assert.deepEqual(normalizeSettings({ ...defaults, slots }).slots[9], slots[9]);
  for (const invalid of [
    { key: 0, modifiers: 1 },
    { key: '0', modifiers: 4294967297 },
    { key: '0', modifiers: 1 },
    { key: 'a', modifiers: 1 },
    { key: '0', modifiers: 0 },
    { key: '0', modifiers: 4 },
    { key: '0', modifiers: 16 },
    { key: '1', modifiers: 1 },
  ]) {
    slots[9] = invalid;
    assert.throws(() => normalizeSettings({ ...defaults, slots }));
  }
  slots[9] = null;
  slots[0] = { key: '1', modifiers: 10 };
  assert.equal(normalizeSettings({ ...defaults, slots }).slots[0].modifiers, 10);
});
