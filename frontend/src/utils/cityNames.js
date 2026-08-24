/**
 * City/country display-name localization.
 *
 * City and country names come from the backend (City documents) and are
 * rendered verbatim by default. These helpers overlay a translation lookup
 * (cityNames.* / countryNames.* in en.json/he.json) so Hebrew users see proper
 * Hebrew names (e.g. New York -> ניו יורק) while English users see the
 * canonical English names. Unknown names fall back to the backend value —
 * the backend remains the source of truth and no component hardcodes strings.
 */

export function nameKey(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function localizeCityName(name, t) {
  if (!name || typeof t !== 'function') return name;
  const key = `cityNames.${nameKey(name)}`;
  const translated = t(key);
  return translated && translated !== key ? translated : name;
}

export function localizeCountryName(country, t) {
  if (!country || typeof t !== 'function') return country;
  const key = `countryNames.${nameKey(country)}`;
  const translated = t(key);
  return translated && translated !== key ? translated : country;
}
