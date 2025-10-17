import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// Error detail interface for better type safety
export interface ErrorDetail {
  field?: string;
  message: string;
  value?: unknown;
  [key: string]: unknown; // Allow additional properties
}

// Base Error Class
export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly errors?: ErrorDetail[];

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    errors?: ErrorDetail[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.errors = errors;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication Errors
export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', errors?: ErrorDetail[]) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, errors);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Access denied', errors?: ErrorDetail[]) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, errors);
  }
}

export class TokenExpiredError extends BaseError {
  constructor(message: string = 'Token has expired', errors?: ErrorDetail[]) {
    super(message, 401, 'TOKEN_EXPIRED', true, errors);
  }
}

export class InvalidTokenError extends BaseError {
  constructor(message: string = 'Invalid token', errors?: ErrorDetail[]) {
    super(message, 401, 'INVALID_TOKEN', true, errors);
  }
}

// Validation Errors
export class ValidationError extends BaseError {
  constructor(message: string = 'Validation failed', errors?: ErrorDetail[]) {
    super(message, 400, 'VALIDATION_ERROR', true, errors);
  }
}

export class DuplicateError extends BaseError {
  constructor(message: string = 'Resource already exists', errors?: ErrorDetail[]) {
    super(message, 409, 'DUPLICATE_ERROR', true, errors);
  }
}

// Resource Errors
export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found', errors?: ErrorDetail[]) {
    super(message, 404, 'NOT_FOUND', true, errors);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string = 'Resource conflict', errors?: ErrorDetail[]) {
    super(message, 409, 'CONFLICT_ERROR', true, errors);
  }
}

export class UnprocessableEntityError extends BaseError {
  constructor(message: string = 'Unprocessable entity', errors?: ErrorDetail[]) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', true, errors);
  }
}

// Business Logic Errors
export class BookingError extends BaseError {
  constructor(message: string = 'Booking operation failed', errors?: ErrorDetail[]) {
    super(message, 400, 'BOOKING_ERROR', true, errors);
  }
}

export class CalendarError extends BaseError {
  constructor(message: string = 'Calendar operation failed', errors?: ErrorDetail[]) {
    super(message, 400, 'CALENDAR_ERROR', true, errors);
  }
}

export class RatePlanError extends BaseError {
  constructor(message: string = 'Rate plan operation failed', errors?: ErrorDetail[]) {
    super(message, 400, 'RATE_PLAN_ERROR', true, errors);
  }
}

export class ChannelError extends BaseError {
  constructor(message: string = 'Channel operation failed', errors?: ErrorDetail[]) {
    super(message, 400, 'CHANNEL_ERROR', true, errors);
  }
}

// External Service Errors
export class ExternalServiceError extends BaseError {
  constructor(message: string = 'External service error', errors?: ErrorDetail[]) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', true, errors);
  }
}

export class OTAServiceError extends BaseError {
  constructor(message: string = 'OTA service error', errors?: ErrorDetail[]) {
    super(message, 502, 'OTA_SERVICE_ERROR', true, errors);
  }
}

// File Upload Errors
export class FileUploadError extends BaseError {
  constructor(message: string = 'File upload failed', errors?: ErrorDetail[]) {
    super(message, 400, 'FILE_UPLOAD_ERROR', true, errors);
  }
}

export class FileSizeError extends BaseError {
  constructor(message: string = 'File size exceeds limit', errors?: ErrorDetail[]) {
    super(message, 413, 'FILE_SIZE_ERROR', true, errors);
  }
}

export class FileTypeError extends BaseError {
  constructor(message: string = 'Invalid file type', errors?: ErrorDetail[]) {
    super(message, 400, 'FILE_TYPE_ERROR', true, errors);
  }
}

// Database Errors
export class DatabaseError extends BaseError {
  constructor(message: string = 'Database operation failed', errors?: ErrorDetail[]) {
    super(message, 500, 'DATABASE_ERROR', false, errors);
  }
}

export class ConnectionError extends BaseError {
  constructor(message: string = 'Database connection failed', errors?: ErrorDetail[]) {
    super(message, 503, 'CONNECTION_ERROR', false, errors);
  }
}

// Rate Limiting Errors
export class RateLimitError extends BaseError {
  constructor(message: string = 'Rate limit exceeded', errors?: ErrorDetail[]) {
    super(message, 429, 'RATE_LIMIT_ERROR', true, errors);
  }
}

// Email Service Errors
export class EmailServiceError extends BaseError {
  constructor(message: string = 'Email service error', errors?: ErrorDetail[]) {
    super(message, 500, 'EMAIL_SERVICE_ERROR', true, errors);
  }
}

