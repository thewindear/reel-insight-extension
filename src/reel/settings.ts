/** 抽屉语言与自动采集范围。 */
export type Settings = {
  language: 'zh' | 'en';
  autoFeed: boolean;
  autoFeedPlays: boolean;
  autoFeedProfiles: boolean;
  autoBrowseFeed: boolean;
  feedDelay: number;
  feedDelayUnit: 'ms' | 's' | 'min';
  autoProfileData: boolean;
  autoProfile: boolean;
  profileDataMode: 'new-tab' | 'current-tab';
  profileMode: 'new-tab' | 'current-tab';
  profilePages: number;
  profileDelay: number;
  profileDelayUnit: 'ms' | 's' | 'min';
};

/** 按浏览器首选语言选择默认界面语言，所有中文变体用中文，其余用英文。 */
export function browserLanguage(locale = globalThis.navigator?.language ?? 'en'): Settings['language'] {
  return /^zh(?:[-_]|$)/i.test(locale) ? 'zh' : 'en';
}

export const defaultSettings: Settings = { language: browserLanguage(), autoFeed: true, autoFeedPlays: true, autoFeedProfiles: true, autoBrowseFeed: false, feedDelay: 1000, feedDelayUnit: 'ms', autoProfileData: true, autoProfile: false, profileDataMode: 'new-tab', profileMode: 'new-tab', profilePages: 1, profileDelay: 1000, profileDelayUnit: 'ms' };

/** 从本地存储读取有限的配置值，忽略无效字段。 */
export function settingsFrom(value: unknown): Settings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const profileDelayUnit = raw.profileDelayUnit === 's' || raw.profileDelayUnit === 'min' ? raw.profileDelayUnit : 'ms';
  const multiplier = profileDelayUnit === 'min' ? 60000 : profileDelayUnit === 's' ? 1000 : 1;
  const feedDelayUnit = raw.feedDelayUnit === 's' || raw.feedDelayUnit === 'min' ? raw.feedDelayUnit : 'ms';
  const feedMultiplier = feedDelayUnit === 'min' ? 60000 : feedDelayUnit === 's' ? 1000 : 1;
  return {
    autoFeedPlays: typeof raw.autoFeedPlays === 'boolean' ? raw.autoFeedPlays : true,
    autoFeedProfiles: typeof raw.autoFeedProfiles === 'boolean' ? raw.autoFeedProfiles : true,
    autoBrowseFeed: typeof raw.autoBrowseFeed === 'boolean' ? raw.autoBrowseFeed : false,
    feedDelayUnit,
    feedDelay: typeof raw.feedDelay === 'number' && Number.isFinite(raw.feedDelay) &&
      raw.feedDelay * feedMultiplier >= 1 && raw.feedDelay * feedMultiplier <= 2147483647 ? raw.feedDelay : 1000 / feedMultiplier,
    profileDelayUnit,
    profileDelay: typeof raw.profileDelay === 'number' && Number.isFinite(raw.profileDelay) &&
      raw.profileDelay * multiplier >= 1 && raw.profileDelay * multiplier <= 2147483647 ? raw.profileDelay : 1000 / multiplier,
    language: raw.language === 'zh' || raw.language === 'en' ? raw.language : defaultSettings.language,
    autoFeed: typeof raw.autoFeed === 'boolean' ? raw.autoFeed : defaultSettings.autoFeed,
    autoProfileData: raw.autoFeedProfiles === true || (typeof raw.autoProfileData === 'boolean' ? raw.autoProfileData : defaultSettings.autoProfileData),
    autoProfile: typeof raw.autoProfile === 'boolean' ? raw.autoProfile : defaultSettings.autoProfile,
    profileDataMode: raw.profileDataMode === 'new-tab' || raw.profileDataMode === 'current-tab' ? raw.profileDataMode :
      raw.profileMode === 'current-tab' ? 'current-tab' : 'new-tab',
    profileMode: raw.profileMode === 'current-tab' ? 'current-tab' : 'new-tab',
    profilePages: Number.isSafeInteger(raw.profilePages) && (raw.profilePages as number) >= 1 && (raw.profilePages as number) <= 100 ? raw.profilePages as number : 1,
  };
}
