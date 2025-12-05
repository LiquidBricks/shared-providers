// Shared DiagnosticError class so callers can instanceof against diagnostic failures.
export class DiagnosticError extends Error {
  constructor({ type, code, message, meta, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DiagnosticError';
    this.type = type;
    this.code = code;
    this.meta = meta ?? {};
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      meta: this.meta,
      cause: this.cause && { name: this.cause.name, message: this.cause.message }
    };
  }
}

