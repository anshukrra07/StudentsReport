function stripTrailingSlash(value = '') {
  return String(value).replace(/\/+$/, '');
}

function isLocalhostUrl(value = '') {
  return /:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
}

export function resolveApiBase() {
  const envValue = stripTrailingSlash(process.env.REACT_APP_API_URL || '');
  const isProd = process.env.NODE_ENV === 'production';

  if (envValue && !(isProd && isLocalhostUrl(envValue))) {
    return envValue;
  }

  if (typeof window !== 'undefined') {
    if (isProd) {
      return `${window.location.origin}/api`;
    }
    return `${window.location.protocol}//${window.location.hostname}:5001/api`;
  }

  return envValue || '/api';
}

export const API_BASE = resolveApiBase();
