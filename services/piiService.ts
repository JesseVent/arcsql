/**
 * PII/PHI Scrubber Utility
 * Scrubs common patterns of Personally Identifiable Information (PII) 
 * and Protected Health Information (PHI) from text.
 */

const PII_PATTERNS = [
  // Email addresses
  {
    name: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]'
  },
  // Phone numbers (various formats)
  {
    name: 'PHONE',
    regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: '[PHONE]'
  },
  // Social Security Numbers (SSN)
  {
    name: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN]'
  },
  // Credit Card Numbers
  {
    name: 'CREDIT_CARD',
    regex: /\b(?:\d[ -]?){13,16}\b/g,
    replacement: '[CARD]'
  },
  // IPv4 Addresses
  {
    name: 'IP_ADDRESS',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP]'
  },
  // Dates of Birth (heuristic: "DOB: MM/DD/YYYY" or similar)
  {
    name: 'DOB',
    regex: /\b(DOB|Date of Birth|Born)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi,
    replacement: '$1: [DOB]'
  },
  // Zip Codes (5 digits or 5+4)
  {
    name: 'ZIP',
    regex: /\b\d{5}(-\d{4})?\b/g,
    replacement: '[ZIP]'
  }
];

/**
 * Scrubs PII/PHI from a string.
 */
export const scrubPii = (text: string): string => {
  if (!text) return text;
  
  let scrubbed = text;
  for (const pattern of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern.regex, pattern.replacement);
  }
  
  return scrubbed;
};

/**
 * Scrubs PII/PHI from an object or array recursively.
 */
export const scrubPiiFromObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return scrubPii(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => scrubPiiFromObject(item));
  }
  
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = scrubPiiFromObject(obj[key]);
    }
    return newObj;
  }
  
  return obj;
};
