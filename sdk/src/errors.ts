export class SSSError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SSSError';
    this.code = code;
    Object.setPrototypeOf(this, SSSError.prototype);
  }
}
