import { Request, Response } from 'express';
import RatePlan, { RatePlanType, RatePlanStatus } from '../models/RatePlan';
import Property from '../models/Property';
import { logger } from '../config/logger';
import { z } from 'zod';

// Query validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10'),
  type: z.nativeEnum(RatePlanType).optional(),
  status: z.nativeEnum(RatePlanStatus).optional(),
  property: z.string().optional(),
  room: z.string().optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  sortBy: z.enum(['name', 'baseRate', 'validFrom', 'validTo', 'priority', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Rate calculation query schema
const rateCalculationSchema = z.object({
  property: z.string().min(1, 'Property ID is required'),
  room: z.string().min(1, 'Room ID is required'),
  checkIn: z.string().datetime('Invalid check-in date format'),
  checkOut: z.string().datetime('Invalid check-out date format'),
  guests: z.object({
    adults: z.number().min(1, 'At least one adult is required').max(20, 'Cannot exceed 20 adults'),
    children: z.number().min(0, 'Children count cannot be negative').max(10, 'Cannot exceed 10 children').default(0),
    infants: z.number().min(0, 'Infants count cannot be negative').max(5, 'Cannot exceed 5 infants').default(0)
  }).optional(),
  advanceBookingDays: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(0)).optional()
});

/**
 * RatePlan Controller
 * Handles all rate plan-related operations
 */
export class RatePlanController {
  /**
   * Get all rate plans with filtering and pagination
   */
  static async getAllRatePlans(req: Request, res: Response): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, type, status, property, room, isActive, sortBy, sortOrder } = query;

      // Build filter object
      const filter: any = {};

      if (type) filter.type = type;
      if (status) filter.status = status;
      if (property) filter.property = property;
      if (room) filter.room = room;

      // Active filter (check if currently valid)
      if (isActive !== undefined) {
        const now = new Date();
        if (isActive) {
          filter.status = RatePlanStatus.ACTIVE;
          filter.validFrom = { $lte: now };
          filter.validTo = { $gte: now };
        } else {
          filter.$or = [
            { status: { $ne: RatePlanStatus.ACTIVE } },
            { validFrom: { $gt: now } },
            { validTo: { $lt: now } }
          ];
        }
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [ratePlans, total] = await Promise.all([
        RatePlan.find(filter)
          .populate('property', 'name address.city address.country')
          .populate('room', 'name type baseRate')
          .populate('createdBy', 'email profile.firstName profile.lastName')
          .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        RatePlan.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          ratePlans,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          }
        },
        message: 'Rate plans retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting rate plans:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLANS_FETCH_ERROR'
      });
    }
  }

  /**
   * Get single rate plan by ID
   */
  static async getRatePlanById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const ratePlan = await RatePlan.findById(id)
        .populate('property', 'name address contactInfo')
        .populate('room', 'name type capacity amenities baseRate')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
        .lean();

      if (!ratePlan) {
        res.status(404).json({
          success: false,
          message: 'Rate plan not found',
          code: 'RATE_PLAN_NOT_FOUND'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { ratePlan },
        message: 'Rate plan retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting rate plan by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLAN_FETCH_ERROR'
      });
    }
  }

  /**
   * Create new rate plan
   */
  static async createRatePlan(req: Request, res: Response): Promise<void> {
    try {
      const ratePlanData = req.body;
      const userId = req.user?.id;

      // Validate property and room exist
      const property = await Property.findById(ratePlanData.property);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const room = property.rooms.find((r: any) => r._id.toString() === ratePlanData.room);
      if (!room) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Add created by user
      ratePlanData.createdBy = userId;

      const ratePlan = new RatePlan(ratePlanData);
      await ratePlan.save();

      // Populate the created rate plan
      await ratePlan.populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Rate plan created: ${ratePlan._id} by user: ${userId}`);

      res.status(201).json({
        success: true,
        data: { ratePlan },
        message: 'Rate plan created successfully'
      });

    } catch (error) {
      logger.error('Error creating rate plan:', error);

      if (error instanceof Error && error.name === 'ValidationError') {
        const validationError = error as any;
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(validationError.errors).map((err: any) => ({
            field: err.path,
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLAN_CREATE_ERROR'
      });
    }
  }

  /**
   * Update rate plan
   */
  static async updateRatePlan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      // Add last modified by user
      updateData.lastModifiedBy = userId;

      const ratePlan = await RatePlan.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!ratePlan) {
        res.status(404).json({
          success: false,
          message: 'Rate plan not found',
          code: 'RATE_PLAN_NOT_FOUND'
        });
        return;
      }

      logger.info(`Rate plan updated: ${ratePlan._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { ratePlan },
        message: 'Rate plan updated successfully'
      });

    } catch (error) {
      logger.error('Error updating rate plan:', error);

      if (error instanceof Error && error.name === 'ValidationError') {
        const validationError = error as any;
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.values(validationError.errors).map((err: any) => ({
            field: err.path,
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLAN_UPDATE_ERROR'
      });
    }
  }

  /**
   * Delete rate plan
   */
  static async deleteRatePlan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const ratePlan = await RatePlan.findByIdAndDelete(id);

      if (!ratePlan) {
        res.status(404).json({
          success: false,
          message: 'Rate plan not found',
          code: 'RATE_PLAN_NOT_FOUND'
        });
        return;
      }

      logger.info(`Rate plan deleted: ${ratePlan._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Rate plan deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting rate plan:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLAN_DELETE_ERROR'
      });
    }
  }

  /**
   * Toggle rate plan status
   */
  static async toggleRatePlanStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      if (!Object.values(RatePlanStatus).includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status value',
          code: 'INVALID_STATUS'
        });
        return;
      }

      const ratePlan = await RatePlan.findByIdAndUpdate(
        id,
        { status, lastModifiedBy: userId },
        { new: true, runValidators: true }
      ).populate([
        { path: 'property', select: 'name address contactInfo' },
        { path: 'room', select: 'name type capacity amenities baseRate' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!ratePlan) {
        res.status(404).json({
          success: false,
          message: 'Rate plan not found',
          code: 'RATE_PLAN_NOT_FOUND'
        });
        return;
      }

      logger.info(`Rate plan status updated: ${ratePlan._id} to ${status} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { ratePlan },
        message: `Rate plan status updated to ${status}`
      });

    } catch (error) {
      logger.error('Error toggling rate plan status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLAN_STATUS_ERROR'
      });
    }
  }

  /**
   * Calculate rate for specific dates and conditions
   */
  static async calculateRate(req: Request, res: Response): Promise<void> {
    try {
      const query = rateCalculationSchema.parse(req.query);
      const { property, room, checkIn, checkOut, guests, advanceBookingDays } = query;

      // Validate property and room exist
      const propertyDoc = await Property.findById(property);
      if (!propertyDoc) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const roomDoc = propertyDoc.rooms.find((r: any) => r._id.toString() === room);
      if (!roomDoc) {
        res.status(404).json({
          success: false,
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

      // Get active rate plans for the room
      const ratePlans = await RatePlan.find({
        property,
        room,
        status: RatePlanStatus.ACTIVE,
        validFrom: { $lte: new Date(checkOut) },
        validTo: { $gte: new Date(checkIn) }
      }).sort({ priority: -1 });

      if (ratePlans.length === 0) {
        res.status(404).json({
          success: false,
          message: 'No active rate plans found for the specified dates',
          code: 'NO_RATE_PLANS_FOUND'
        });
        return;
      }

      // Calculate rates for each applicable rate plan
      const rateCalculations = ratePlans.map(ratePlan => {
        const rate = ratePlan.calculateRate(
          new Date(checkIn),
          new Date(checkOut),
          guests?.adults || 1,
          advanceBookingDays
        );

        return {
          ratePlanId: ratePlan._id,
          ratePlanName: ratePlan.name,
          ratePlanType: ratePlan.type,
          baseRate: ratePlan.baseRate,
          calculatedRate: rate,
          currency: ratePlan.currency,
          isRefundable: ratePlan.isRefundable,
          cancellationPolicy: ratePlan.cancellationPolicy,
          minStay: ratePlan.minStay,
          maxStay: ratePlan.maxStay,
          includesBreakfast: ratePlan.includesBreakfast,
          includesTaxes: ratePlan.includesTaxes,
          includesFees: ratePlan.includesFees,
          priority: ratePlan.priority,
          isValid: ratePlan.isValidForDates(new Date(checkIn), new Date(checkOut))
        };
      });

      // Sort by priority and rate
      rateCalculations.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.calculatedRate - b.calculatedRate; // Lower rate first
      });

      // Get the best rate
      const bestRate = rateCalculations.find(calc => calc.isValid);

      res.status(200).json({
        success: true,
        data: {
          bestRate,
          allRates: rateCalculations,
          searchCriteria: {
            property,
            room,
            checkIn,
            checkOut,
            guests,
            advanceBookingDays
          }
        },
        message: 'Rate calculation completed successfully'
      });

    } catch (error) {
      logger.error('Error calculating rate:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid rate calculation parameters',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_CALCULATION_ERROR'
      });
    }
  }

  /**
   * Get rate plans by property
   */
  static async getRatePlansByProperty(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;
      const { active } = req.query;

      const filter: any = { property: propertyId };

      if (active === 'true') {
        const now = new Date();
        filter.status = RatePlanStatus.ACTIVE;
        filter.validFrom = { $lte: now };
        filter.validTo = { $gte: now };
      }

      const ratePlans = await RatePlan.find(filter)
        .populate('room', 'name type baseRate')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .sort({ priority: -1, createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { ratePlans },
        message: 'Rate plans retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting rate plans by property:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLANS_PROPERTY_ERROR'
      });
    }
  }

  /**
   * Get rate plans by room
   */
  static async getRatePlansByRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const { active } = req.query;

      const filter: any = { room: roomId };

      if (active === 'true') {
        const now = new Date();
        filter.status = RatePlanStatus.ACTIVE;
        filter.validFrom = { $lte: now };
        filter.validTo = { $gte: now };
      }

      const ratePlans = await RatePlan.find(filter)
        .populate('property', 'name address.city address.country')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .sort({ priority: -1, createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { ratePlans },
        message: 'Rate plans retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting rate plans by room:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'RATE_PLANS_ROOM_ERROR'
      });
    }
  }
}

export default RatePlanController;
