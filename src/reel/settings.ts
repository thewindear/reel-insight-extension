/** 抽屉语言与自动采集范围。 */
export type Settings = {
  language: 'zh' | 'en';
  autoFeed: boolean;
  autoProfileData: boolean;
  autoProfile: boolean;
  profileDataMode: 'new-tab' | 'current-tab';
  profileMode: 'new-tab' | 'current-tab';
  profilePages: number;
};

export const defaultSettings: Settings = { language: 'zh', autoFeed: true, autoProfileData: true, autoProfile: false, profileDataMode: 'new-tab', profileMode: 'new-tab', profilePages: 1 };

/** 从本地存储读取有限的配置值，忽略无效字段。 */
export function settingsFrom(value: unknown): Settings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    language: raw.language === 'en' ? 'en' : 'zh',
    autoFeed: typeof raw.autoFeed === 'boolean' ? raw.autoFeed : defaultSettings.autoFeed,
    autoProfileData: typeof raw.autoProfileData === 'boolean' ? raw.autoProfileData : defaultSettings.autoProfileData,
    autoProfile: typeof raw.autoProfile === 'boolean' ? raw.autoProfile : defaultSettings.autoProfile,
    profileDataMode: raw.profileDataMode === 'new-tab' || raw.profileDataMode === 'current-tab' ? raw.profileDataMode :
      raw.profileMode === 'current-tab' ? 'current-tab' : 'new-tab',
    profileMode: raw.profileMode === 'current-tab' ? 'current-tab' : 'new-tab',
    profilePages: Number.isSafeInteger(raw.profilePages) && (raw.profilePages as number) >= 1 && (raw.profilePages as number) <= 100 ? raw.profilePages as number : 1,
  };
}
