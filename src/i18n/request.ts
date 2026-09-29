import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('jobabdesk_locale')?.value ||
    process.env.NEXT_PUBLIC_APP_LOCALE || 'en';

  const enMessages = (await import('../../messages/en.json')).default;

  let messages: Record<string, any> = enMessages;
  if (locale !== 'en') {
    try {
      const localeMessages = (await import(`../../messages/${locale}.json`)).default;
      messages = deepMerge(enMessages, localeMessages);
    } catch {
      // locale file missing — fall back to English silently
    }
  }

  return { locale, messages };
});
