import { Request, Response, NextFunction } from 'express';
import jwtService, { JwtPayload } from '../services/jwtService';
import User, { Role, IUser } from '../models/User';
import { logger } from '../config/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      token?: JwtPayload;
    }
  }
}

// Role hierarchy for authorization
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPERADMIN]: 4,
  [Role.ADMIN]: 3,
  [Role.SUPERVISOR]: 2,
  [Role.CLIENT]: 1
};

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT'
      });
      return;
    }

    // Verify token
    let decoded: JwtPayload;
    try {
      decoded = jwtService.verifyAccessToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      res.status(401).json({
        success: false,
        message: `Access denied. ${message}`,
        code: 'TOKEN_VERIFICATION_FAILED'
      });
      return;
    }

    // Find user in database
    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. User not found.',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Account is deactivated.',
        code: 'ACCOUNT_DEACTIVATED'
      });
      return;
    }

    // Check if account is locked
    if (user.isLocked) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Account is temporarily locked.',
        code: 'ACCOUNT_LOCKED'
      });
      return;
    }

    // Attach user and token to request
    req.user = user;
    req.token = decoded;

    logger.debug(`User authenticated: ${user.email} (${user.roles.join(', ')})`);
    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

/**
 * Authorization middleware - checks if user has required role
 */
export const authorize = (requiredRoles: Role | Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.',
          code: 'AUTHENTICATION_REQUIRED'
        });
        return;
      }

      const userRoles = req.user.roles;
      const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      // Check if user has any of the required roles
      const hasRequiredRole = rolesArray.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        res.status(403).json({
          success: false,
          message: `Access denied. Required roles: ${rolesArray.join(', ')}. Your roles: ${userRoles.join(', ')}.`,
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      logger.debug(`User authorized: ${req.user.email} with roles: ${userRoles.join(', ')}`);
      next();
    } catch (error) {
      logger.error('Authorization middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during authorization.',
        code: 'AUTH_INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Role hierarchy middleware - checks if user has sufficient role level
 */
export const requireRole = (minRole: Role) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. Authentication required.',
          code: 'AUTHENTICATION_REQUIRED'
        });
        return;
      }

      const userRoles = req.user.roles;
      const minLevel = ROLE_HIERARCHY[minRole];

      // Check if user has any role with sufficient level
      const hasSufficientRole = userRoles.some(role => 
        ROLE_HIERARCHY[role] >= minLevel
      );

      if (!hasSufficientRole) {
        res.status(403).json({
          success: false,
          message: `Access denied. Minimum required role: ${minRole}. Your roles: ${userRoles.join(', ')}.`,
          code: 'INSUFFICIENT_ROLE_LEVEL'
        });
        return;
      }

      logger.debug(`User role hierarchy check passed: ${req.user.email} with roles: ${userRoles.join(', ')}`);
      next();
    } catch (error) {
      logger.error('Role hierarchy middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during role hierarchy check.',
        code: 'AUTH_INTERNAL_ERROR'
      });
    }
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      // Invalid token format, continue without authentication
      next();
      return;
    }

    // Try to verify token
    try {
      const decoded = jwtService.verifyAccessToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive && !user.isLocked) {
        req.user = user;
        req.token = decoded;
        logger.debug(`Optional authentication successful: ${user.email}`);
      }
    } catch (error) {
      // Token verification failed, continue without authentication
      logger.debug('Optional authentication failed, continuing without user context');
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    // Don't fail the request, just continue without authentication
    next();
  }
};

/**
 * Self or admin middleware - allows users to access their own data or admins to access any data
 */
export const selfOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const userId = req.params['id'] || req.params['userId'];
    const isAdmin = req.user.roles.includes(Role.ADMIN) || req.user.roles.includes(Role.SUPERADMIN);
    const isSelf = userId && userId === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own data.',
        code: 'ACCESS_DENIED_SELF_OR_ADMIN'
      });
      return;
    }

    logger.debug(`Self or admin check passed: ${req.user.email} accessing user: ${userId}`);
    next();
  } catch (error) {
    logger.error('Self or admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during self or admin check.',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

/**
 * Superadmin only middleware
 */
export const superadminOnly = authorize(Role.SUPERADMIN);

/**
 * Admin or superadmin middleware
 */
export const adminOrSuperadmin = authorize([Role.ADMIN, Role.SUPERADMIN]);

/**
 * Supervisor or higher middleware
 */
export const supervisorOrHigher = requireRole(Role.SUPERVISOR);

/**
 * Client or higher middleware
 */
export const clientOrHigher = requireRole(Role.CLIENT);

// Export role hierarchy for use in other modules
export { ROLE_HIERARCHY };