// Audit Logging Errors
export class AuditLogError extends BaseError {
  constructor(message: string = 'Audit logging failed', errors?: ErrorDetail[]) {
    super(message, 500, 'AUDIT_LOG_ERROR', false, errors);
  }
}

// Error Handler Middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let errors: ErrorDetail[] | undefined;

  // Handle known error types
  if (error instanceof BaseError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    errors = error.errors;
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errors = Object.values((error as any).errors).map((err: any) => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
  } else if (error.name === 'CastError') {
    // Mongoose cast error
    statusCode = 400;
    code = 'CAST_ERROR';
    message = 'Invalid data format';
    errors = [{
      field: (error as any).path,
      message: `Invalid ${(error as any).kind}`,
      value: (error as any).value
    }];
  } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    // MongoDB errors
    statusCode = 500;
    code = 'DATABASE_ERROR';
    message = 'Database operation failed';
    
    if ((error as any).code === 11000) {
      // Duplicate key error
      statusCode = 409;
      code = 'DUPLICATE_ERROR';
      message = 'Resource already exists';
      const field = Object.keys((error as any).keyPattern)[0];
      errors = [{
        field,
        message: `${field} already exists`,
        value: (error as any).keyValue[field]
      }];
    }
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (error.name === 'MulterError') {
    // File upload errors
    statusCode = 400;
    code = 'FILE_UPLOAD_ERROR';
    message = 'File upload failed';
    
    switch ((error as any).code) {
      case 'LIMIT_FILE_SIZE':
        statusCode = 413;
        code = 'FILE_SIZE_ERROR';
        message = 'File size exceeds limit';
        break;
      case 'LIMIT_FILE_COUNT':
        code = 'FILE_COUNT_ERROR';
        message = 'Too many files uploaded';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        code = 'UNEXPECTED_FILE_ERROR';
        message = 'Unexpected file field';
        break;
    }
  }

  // Log error details
  const errorDetails = {
    message: error.message,
    stack: error.stack,
    statusCode,
    code,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString()
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', errorDetails);
  } else {
    logger.warn('Client Error:', errorDetails);
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    code,
    errors,
    ...(process.env['NODE_ENV'] === 'development' && {
      stack: error.stack,
      details: errorDetails
    })
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error factory functions
export const createError = {
  authentication: (message?: string, errors?: ErrorDetail[]) => new AuthenticationError(message, errors),
  authorization: (message?: string, errors?: ErrorDetail[]) => new AuthorizationError(message, errors),
  validation: (message?: string, errors?: ErrorDetail[]) => new ValidationError(message, errors),
  notFound: (message?: string, errors?: ErrorDetail[]) => new NotFoundError(message, errors),
  conflict: (message?: string, errors?: ErrorDetail[]) => new ConflictError(message, errors),
  duplicate: (message?: string, errors?: ErrorDetail[]) => new DuplicateError(message, errors),
  booking: (message?: string, errors?: ErrorDetail[]) => new BookingError(message, errors),
  calendar: (message?: string, errors?: ErrorDetail[]) => new CalendarError(message, errors),
  ratePlan: (message?: string, errors?: ErrorDetail[]) => new RatePlanError(message, errors),
  channel: (message?: string, errors?: ErrorDetail[]) => new ChannelError(message, errors),
  fileUpload: (message?: string, errors?: ErrorDetail[]) => new FileUploadError(message, errors),
  fileSize: (message?: string, errors?: ErrorDetail[]) => new FileSizeError(message, errors),
  fileType: (message?: string, errors?: ErrorDetail[]) => new FileTypeError(message, errors),
  database: (message?: string, errors?: ErrorDetail[]) => new DatabaseError(message, errors),
  externalService: (message?: string, errors?: ErrorDetail[]) => new ExternalServiceError(message, errors),
  otaService: (message?: string, errors?: ErrorDetail[]) => new OTAServiceError(message, errors),
  emailService: (message?: string, errors?: ErrorDetail[]) => new EmailServiceError(message, errors),
  rateLimit: (message?: string, errors?: ErrorDetail[]) => new RateLimitError(message, errors),
  auditLog: (message?: string, errors?: ErrorDetail[]) => new AuditLogError(message, errors)
};

export default {
  BaseError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  BookingError,
  CalendarError,
  RatePlanError,
  ChannelError,
  FileUploadError,
  DatabaseError,
  ExternalServiceError,
  OTAServiceError,
  EmailServiceError,
  RateLimitError,
  AuditLogError,
  errorHandler,
  asyncHandler,
  createError
};
