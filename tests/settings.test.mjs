import assert from 'node:assert/strict';
import { browserLanguage, defaultSettings, settingsFrom } from '../src/reel/settings.ts';
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

assert.equal(defaultSettings.profileDelay, 1000);
assert.equal(defaultSettings.profileDelayUnit, 'ms');
for (const [unit, multiplier] of [['ms', 1], ['s', 1000], ['min', 60000]]) {
  const valid = settingsFrom({ profileDelay: 2.5, profileDelayUnit: unit });
  assert.equal(valid.profileDelay * multiplier, 2.5 * multiplier);
  for (const invalid of [0, -1, Infinity, NaN, '1000', 2147483648]) {
    assert.equal(settingsFrom({ profileDelay: invalid, profileDelayUnit: unit }).profileDelay * multiplier, 1000);
  }
}
assert.equal(settingsFrom({ profileDelayUnit: 'invalid' }).profileDelayUnit, 'ms');

assert.equal(defaultSettings.autoBrowseFeed, false);
assert.equal(defaultSettings.feedDelay, 1000);
assert.equal(defaultSettings.feedDelayUnit, 'ms');
assert.equal(settingsFrom({ autoBrowseFeed: true }).autoBrowseFeed, true);
assert.equal(settingsFrom({ autoBrowseFeed: 'true' }).autoBrowseFeed, false);
for (const [unit, multiplier] of [['ms', 1], ['s', 1000], ['min', 60000]]) {
  assert.equal(settingsFrom({ feedDelay: 2.5, feedDelayUnit: unit }).feedDelay * multiplier, 2.5 * multiplier);
  for (const invalid of [0, -1, Infinity, NaN, '1000', 2147483648]) {
    assert.equal(settingsFrom({ feedDelay: invalid, feedDelayUnit: unit }).feedDelay * multiplier, 1000);
  }
}
assert.equal(settingsFrom({ feedDelayUnit: 'invalid' }).feedDelayUnit, 'ms');

for (const key of ['autoFeedPlays', 'autoFeedProfiles']) {
  assert.equal(defaultSettings[key], true);
  assert.equal(settingsFrom({ [key]: false })[key], false);
  assert.equal(settingsFrom({ [key]: 'false' })[key], true);
}
assert.equal(settingsFrom({ autoProfileData: false, autoFeedProfiles: true }).autoFeedProfiles, true);

assert.equal(settingsFrom({ autoFeedProfiles: true, autoProfileData: false }).autoProfileData, true);

for (const locale of ['zh', 'zh-CN', 'zh-TW', 'zh-HK', 'zh-Hans', 'zh-Hant', 'ZH-cn']) {
  assert.equal(browserLanguage(locale), 'zh');
}
for (const locale of ['en', 'en-US', 'ja-JP', 'fr-FR', 'de-DE', 'ko-KR', '']) {
  assert.equal(browserLanguage(locale), 'en');
}
assert.equal(defaultSettings.language, browserLanguage());
assert.equal(settingsFrom({}).language, browserLanguage());
assert.equal(settingsFrom({ language: 'invalid' }).language, browserLanguage());
assert.equal(settingsFrom({ language: 'zh' }).language, 'zh', '手动中文设置优先于浏览器语言');
assert.equal(settingsFrom({ language: 'en' }).language, 'en', '手动英文设置优先于浏览器语言');
