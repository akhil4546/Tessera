import { getRequestConfig } from 'next-intl/server';
import { en } from '@tessera/i18n';

export default getRequestConfig(async () => ({
  locale: 'en',
  messages: en,
}));
