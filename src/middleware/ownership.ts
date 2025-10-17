import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import Property from '../models/Property';
import Booking from '../models/Booking';
import RatePlan from '../models/RatePlan';
import { Role } from '../models/User';

/**
 * Ownership Validation Middleware
 * Ensures users can only access/modify resources they own or manage
 * Superadmins bypass all ownership checks
 */

/**
 * Check if user owns or manages a property
 */
export const checkPropertyOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const propertyId = req.params['id'] || req.params['propertyId'];
    const userId = req.user._id.toString();
    const userRoles = req.user.roles;

    // Superadmins can access all properties
    if (userRoles.includes(Role.SUPERADMIN)) {
      logger.debug(`Superadmin ${req.user.email} bypassing ownership check for property ${propertyId}`);
      next();
      return;
    }

    const property = await Property.findById(propertyId);

    if (!property) {
      res.status(404).json({
        success: false,
        message: 'Property not found',
        code: 'PROPERTY_NOT_FOUND'
      });
      return;
    }

    // Check if user is owner or manager of the property
    const isOwner = property.owner.toString() === userId;
    const isManager = property.manager?.toString() === userId;

    if (!isOwner && !isManager) {
      logger.warn(`Access denied: User ${req.user.email} attempted to access property ${propertyId} they don't own/manage`, {
        userId,
        userEmail: req.user.email,
        propertyId,
        propertyOwner: property.owner.toString(),
        propertyManager: property.manager?.toString(),
        action: req.method,
        path: req.path
      });

      res.status(403).json({
        success: false,
        message: 'You do not have permission to access this property. You can only access properties you own or manage.',
        code: 'PROPERTY_OWNERSHIP_REQUIRED'
      });
      return;
    }

    logger.debug(`Ownership check passed: ${req.user.email} accessing property ${propertyId}`);
    next();
  } catch (error) {
    logger.error('Property ownership check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during ownership validation',
      code: 'OWNERSHIP_CHECK_ERROR'
    });
  }
};

/**
 * Check if user owns or manages a booking's property
 */
export const checkBookingOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const bookingId = req.params['id'] || req.params['bookingId'];
    const userId = req.user._id.toString();
    const userRoles = req.user.roles;

    // Superadmins can access all bookings
    if (userRoles.includes(Role.SUPERADMIN)) {
      logger.debug(`Superadmin ${req.user.email} bypassing ownership check for booking ${bookingId}`);
      next();
      return;
    }

    const booking = await Booking.findById(bookingId).populate('property');

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found',
        code: 'BOOKING_NOT_FOUND'
      });
      return;
    }

    if (!booking.property) {
      res.status(500).json({
        success: false,
        message: 'Booking property not found',
        code: 'BOOKING_PROPERTY_NOT_FOUND'
      });
      return;
    }

    // Check if user owns or manages the property associated with this booking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = booking.property as any;
    const isOwner = property.owner.toString() === userId;
    const isManager = property.manager?.toString() === userId;

    if (!isOwner && !isManager) {
      logger.warn(`Access denied: User ${req.user.email} attempted to access booking ${bookingId} for property they don't own/manage`, {
        userId,
        userEmail: req.user.email,
        bookingId,
        propertyId: property._id,
        propertyOwner: property.owner.toString(),
        propertyManager: property.manager?.toString(),
        action: req.method,
        path: req.path
      });

      res.status(403).json({
        success: false,
        message: 'You do not have permission to access this booking. You can only access bookings for properties you own or manage.',
        code: 'BOOKING_OWNERSHIP_REQUIRED'
      });
      return;
    }

    logger.debug(`Ownership check passed: ${req.user.email} accessing booking ${bookingId}`);
    next();
  } catch (error) {
    logger.error('Booking ownership check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during ownership validation',
      code: 'OWNERSHIP_CHECK_ERROR'
    });
  }
};

/**
 * Check if user owns or manages a rate plan's property
 */
