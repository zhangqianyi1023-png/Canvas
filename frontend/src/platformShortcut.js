export function getShortcutModifierLabel(navigatorLike = {}) {
  const platform = navigatorLike?.userAgentData?.platform
    || navigatorLike?.platform
    || '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}
