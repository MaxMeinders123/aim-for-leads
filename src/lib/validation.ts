import { z } from 'zod';

/**
 * Validation schemas and utilities for form inputs and API payloads
 *
 * Uses Zod for runtime type validation to prevent invalid data
 * from reaching the backend or causing errors.
 */

// =============================================================================
// Company Validation
// =============================================================================

export const companySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255, 'Company name is too long'),
  website: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true; // Optional field
        // Allow domains with or without protocol
        const urlPattern = /^(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/.*)?$/;
        return urlPattern.test(val);
      },
      { message: 'Invalid website URL' }
    ),
  linkedin_url: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true; // Optional field
        // LinkedIn URL pattern
        return val.includes('linkedin.com/') || val.includes('linkedin.com/company/');
      },
      { message: 'Invalid LinkedIn URL' }
    ),
  salesforce_account_id: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true; // Optional field
        // Salesforce ID pattern (15 or 18 characters)
        return /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(val);
      },
      { message: 'Invalid Salesforce Account ID' }
    ),
});

export type CompanyInput = z.infer<typeof companySchema>;

// =============================================================================
// LinkedIn URL Validation
// =============================================================================

export const linkedInUrlSchema = z
  .string()
  .refine(
    (val) => {
      if (!val) return false;
      const normalized = val.toLowerCase();
      return (
        normalized.includes('linkedin.com/in/') ||
        normalized.includes('linkedin.com/company/')
      );
    },
    { message: 'Must be a valid LinkedIn profile or company URL' }
  )
  .refine(
    (val) => {
      // Ensure it's not just the domain
      const path = val.split('linkedin.com/')[1];
      return path && path.length > 4;
    },
    { message: 'LinkedIn URL must include a profile or company path' }
  );

/**
 * Validates and normalizes a LinkedIn URL
 *
 * @param url - LinkedIn URL to validate
 * @returns Normalized URL or null if invalid
 */
export function validateLinkedInUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    // Normalize URL
    let normalized = url.trim();

    // Add protocol if missing
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }

    // Validate
    linkedInUrlSchema.parse(normalized);

    // Ensure www subdomain is removed for consistency
    normalized = normalized.replace('www.linkedin.com', 'linkedin.com');

    return normalized;
  } catch {
    return null;
  }
}

// =============================================================================
// Campaign Validation
// =============================================================================

export const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(255, 'Campaign name is too long'),
  target_region: z.string().optional(),
  product: z.string().optional(),
  product_category: z.string().optional(),
  technical_focus: z.string().optional(),
  job_titles: z.string().optional(),
  personas: z.string().optional(),
  target_verticals: z.string().optional(),
  primary_angle: z.string().optional(),
  secondary_angle: z.string().optional(),
  pain_points: z.string().optional(),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

// =============================================================================
// Salesforce ID Validation
// =============================================================================

export const salesforceIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/, 'Invalid Salesforce ID format');

/**
 * Validates a Salesforce ID (Account or Campaign)
 *
 * @param id - Salesforce ID to validate
 * @returns true if valid
 */
export function isValidSalesforceId(id: string | null | undefined): boolean {
  if (!id) return false;
  try {
    salesforceIdSchema.parse(id);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Email Validation
// =============================================================================

export const emailSchema = z.string().email('Invalid email address');

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Sanitization Utilities
// =============================================================================

/**
 * Sanitizes user input to prevent XSS attacks
 *
 * @param input - User input string
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
}

/**
 * Sanitizes a URL to prevent javascript: and data: URLs
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return null;
  }

  return url.trim();
}