export const checkRatePlanOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const ratePlanId = req.params['id'] || req.params['ratePlanId'];
    const userId = req.user._id.toString();
    const userRoles = req.user.roles;

    // Superadmins can access all rate plans
    if (userRoles.includes(Role.SUPERADMIN)) {
      logger.debug(`Superadmin ${req.user.email} bypassing ownership check for rate plan ${ratePlanId}`);
      next();
      return;
    }

    const ratePlan = await RatePlan.findById(ratePlanId).populate('property');

    if (!ratePlan) {
      res.status(404).json({
        success: false,
        message: 'Rate plan not found',
        code: 'RATE_PLAN_NOT_FOUND'
      });
      return;
    }

    if (!ratePlan.property) {
      res.status(500).json({
        success: false,
        message: 'Rate plan property not found',
        code: 'RATE_PLAN_PROPERTY_NOT_FOUND'
      });
      return;
    }

    // Check if user owns or manages the property associated with this rate plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ratePlan.property as any;
    const isOwner = property.owner.toString() === userId;
    const isManager = property.manager?.toString() === userId;

    if (!isOwner && !isManager) {
      logger.warn(`Access denied: User ${req.user.email} attempted to access rate plan ${ratePlanId} for property they don't own/manage`, {
        userId,
        userEmail: req.user.email,
        ratePlanId,
        propertyId: property._id,
        propertyOwner: property.owner.toString(),
        propertyManager: property.manager?.toString(),
        action: req.method,
        path: req.path
      });

      res.status(403).json({
        success: false,
        message: 'You do not have permission to access this rate plan. You can only access rate plans for properties you own or manage.',
        code: 'RATE_PLAN_OWNERSHIP_REQUIRED'
      });
      return;
    }

    logger.debug(`Ownership check passed: ${req.user.email} accessing rate plan ${ratePlanId}`);
    next();
  } catch (error) {
    logger.error('Rate plan ownership check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during ownership validation',
      code: 'OWNERSHIP_CHECK_ERROR'
    });
  }
};

/**
 * Helper function to check if user can create resources for a property
 * Used when creating new bookings, rate plans, etc.
 */
export const checkPropertyAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
      return;
    }

    const propertyId = req.body.property || req.body.propertyId;

    if (!propertyId) {
      res.status(400).json({
        success: false,
        message: 'Property ID is required',
        code: 'PROPERTY_ID_REQUIRED'
      });
      return;
    }

    const userId = req.user._id.toString();
    const userRoles = req.user.roles;

    // Superadmins can create resources for any property
    if (userRoles.includes(Role.SUPERADMIN)) {
      logger.debug(`Superadmin ${req.user.email} bypassing ownership check for property ${propertyId}`);
      next();
      return;
    }

    const property = await Property.findById(propertyId);

    if (!property) {
      res.status(404).json({
        success: false,
        message: 'Property not found',
        code: 'PROPERTY_NOT_FOUND'
      });
      return;
    }

    // Check if user owns or manages the property
    const isOwner = property.owner.toString() === userId;
    const isManager = property.manager?.toString() === userId;

    if (!isOwner && !isManager) {
      logger.warn(`Access denied: User ${req.user.email} attempted to create resource for property ${propertyId} they don't own/manage`, {
        userId,
        userEmail: req.user.email,
        propertyId,
        propertyOwner: property.owner.toString(),
        propertyManager: property.manager?.toString(),
        action: req.method,
        path: req.path
      });

      res.status(403).json({
        success: false,
        message: 'You do not have permission to create resources for this property. You can only create resources for properties you own or manage.',
        code: 'PROPERTY_ACCESS_REQUIRED'
      });
      return;
    }

    logger.debug(`Property access check passed: ${req.user.email} creating resource for property ${propertyId}`);
    next();
  } catch (error) {
    logger.error('Property access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during property access validation',
      code: 'PROPERTY_ACCESS_CHECK_ERROR'
    });
  }
};
