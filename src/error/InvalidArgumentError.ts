import { BaseError } from 'noicejs/error/BaseError';

export class InvalidArgumentError extends BaseError {
  constructor(msg = 'invalid argument passed', ...nested: Array<Error>) {
    super(msg, ...nested);
  }
}
