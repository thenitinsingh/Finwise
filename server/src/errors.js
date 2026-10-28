// Typed errors. The API layer turns these into `{"detail": "..."}` responses.

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.name = 'HttpError';
    this.status = status;
    this.detail = detail;
  }
}

// Thrown by tools when their input is invalid (e.g. a negative monthly amount).
export class ToolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

// Thrown by the AI service when no usable LLM client exists (no key, the
// placeholder key, or the integration has not been hand-coded yet). → 503
export class AiNotConfiguredError extends Error {
  constructor(message = 'AI is not configured.') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

// Thrown by the AI service when the input is not finance related (e.g. a photo
// of a dog, a recipe, a "write me a poem" request). → HTTP 422 with a friendly message.
export class OutOfScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutOfScopeError';
  }
}
