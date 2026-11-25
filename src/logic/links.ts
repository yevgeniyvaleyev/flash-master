/**
 * A topic's web link (opened in the phone's browser from the topic screen). Only http(s) addresses are kept; a
 * bare address like «coursera.org/learn/x» gets https://. Regex-based: React Native's URL polyfill lacks most getters.
 */

const WEB = /^(https?):\/\/([^/?#\s:@]+)(:\d{1,5})?([/?#]\S*)?$/i;

/** The address to store, or null when the text isn't a web address. */
export function normalizeUrl(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t || /\s/.test(t)) return null;
  let url = t;
  if (!t.includes('://')) {
    // Another scheme without slashes (javascript:, mailto:, data:…); «host:port» is fine.
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t)) return null;
    url = `https://${t}`;
  }
  const m = WEB.exec(url);
  if (!m) return null;
  const host = m[2].toLowerCase();
  if (host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return null;
  return url;
}

/** «youtube.com» for a button label. */
export function urlLabel(url: string): string {
  const m = WEB.exec(url);
  return m ? m[2].toLowerCase().replace(/^www\./, '') : url;
}
