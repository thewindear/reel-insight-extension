import assert from 'node:assert/strict';
import { defaultSettings, settingsFrom } from '../src/reel/settings.ts';
import { translate } from '../src/reel/i18n.ts';

assert.deepEqual(settingsFrom(null), defaultSettings);
assert.deepEqual(settingsFrom({ language: 'en', autoFeed: false, autoProfile: true }),
  { ...defaultSettings, language: 'en', autoFeed: false, autoProfile: true });
assert.deepEqual(settingsFrom({ autoProfileData: false }), { ...defaultSettings, autoProfileData: false });
assert.deepEqual(settingsFrom({ language: 'de', autoFeed: 'false', autoProfileData: 'false', autoProfile: 1 }), defaultSettings);
assert.deepEqual(settingsFrom({ profileMode: 'current-tab', profilePages: 3 }),
  { ...defaultSettings, profileDataMode: 'current-tab', profileMode: 'current-tab', profilePages: 3 });
assert.deepEqual(settingsFrom({ profileDataMode: 'current-tab', profileMode: 'new-tab' }),
  { ...defaultSettings, profileDataMode: 'current-tab' });
assert.deepEqual(settingsFrom({ profileDataMode: 'new-tab', profileMode: 'current-tab' }),
  { ...defaultSettings, profileMode: 'current-tab' });
assert.deepEqual(settingsFrom({ profileMode: 'other', profilePages: 0 }), defaultSettings);
assert.deepEqual(settingsFrom({ profilePages: 101 }), defaultSettings);
assert.equal(translate('en', '采集记录'), 'Saved records');
assert.equal(translate('zh', '采集记录'), '采集记录');
console.log('Settings and language checks passed');
