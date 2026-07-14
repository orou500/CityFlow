import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import he from './he.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: localStorage.getItem('i18n_language') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18n_language', lng);
  document.body.dir = lng === 'he' ? 'rtl' : 'ltr';
});
document.body.dir = i18n.language === 'he' ? 'rtl' : 'ltr';

export default i18n;
