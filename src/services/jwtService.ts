import jwt from 'jsonwebtoken';
import { IUser, Role } from '../models/User';
import { logger } from '../config/logger';

// JWT payload interface
export interface JwtPayload {
  userId: string;
  email: string;
  roles: Role[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// Token pair interface
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// JWT service class
class JwtService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiry: string;
  private readonly refreshExpiry: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    this.accessSecret = process.env['JWT_SECRET'] || 'your-super-secret-jwt-key-here';
    this.refreshSecret = process.env['JWT_REFRESH_SECRET'] || 'your-refresh-secret-key-here';
    this.accessExpiry = process.env['JWT_EXPIRES_IN'] || '24h';
    this.refreshExpiry = process.env['JWT_REFRESH_EXPIRES_IN'] || '7d';
    this.issuer = process.env['JWT_ISSUER'] || 'reservario-api';
    this.audience = process.env['JWT_AUDIENCE'] || 'reservario-client';

    // Validate required environment variables
    if (!process.env['JWT_SECRET'] || !process.env['JWT_REFRESH_SECRET']) {
      logger.warn('JWT secrets not properly configured. Using default values.');
    }
  }

  /**
   * Generate access and refresh token pair
   */
  generateTokenPair(user: IUser): TokenPair {
    try {
      const payload: JwtPayload = {
        userId: user._id.toString(),
        email: user.email,
        roles: user.roles
      };

      const accessToken = jwt.sign(payload, this.accessSecret, {
        expiresIn: this.accessExpiry,
        issuer: this.issuer,
        audience: this.audience
      } as jwt.SignOptions);

      const refreshToken = jwt.sign(
        { userId: user._id.toString() },
        this.refreshSecret,
        {
          expiresIn: this.refreshExpiry,
          issuer: this.issuer,
          audience: this.audience
        } as jwt.SignOptions
      );

      // Calculate expiration time in seconds
      const expiresIn = this.parseExpiryToSeconds(this.accessExpiry);

      logger.info(`Token pair generated for user: ${user.email}`);

      return {
        accessToken,
        refreshToken,
        expiresIn
      };
    } catch (error) {
      logger.error('Error generating token pair:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: this.audience
      }) as JwtPayload;

      logger.debug(`Access token verified for user: ${decoded.email}`);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Access token expired');
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token');
        throw new Error('Invalid token');
      } else {
        logger.error('Error verifying access token:', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, this.refreshSecret, {
        issuer: this.issuer,
        audience: this.audience
      }) as { userId: string };

      logger.debug(`Refresh token verified for user: ${decoded.userId}`);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Refresh token expired');
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token');
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Error verifying refresh token:', error);
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string, user: IUser): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = this.verifyRefreshToken(refreshToken);

      // Check if the user ID matches
      if (decoded.userId !== user._id.toString()) {
        throw new Error('Token user mismatch');
      }

      // Generate new token pair
      const newTokenPair = this.generateTokenPair(user);

      logger.info(`Access token refreshed for user: ${user.email}`);
      return newTokenPair;
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Error decoding token:', error);
      throw new Error('Token decode failed');
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      logger.error('Error getting token expiration:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const expiration = this.getTokenExpiration(token);
      if (!expiration) return true;
      return expiration < new Date();
    } catch (error) {
      logger.error('Error checking token expiration:', error);
      return true;
    }
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 86400; // Default to 24 hours
    }

    const value = parseInt(match[1] || '0', 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 86400;
    }
  }

  /**
   * Validate JWT configuration
   */
  validateConfig(): boolean {
    const requiredVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_EXPIRES_IN',
      'JWT_REFRESH_EXPIRES_IN'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      logger.warn(`Missing JWT configuration: ${missing.join(', ')}`);
      return false;
    }

    return true;
  }
}

// Create and export singleton instance
const jwtService = new JwtService();

// Validate configuration on startup
if (!jwtService.validateConfig()) {
  logger.warn('JWT service configuration validation failed');
}

export default jwtService;