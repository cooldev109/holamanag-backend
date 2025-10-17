import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// General rate limiting for all API endpoints
export const generalRateLimit = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env['NODE_ENV'] === 'development') {
      const ip = req.ip || req.socket.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
    });
  }
});

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: parseInt(process.env['AUTH_RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  max: parseInt(process.env['AUTH_RATE_LIMIT_MAX_REQUESTS'] || '5'), // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(parseInt(process.env['AUTH_RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env['NODE_ENV'] === 'development') {
      const ip = req.ip || req.socket.remoteAddress;
      return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    }
    return false;
  },
  handler: (req: Request, res: Response) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      body: req.body ? { email: req.body.email } : undefined
    });
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(parseInt(process.env['AUTH_RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
    });
  }
});

// Slow down middleware for repeated requests
export const speedLimiter: any = slowDown({
  windowMs: parseInt(process.env['SPEED_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  delayAfter: parseInt(process.env['SPEED_LIMIT_DELAY_AFTER'] || '50'), // allow 50 requests per 15 minutes, then...
  delayMs: parseInt(process.env['SPEED_LIMIT_DELAY_MS'] || '500'), // begin adding 500ms of delay per request above 50
  maxDelayMs: parseInt(process.env['SPEED_LIMIT_MAX_DELAY_MS'] || '20000') // max delay of 20 seconds
});

// Custom rate limiting for specific endpoints
export const createCustomRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
      code: 'CUSTOM_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Custom rate limit exceeded for IP: ${req.ip}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        limit: max,
        windowMs
      });
      res.status(429).json({
        success: false,
        message,
        code: 'CUSTOM_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Rate limiting for file uploads
export const uploadRateLimit = createCustomRateLimit(
  parseInt(process.env['UPLOAD_RATE_LIMIT_WINDOW_MS'] || '3600000'), // 1 hour
  parseInt(process.env['UPLOAD_RATE_LIMIT_MAX_REQUESTS'] || '10'), // 10 uploads per hour
  'Too many file uploads, please try again later.'
);

// Rate limiting for password reset requests
export const passwordResetRateLimit = createCustomRateLimit(
  parseInt(process.env['PASSWORD_RESET_RATE_LIMIT_WINDOW_MS'] || '3600000'), // 1 hour
  parseInt(process.env['PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS'] || '3'), // 3 password reset requests per hour
  'Too many password reset requests, please try again later.'
);

// Rate limiting for user registration
export const registrationRateLimit = createCustomRateLimit(
  parseInt(process.env['REGISTRATION_RATE_LIMIT_WINDOW_MS'] || '3600000'), // 1 hour
  parseInt(process.env['REGISTRATION_RATE_LIMIT_MAX_REQUESTS'] || '5'), // 5 registrations per hour
  'Too many registration attempts, please try again later.'
);

// Middleware to skip rate limiting for certain conditions
export const skipRateLimit = (req: Request, _res: Response, next: NextFunction) => {
  // Skip rate limiting for health checks
  if (req.path === '/health') {
    return next();
  }
  
  // Skip rate limiting for API documentation
  if (req.path.startsWith('/api-docs')) {
    return next();
  }
  
  // Skip rate limiting for static assets
  if (req.path.startsWith('/static') || req.path.startsWith('/uploads')) {
    return next();
  }
  
  next();
};

// Rate limiting bypass for trusted IPs (admin, development)
export const createTrustedIPRateLimit = (trustedIPs: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (trustedIPs.includes(clientIP)) {
      logger.info(`Trusted IP bypassed rate limiting: ${clientIP}`, {
        ip: clientIP,
        path: req.path,
        method: req.method
      });
      return next();
    }
    
    next();
  };
};

const rateLimitingMiddleware: any = {
  generalRateLimit,
  authRateLimit,
  speedLimiter,
  uploadRateLimit,
  passwordResetRateLimit,
  registrationRateLimit,
  skipRateLimit,
  createCustomRateLimit,
  createTrustedIPRateLimit
};

export default rateLimitingMiddleware;
