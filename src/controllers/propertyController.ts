import { Request, Response } from 'express';
import Property, { PropertyStatus } from '../models/Property';
import { logger } from '../config/logger';
import { z } from 'zod';

// Query validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10'),
  search: z.string().optional(),
  propertyType: z.string().optional(),
  status: z.nativeEnum(PropertyStatus).optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  owner: z.string().optional(),
  manager: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'propertyType']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Location query schema
const locationQuerySchema = z.object({
  latitude: z.string().transform(val => parseFloat(val)).pipe(z.number().min(-90).max(90)),
  longitude: z.string().transform(val => parseFloat(val)).pipe(z.number().min(-180).max(180)),
  radius: z.string().transform(val => parseFloat(val)).pipe(z.number().min(0.1).max(1000)).default('10'),
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10')
});

/**
 * Property Controller
 * Handles all property-related operations
 */
export class PropertyController {
  /**
   * Get all properties with filtering, pagination, and search
   */
  static async getAllProperties(req: Request, res: Response): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, search, propertyType, status, city, country, owner, manager, sortBy, sortOrder } = query;

      // Build filter object
      const filter: any = {};

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } },
          { 'address.country': { $regex: search, $options: 'i' } }
        ];
      }

      if (propertyType) filter.propertyType = propertyType;
      if (status) filter.status = status;
      if (city) filter['address.city'] = { $regex: city, $options: 'i' };
      if (country) filter['address.country'] = { $regex: country, $options: 'i' };
      if (owner) filter.owner = owner;
      if (manager) filter.manager = manager;

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [properties, total] = await Promise.all([
        Property.find(filter)
          .populate('owner', 'email profile.firstName profile.lastName')
          .populate('manager', 'email profile.firstName profile.lastName')
          .select('-rooms.amenities') // Exclude room amenities for list view
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Property.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          properties,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          }
        },
        message: 'Properties retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting properties:', error);
      
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
        code: 'PROPERTIES_FETCH_ERROR'
      });
    }
  }

  /**
   * Get properties by location
   */
  static async getPropertiesByLocation(req: Request, res: Response): Promise<void> {
    try {
      const query = locationQuerySchema.parse(req.query);
      const { latitude, longitude, radius, page, limit } = query;

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Execute geospatial query
      const [properties, total] = await Promise.all([
        Property.find({
          'address.coordinates': {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
              },
              $maxDistance: radius * 1000 // Convert km to meters
            }
          },
          status: PropertyStatus.ACTIVE
        })
          .populate('owner', 'email profile.firstName profile.lastName')
          .populate('manager', 'email profile.firstName profile.lastName')
          .select('-rooms.amenities')
          .skip(skip)
          .limit(limit)
          .lean(),
        Property.countDocuments({
          'address.coordinates': {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
              },
              $maxDistance: radius * 1000
            }
          },
          status: PropertyStatus.ACTIVE
        })
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          properties,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          },
          location: {
            latitude,
            longitude,
            radius
          }
        },
        message: 'Properties retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting properties by location:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid location parameters',
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
        code: 'PROPERTIES_LOCATION_ERROR'
      });
    }
  }

  /**
   * Get single property by ID
   */
  static async getPropertyById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const property = await Property.findById(id)
        .populate('owner', 'email profile.firstName profile.lastName profile.phone')
        .populate('manager', 'email profile.firstName profile.lastName profile.phone')
        .lean();

      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { property },
        message: 'Property retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting property by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'PROPERTY_FETCH_ERROR'
      });
    }
  }

  /**
   * Create new property
   */
  static async createProperty(req: Request, res: Response): Promise<void> {
    try {
      const propertyData = req.body;
      const userId = req.user?.id;

      // Add created by user
      propertyData.createdBy = userId;

      const property = new Property(propertyData);
      await property.save();

      // Populate the created property
      await property.populate([
        { path: 'owner', select: 'email profile.firstName profile.lastName' },
        { path: 'manager', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Property created: ${property._id} by user: ${userId}`);

      res.status(201).json({
        success: true,
        data: { property },
        message: 'Property created successfully'
      });

    } catch (error) {
      logger.error('Error creating property:', error);

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
        code: 'PROPERTY_CREATE_ERROR'
      });
    }
  }

  /**
   * Update property
   */
  static async updateProperty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      // Add last modified by user
      updateData.lastModifiedBy = userId;

      const property = await Property.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate([
        { path: 'owner', select: 'email profile.firstName profile.lastName' },
        { path: 'manager', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      logger.info(`Property updated: ${property._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { property },
        message: 'Property updated successfully'
      });

    } catch (error) {
      logger.error('Error updating property:', error);

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
        code: 'PROPERTY_UPDATE_ERROR'
      });
    }
  }

  /**
   * Delete property
   */
  static async deleteProperty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const property = await Property.findByIdAndDelete(id);

      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      logger.info(`Property deleted: ${property._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Property deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting property:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'PROPERTY_DELETE_ERROR'
      });
    }
  }

  /**
   * Toggle property status
   */
  static async togglePropertyStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      if (!Object.values(PropertyStatus).includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status value',
          code: 'INVALID_STATUS'
        });
        return;
      }

      const property = await Property.findByIdAndUpdate(
        id,
        { status, lastModifiedBy: userId },
        { new: true, runValidators: true }
      ).populate([
        { path: 'owner', select: 'email profile.firstName profile.lastName' },
        { path: 'manager', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      logger.info(`Property status updated: ${property._id} to ${status} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { property },
        message: `Property status updated to ${status}`
      });

    } catch (error) {
      logger.error('Error toggling property status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'PROPERTY_STATUS_ERROR'
      });
    }
  }

  /**
   * Get property statistics
   */
  static async getPropertyStats(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const property = await Property.findById(id);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      // Get statistics (this would typically involve aggregating from other collections)
      const stats = {
        totalRooms: property.rooms.length,
        activeRooms: property.rooms.filter(room => room.isActive).length,
        totalBookings: 0, // Would be calculated from Booking collection
        totalRevenue: 0, // Would be calculated from Booking collection
        averageRating: 0, // Would be calculated from reviews
        occupancyRate: 0 // Would be calculated from calendar data
      };

      res.status(200).json({
        success: true,
        data: { stats },
        message: 'Property statistics retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting property stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'PROPERTY_STATS_ERROR'
      });
    }
  }

  /**
   * Search properties
   */
  static async searchProperties(req: Request, res: Response): Promise<void> {
    try {
      const { q, type, location, amenities, priceRange } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      // Build search filter
      const filter: any = { status: PropertyStatus.ACTIVE };

      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { 'address.city': { $regex: q, $options: 'i' } },
          { 'address.country': { $regex: q, $options: 'i' } }
        ];
      }

      if (type) filter.propertyType = type;
      if (location) {
        filter.$or = [
          { 'address.city': { $regex: location, $options: 'i' } },
          { 'address.country': { $regex: location, $options: 'i' } }
        ];
      }

      if (amenities) {
        const amenityArray = Array.isArray(amenities) ? amenities : [amenities];
        filter.amenities = { $in: amenityArray };
      }

      if (priceRange) {
        const [min, max] = (priceRange as string).split('-').map(Number);
        filter['rooms.baseRate'] = { $gte: min, $lte: max };
      }

      const [properties, total] = await Promise.all([
        Property.find(filter)
          .populate('owner', 'email profile.firstName profile.lastName')
          .populate('manager', 'email profile.firstName profile.lastName')
          .select('-rooms.amenities')
          .skip(skip)
          .limit(limit)
          .lean(),
        Property.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        data: {
          properties,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit
          }
        },
        message: 'Properties search completed successfully'
      });

    } catch (error) {
      logger.error('Error searching properties:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'PROPERTIES_SEARCH_ERROR'
      });
    }
  }
}

export default PropertyController;


