// Centralized diagnostics codes for provider package
// Use SCREAMING_SNAKE_CASE and group by domain

export const Codes = {
  // Generic preconditions / invariants
  PRECONDITION_REQUIRED: 'PRECONDITION_REQUIRED',
  PRECONDITION_INVALID: 'PRECONDITION_INVALID',

  // Example invariant from README
  KV_INVARIANT_V_MISSING: 'KV_INVARIANT_V_MISSING',

  // Generic deprecation warning
  DEPRECATED_CONFIG: 'DEPRECATED_CONFIG',

  // Stream management
  STREAM_CREATE_FAILED: 'STREAM_CREATE_FAILED',
  STREAM_SUBJECT_OVERLAP: 'STREAM_SUBJECT_OVERLAP',
};
