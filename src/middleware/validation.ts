import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';

/**
 * Validation middleware for all models
 */
export class ValidationMiddleware {
  /**
   * Property validation schemas
   */
  static propertySchemas = {
    create: z.object({
      name: z.string()
        .min(1, 'Property name is required')
        .max(200, 'Property name cannot exceed 200 characters')
        .trim(),
      description: z.string()
        .min(1, 'Property description is required')
        .max(2000, 'Property description cannot exceed 2000 characters')
        .trim(),
      propertyType: z.enum(['hotel', 'apartment', 'house', 'villa', 'hostel', 'resort', 'bed_and_breakfast', 'guesthouse']),
      address: z.object({
        street: z.string()
          .min(1, 'Street address is required')
          .max(200, 'Street address cannot exceed 200 characters')
          .trim(),
        city: z.string()
          .min(1, 'City is required')
          .max(100, 'City name cannot exceed 100 characters')
          .trim(),
        state: z.string()
          .min(1, 'State is required')
          .max(100, 'State name cannot exceed 100 characters')
          .trim(),
        country: z.string()
          .min(1, 'Country is required')
          .max(100, 'Country name cannot exceed 100 characters')
          .trim(),
        postalCode: z.string()
          .min(1, 'Postal code is required')
          .max(20, 'Postal code cannot exceed 20 characters')
          .trim(),
        coordinates: z.object({
          latitude: z.number()
            .min(-90, 'Latitude must be between -90 and 90')
            .max(90, 'Latitude must be between -90 and 90'),
          longitude: z.number()
            .min(-180, 'Longitude must be between -180 and 180')
            .max(180, 'Longitude must be between -180 and 180')
        }),
        timezone: z.string().trim().optional(),
        neighborhood: z.string().max(100, 'Neighborhood name cannot exceed 100 characters').trim().optional(),
        landmark: z.string().max(200, 'Landmark description cannot exceed 200 characters').trim().optional()
      }),
      rooms: z.array(z.object({
        name: z.string()
          .min(1, 'Room name is required')
          .max(100, 'Room name cannot exceed 100 characters')
          .trim(),
        type: z.enum(['single', 'double', 'twin', 'suite', 'family', 'deluxe', 'executive', 'presidential']),
        capacity: z.object({
          adults: z.number()
            .min(1, 'Adult capacity must be at least 1')
            .max(20, 'Adult capacity cannot exceed 20'),
          children: z.number()
            .min(0, 'Children capacity cannot be negative')
            .max(10, 'Children capacity cannot exceed 10')
            .default(0),
          infants: z.number()
            .min(0, 'Infant capacity cannot be negative')
            .max(5, 'Infant capacity cannot exceed 5')
            .default(0)
        }),
        amenities: z.array(z.string().trim()),
        photos: z.array(z.string().trim()),
        baseRate: z.number()
          .min(0, 'Base rate cannot be negative'),
        currency: z.string()
          .length(3, 'Currency must be 3 characters')
          .transform(val => val.toUpperCase())
          .default('USD'),
        isActive: z.boolean().default(true),
        description: z.string().max(500, 'Room description cannot exceed 500 characters').trim().optional(),
        size: z.number().min(1, 'Room size must be at least 1 square meter').optional(),
        floor: z.number().min(0, 'Floor cannot be negative').optional(),
        view: z.string().trim().optional(),
        bedType: z.string().trim().optional(),
        smokingAllowed: z.boolean().default(false),
        petFriendly: z.boolean().default(false)
      })).min(1, 'At least one room is required'),
      amenities: z.array(z.string().trim()),
      photos: z.array(z.string().trim()),
      status: z.enum(['active', 'inactive', 'maintenance', 'suspended']).default('active'),
      owner: z.string().min(1, 'Property owner is required'),
      manager: z.string().min(1, 'Property manager is required'),
      contactInfo: z.object({
        phone: z.string()
          .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number')
          .trim(),
        email: z.string()
          .email('Please provide a valid email address')
          .trim()
          .toLowerCase(),
        website: z.string()
          .regex(/^https?:\/\/.+/, 'Please provide a valid website URL')
          .trim()
          .optional()
      }),
      policies: z.object({
        checkInTime: z.string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)')
          .default('15:00'),
        checkOutTime: z.string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)')
          .default('11:00'),
        cancellationPolicy: z.string()
          .min(1, 'Cancellation policy is required')
          .max(1000, 'Cancellation policy cannot exceed 1000 characters')
          .trim(),
        houseRules: z.array(z.string().max(200, 'House rule cannot exceed 200 characters').trim()),
        petPolicy: z.string().max(500, 'Pet policy cannot exceed 500 characters').trim().optional(),
        smokingPolicy: z.string().max(500, 'Smoking policy cannot exceed 500 characters').trim().optional()
      }),
      settings: z.object({
        currency: z.string()
          .length(3, 'Currency must be 3 characters')
          .transform(val => val.toUpperCase())
          .default('USD'),
        timezone: z.string().trim().default('UTC'),
        language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt']).default('en'),
        autoConfirmBookings: z.boolean().default(false),
        requireGuestVerification: z.boolean().default(true)
      })
    }),

    update: z.object({
      name: z.string().max(200, 'Property name cannot exceed 200 characters').trim().optional(),
      description: z.string().max(2000, 'Property description cannot exceed 2000 characters').trim().optional(),
      propertyType: z.enum(['hotel', 'apartment', 'house', 'villa', 'hostel', 'resort', 'bed_and_breakfast', 'guesthouse']).optional(),
      status: z.enum(['active', 'inactive', 'maintenance', 'suspended']).optional(),
      amenities: z.array(z.string().trim()).optional(),
      photos: z.array(z.string().trim()).optional(),
      contactInfo: z.object({
        phone: z.string()
          .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number')
          .trim()
          .optional(),
        email: z.string()
          .email('Please provide a valid email address')
          .trim()
          .toLowerCase()
          .optional(),
        website: z.string()
          .regex(/^https?:\/\/.+/, 'Please provide a valid website URL')
          .trim()
          .optional()
      }).optional(),
      policies: z.object({
        checkInTime: z.string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)')
          .optional(),
        checkOutTime: z.string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)')
          .optional(),
        cancellationPolicy: z.string().max(1000, 'Cancellation policy cannot exceed 1000 characters').trim().optional(),
        houseRules: z.array(z.string().max(200, 'House rule cannot exceed 200 characters').trim()).optional(),
        petPolicy: z.string().max(500, 'Pet policy cannot exceed 500 characters').trim().optional(),
        smokingPolicy: z.string().max(500, 'Smoking policy cannot exceed 500 characters').trim().optional()
      }).optional(),
      settings: z.object({
        currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).optional(),
        timezone: z.string().trim().optional(),
        language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt']).optional(),
        autoConfirmBookings: z.boolean().optional(),
        requireGuestVerification: z.boolean().optional()
      }).optional()
    })
  };

  /**
   * Booking validation schemas
   */
  static bookingSchemas = {
    create: z.object({
      property: z.string().min(1, 'Property ID is required'),
      room: z.string().min(1, 'Room ID is required'),
      guestInfo: z.object({
        firstName: z.string()
          .min(1, 'Guest first name is required')
          .max(50, 'First name cannot exceed 50 characters')
          .trim(),
        lastName: z.string()
          .min(1, 'Guest last name is required')
          .max(50, 'Last name cannot exceed 50 characters')
          .trim(),
        email: z.string()
          .email('Please provide a valid email address')
          .trim()
          .toLowerCase(),
        phone: z.string()
          .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number')
          .trim(),
        nationality: z.string()
          .min(1, 'Guest nationality is required')
          .max(100, 'Nationality cannot exceed 100 characters')
          .trim(),
        documentType: z.enum(['passport', 'id_card', 'driver_license', 'other']),
        documentNumber: z.string()
          .min(1, 'Document number is required')
          .max(50, 'Document number cannot exceed 50 characters')
          .trim(),
        dateOfBirth: z.string().datetime().optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
        address: z.object({
          street: z.string().max(200, 'Street address cannot exceed 200 characters').trim().optional(),
          city: z.string().max(100, 'City name cannot exceed 100 characters').trim().optional(),
          state: z.string().max(100, 'State name cannot exceed 100 characters').trim().optional(),
          country: z.string().max(100, 'Country name cannot exceed 100 characters').trim().optional(),
          postalCode: z.string().max(20, 'Postal code cannot exceed 20 characters').trim().optional()
        }).optional()
      }),
      checkIn: z.string().datetime('Invalid check-in date format'),
      checkOut: z.string().datetime('Invalid check-out date format'),
      guests: z.object({
        adults: z.number()
          .min(1, 'At least one adult is required')
          .max(20, 'Cannot exceed 20 adults'),
        children: z.number()
          .min(0, 'Children count cannot be negative')
          .max(10, 'Cannot exceed 10 children')
          .default(0),
        infants: z.number()
          .min(0, 'Infants count cannot be negative')
          .max(5, 'Cannot exceed 5 infants')
          .default(0)
      }),
      status: z.enum(['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show', 'modified']).default('pending'),
      channel: z.enum(['airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct', 'other']),
      channelBookingId: z.string().trim().optional(),
      channelConfirmationCode: z.string().trim().optional(),
      pricing: z.object({
        baseRate: z.number().min(0, 'Base rate cannot be negative'),
        taxes: z.number().min(0, 'Taxes cannot be negative').default(0),
        fees: z.number().min(0, 'Fees cannot be negative').default(0),
        discounts: z.number().min(0, 'Discounts cannot be negative').default(0),
        total: z.number().min(0, 'Total amount cannot be negative'),
        currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).default('USD')
      }),
      notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').trim().optional(),
      specialRequests: z.array(z.string().max(200, 'Special request cannot exceed 200 characters').trim()).default([])
    }),

    update: z.object({
      guestInfo: z.object({
        firstName: z.string().max(50, 'First name cannot exceed 50 characters').trim().optional(),
        lastName: z.string().max(50, 'Last name cannot exceed 50 characters').trim().optional(),
        email: z.string().email('Please provide a valid email address').trim().toLowerCase().optional(),
        phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number').trim().optional(),
        nationality: z.string().max(100, 'Nationality cannot exceed 100 characters').trim().optional(),
        documentType: z.enum(['passport', 'id_card', 'driver_license', 'other']).optional(),
        documentNumber: z.string().max(50, 'Document number cannot exceed 50 characters').trim().optional()
      }).optional(),
      checkIn: z.string().datetime('Invalid check-in date format').optional(),
      checkOut: z.string().datetime('Invalid check-out date format').optional(),
      guests: z.object({
        adults: z.number().min(1, 'At least one adult is required').max(20, 'Cannot exceed 20 adults').optional(),
        children: z.number().min(0, 'Children count cannot be negative').max(10, 'Cannot exceed 10 children').optional(),
        infants: z.number().min(0, 'Infants count cannot be negative').max(5, 'Cannot exceed 5 infants').optional()
      }).optional(),
      status: z.enum(['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show', 'modified']).optional(),
      pricing: z.object({
        baseRate: z.number().min(0, 'Base rate cannot be negative').optional(),
        taxes: z.number().min(0, 'Taxes cannot be negative').optional(),
        fees: z.number().min(0, 'Fees cannot be negative').optional(),
        discounts: z.number().min(0, 'Discounts cannot be negative').optional(),
        total: z.number().min(0, 'Total amount cannot be negative').optional()
      }).optional(),
      notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').trim().optional(),
      specialRequests: z.array(z.string().max(200, 'Special request cannot exceed 200 characters').trim()).optional()
    })
  };

  /**
   * RatePlan validation schemas
   */
  static ratePlanSchemas = {
    create: z.object({
      property: z.string().min(1, 'Property ID is required'),
      room: z.string().min(1, 'Room ID is required'),
      name: z.string()
        .min(1, 'Rate plan name is required')
        .max(100, 'Rate plan name cannot exceed 100 characters')
        .trim(),
      description: z.string()
        .min(1, 'Rate plan description is required')
        .max(500, 'Description cannot exceed 500 characters')
        .trim(),
      type: z.enum(['standard', 'seasonal', 'promotional', 'corporate', 'group', 'last_minute', 'advance_purchase']),
      baseRate: z.number().min(0, 'Base rate cannot be negative'),
      currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).default('USD'),
      isRefundable: z.boolean().default(true),
      cancellationPolicy: z.enum(['free_cancellation', 'non_refundable', 'partial_refund', 'custom']).default('free_cancellation'),
      customCancellationPolicy: z.string().max(1000, 'Custom cancellation policy cannot exceed 1000 characters').trim().optional(),
      minStay: z.number().min(1, 'Minimum stay must be at least 1 night').default(1),
      maxStay: z.number().min(1, 'Maximum stay must be at least 1 night').optional(),
      includesBreakfast: z.boolean().default(false),
      includesTaxes: z.boolean().default(false),
      includesFees: z.boolean().default(false),
      validFrom: z.string().datetime('Invalid valid from date format'),
      validTo: z.string().datetime('Invalid valid to date format'),
      status: z.enum(['active', 'inactive', 'expired', 'suspended']).default('active'),
      priority: z.number().min(0, 'Priority cannot be negative').default(0)
    }),

    update: z.object({
      name: z.string().max(100, 'Rate plan name cannot exceed 100 characters').trim().optional(),
      description: z.string().max(500, 'Description cannot exceed 500 characters').trim().optional(),
      type: z.enum(['standard', 'seasonal', 'promotional', 'corporate', 'group', 'last_minute', 'advance_purchase']).optional(),
      baseRate: z.number().min(0, 'Base rate cannot be negative').optional(),
      isRefundable: z.boolean().optional(),
      cancellationPolicy: z.enum(['free_cancellation', 'non_refundable', 'partial_refund', 'custom']).optional(),
      customCancellationPolicy: z.string().max(1000, 'Custom cancellation policy cannot exceed 1000 characters').trim().optional(),
      minStay: z.number().min(1, 'Minimum stay must be at least 1 night').optional(),
      maxStay: z.number().min(1, 'Maximum stay must be at least 1 night').optional(),
      includesBreakfast: z.boolean().optional(),
      includesTaxes: z.boolean().optional(),
      includesFees: z.boolean().optional(),
      validFrom: z.string().datetime('Invalid valid from date format').optional(),
      validTo: z.string().datetime('Invalid valid to date format').optional(),
      status: z.enum(['active', 'inactive', 'expired', 'suspended']).optional(),
      priority: z.number().min(0, 'Priority cannot be negative').optional()
    })
  };

  /**
   * Calendar validation schemas
   */
  static calendarSchemas = {
    bulkUpdate: z.object({
      propertyId: z.string().min(1, 'Property ID is required'),
      roomId: z.string().min(1, 'Room ID is required'),
      dates: z.array(z.string().datetime('Invalid date format')).min(1, 'At least one date is required'),
      status: z.enum(['available', 'blocked', 'booked', 'maintenance', 'out_of_order']),
      rate: z.number().min(0, 'Rate cannot be negative').optional(),
      currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).optional(),
      minStay: z.number().min(1, 'Minimum stay must be at least 1 night').optional(),
      maxStay: z.number().min(1, 'Maximum stay must be at least 1 night').optional(),
      blockReason: z.enum(['maintenance', 'renovation', 'owner_use', 'seasonal_closure', 'emergency', 'other']).optional(),
      blockDescription: z.string().max(500, 'Block description cannot exceed 500 characters').trim().optional(),
      channel: z.enum(['all', 'airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct']).default('all')
    }),

    availability: z.object({
      propertyId: z.string().min(1, 'Property ID is required'),
      roomId: z.string().min(1, 'Room ID is required'),
      startDate: z.string().datetime('Invalid start date format'),
      endDate: z.string().datetime('Invalid end date format'),
      guests: z.object({
        adults: z.number().min(1, 'At least one adult is required').max(20, 'Cannot exceed 20 adults'),
        children: z.number().min(0, 'Children count cannot be negative').max(10, 'Cannot exceed 10 children').default(0),
        infants: z.number().min(0, 'Infants count cannot be negative').max(5, 'Cannot exceed 5 infants').default(0)
      }).optional()
    })
  };

  /**
   * Channel validation schemas
   */
  static channelSchemas = {
    create: z.object({
      name: z.string()
        .min(1, 'Channel name is required')
        .max(100, 'Channel name cannot exceed 100 characters')
        .trim(),
      type: z.enum(['airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct', 'other']),
      displayName: z.string()
        .min(1, 'Display name is required')
        .max(100, 'Display name cannot exceed 100 characters')
        .trim(),
      description: z.string().max(500, 'Description cannot exceed 500 characters').trim().optional(),
      isActive: z.boolean().default(true),
      apiCredentials: z.object({
        apiKey: z.string().min(1, 'API key is required').trim(),
        apiSecret: z.string().min(1, 'API secret is required').trim(),
        webhookUrl: z.string().regex(/^https?:\/\/.+/, 'Please provide a valid webhook URL').trim().optional(),
        sandboxMode: z.boolean().default(false)
      }),
      syncSettings: z.object({
        autoSync: z.boolean().default(true),
        syncInterval: z.number().min(5, 'Sync interval must be at least 5 minutes').max(1440, 'Sync interval cannot exceed 24 hours').default(60),
        syncDirection: z.enum(['inbound', 'outbound', 'bidirectional']).default('bidirectional'),
        syncTypes: z.object({
          bookings: z.boolean().default(true),
          rates: z.boolean().default(true),
          availability: z.boolean().default(true),
          propertyInfo: z.boolean().default(true)
        }),
        retryAttempts: z.number().min(0, 'Retry attempts cannot be negative').max(10, 'Retry attempts cannot exceed 10').default(3),
        retryDelay: z.number().min(1, 'Retry delay must be at least 1 minute').max(60, 'Retry delay cannot exceed 60 minutes').default(5)
      }),
      properties: z.array(z.string()).default([]),
      settings: z.object({
        currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).default('USD'),
        timezone: z.string().trim().default('UTC'),
        language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt']).default('en'),
        commissionRate: z.number().min(0, 'Commission rate cannot be negative').max(100, 'Commission rate cannot exceed 100%').optional()
      })
    }),

    update: z.object({
      name: z.string().max(100, 'Channel name cannot exceed 100 characters').trim().optional(),
      displayName: z.string().max(100, 'Display name cannot exceed 100 characters').trim().optional(),
      description: z.string().max(500, 'Description cannot exceed 500 characters').trim().optional(),
      isActive: z.boolean().optional(),
      apiCredentials: z.object({
        apiKey: z.string().trim().optional(),
        apiSecret: z.string().trim().optional(),
        webhookUrl: z.string().regex(/^https?:\/\/.+/, 'Please provide a valid webhook URL').trim().optional(),
        sandboxMode: z.boolean().optional()
      }).optional(),
      syncSettings: z.object({
        autoSync: z.boolean().optional(),
        syncInterval: z.number().min(5, 'Sync interval must be at least 5 minutes').max(1440, 'Sync interval cannot exceed 24 hours').optional(),
        syncDirection: z.enum(['inbound', 'outbound', 'bidirectional']).optional(),
        retryAttempts: z.number().min(0, 'Retry attempts cannot be negative').max(10, 'Retry attempts cannot exceed 10').optional(),
        retryDelay: z.number().min(1, 'Retry delay must be at least 1 minute').max(60, 'Retry delay cannot exceed 60 minutes').optional()
      }).optional(),
      properties: z.array(z.string()).optional(),
      settings: z.object({
        currency: z.string().length(3, 'Currency must be 3 characters').transform(val => val.toUpperCase()).optional(),
        timezone: z.string().trim().optional(),
        language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt']).optional(),
        commissionRate: z.number().min(0, 'Commission rate cannot be negative').max(100, 'Commission rate cannot exceed 100%').optional()
      }).optional()
    })
  };

  /**
   * Generic validation middleware
   */
  static validate(schema: z.ZodSchema, property: 'body' | 'query' | 'params' = 'body') {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const data = req[property];
        const validatedData = schema.parse(data);
        
        // Replace the original data with validated data
        req[property] = validatedData;
        
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors = error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }));

          logger.warn(`Validation failed for ${property}:`, errors);

          res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors,
            code: 'VALIDATION_ERROR'
          });
          return;
        }

        logger.error('Validation middleware error:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error during validation',
          code: 'VALIDATION_INTERNAL_ERROR'
        });
      }
    };
  }

  /**
   * Property validation middleware
   */
  static validateProperty = {
    create: ValidationMiddleware.validate(ValidationMiddleware.propertySchemas.create),
    update: ValidationMiddleware.validate(ValidationMiddleware.propertySchemas.update)
  };

  /**
   * Booking validation middleware
   */
  static validateBooking = {
    create: ValidationMiddleware.validate(ValidationMiddleware.bookingSchemas.create),
    update: ValidationMiddleware.validate(ValidationMiddleware.bookingSchemas.update)
  };

  /**
   * RatePlan validation middleware
   */
  static validateRatePlan = {
    create: ValidationMiddleware.validate(ValidationMiddleware.ratePlanSchemas.create),
    update: ValidationMiddleware.validate(ValidationMiddleware.ratePlanSchemas.update)
  };

  /**
   * Calendar validation middleware
   */
  static validateCalendar = {
    bulkUpdate: ValidationMiddleware.validate(ValidationMiddleware.calendarSchemas.bulkUpdate),
    availability: ValidationMiddleware.validate(ValidationMiddleware.calendarSchemas.availability)
  };

  /**
   * Channel validation middleware
   */
  static validateChannel = {
    create: ValidationMiddleware.validate(ValidationMiddleware.channelSchemas.create),
    update: ValidationMiddleware.validate(ValidationMiddleware.channelSchemas.update)
  };

  /**
   * Query parameter validation middleware
   */
  static validateQuery(schema: z.ZodSchema) {
    return ValidationMiddleware.validate(schema, 'query');
  }

  /**
   * Params validation middleware
   */
  static validateParams(schema: z.ZodSchema) {
    return ValidationMiddleware.validate(schema, 'params');
  }
}

export default ValidationMiddleware;
