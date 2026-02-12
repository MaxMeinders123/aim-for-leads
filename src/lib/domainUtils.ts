/**
 * Domain normalization utilities
 *
 * Centralized logic for normalizing company domains/websites to prevent
 * deduplication issues across the application.
 */

/**
 * Normalizes a company website URL or name to a consistent domain format
 *
 * @param website - The website URL (can include protocol, www, paths, etc.)
 * @param fallbackName - Company name to use if website is invalid
 * @returns Normalized domain in lowercase without protocol or www
 *
 * @example
 * normalizeCompanyDomain('https://www.example.com/about') // 'example.com'
 * normalizeCompanyDomain('Example.COM') // 'example.com'
 * normalizeCompanyDomain('', 'Acme Corp') // 'acmecorp'
 */
export function normalizeCompanyDomain(website?: string | null, fallbackName?: string | null): string {
  // If no website provided, use fallback name
  if (!website || !website.trim()) {
    return fallbackName?.toLowerCase().replace(/\s+/g, '') || '';
  }

  const trimmed = website.trim();

  // Try URL constructor first (most robust)
  try {
    const normalizedUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(normalizedUrl);
    return url.hostname
      .replace(/^www\./, '') // Remove www prefix
      .toLowerCase();
  } catch {
    // Fallback to regex-based normalization if URL constructor fails
    return trimmed
      .replace(/^https?:\/\//, '') // Remove protocol
      .replace(/^www\./, '') // Remove www
      .split('/')[0] // Remove path
      .split('?')[0] // Remove query params
      .split('#')[0] // Remove hash
      .toLowerCase();
  }
}

/**
 * Validates if a string is a valid domain
 *
 * @param domain - Domain string to validate
 * @returns true if domain is valid
 *
 * @example
 * isValidDomain('example.com') // true
 * isValidDomain('not a domain') // false
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;

  // Basic domain validation regex
  // Allows: example.com, sub.example.com, example.co.uk
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  return domainRegex.test(domain);
}

/**
 * Extracts domain from various URL formats
 *
 * @param url - URL string (can be full URL, domain, or partial)
 * @returns Extracted domain or null if invalid
 *
 * @example
 * extractDomain('https://www.example.com/path') // 'example.com'
 * extractDomain('example.com') // 'example.com'
 * extractDomain('invalid') // null
 */
export function extractDomain(url: string): string | null {
  const normalized = normalizeCompanyDomain(url);
  return isValidDomain(normalized) ? normalized : null;
}

/**
 * Compares two domains for equality (case-insensitive, normalized)
 *
 * @param domain1 - First domain/URL
 * @param domain2 - Second domain/URL
 * @returns true if domains match after normalization
 *
 * @example
 * domainsMatch('https://www.example.com', 'example.com') // true
 * domainsMatch('Example.COM', 'example.com') // true
 */
export function domainsMatch(domain1: string, domain2: string): boolean {
  const normalized1 = normalizeCompanyDomain(domain1);
  const normalized2 = normalizeCompanyDomain(domain2);
  return normalized1 === normalized2 && normalized1.length > 0;
}
