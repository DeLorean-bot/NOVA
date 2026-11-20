function resolveLanguage(preference, preferredLanguages) {
  if (preference === 'ru' || preference === 'en') return preference;
  for (const locale of preferredLanguages) {
    const language = locale.split('-')[0].toLowerCase();
    if (language === 'ru' || language === 'en') return language;
  }
  return 'en';
}

module.exports = { resolveLanguage };
