import { Request, Response } from 'express';
import Channel, { ChannelType, ChannelStatus, SyncStatus } from '../models/Channel';
import Property from '../models/Property';
import { logger } from '../config/logger';
import { z } from 'zod';

// Query validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1)).default('1'),
  limit: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(100)).default('10'),
  type: z.nativeEnum(ChannelType).optional(),
  status: z.nativeEnum(ChannelStatus).optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  sortBy: z.enum(['name', 'type', 'status', 'createdAt', 'lastSync']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

/**
 * Channel Controller
 * Handles all channel-related operations
 */
export class ChannelController {
  /**
   * Get all channels with filtering and pagination
   */
  static async getAllChannels(req: Request, res: Response): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, type, status, isActive, sortBy, sortOrder } = query;

      // Build filter object
      const filter: any = {};

      if (type) filter.type = type;
      if (status) filter.status = status;
      if (isActive !== undefined) filter.isActive = isActive;

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [channels, total] = await Promise.all([
        Channel.find(filter)
          .populate('properties', 'name address.city address.country')
          .populate('createdBy', 'email profile.firstName profile.lastName')
          .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Channel.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          channels,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            hasPrevPage
          }
        },
        message: 'Channels retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting channels:', error);
      
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
        code: 'CHANNELS_FETCH_ERROR'
      });
    }
  }

  /**
   * Get single channel by ID
   */
  static async getChannelById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const channel = await Channel.findById(id)
        .populate('properties', 'name address contactInfo')
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .populate('lastModifiedBy', 'email profile.firstName profile.lastName')
        .lean();

      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { channel },
        message: 'Channel retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting channel by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_FETCH_ERROR'
      });
    }
  }

  /**
   * Create new channel
   */
  static async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const channelData = req.body;
      const userId = req.user?.id;

      // Validate properties exist
      if (channelData.properties && channelData.properties.length > 0) {
        const properties = await Property.find({ _id: { $in: channelData.properties } });
        if (properties.length !== channelData.properties.length) {
          res.status(404).json({
            success: false,
            message: 'One or more properties not found',
            code: 'PROPERTIES_NOT_FOUND'
          });
          return;
        }
      }

      // Add created by user
      channelData.createdBy = userId;

      const channel = new Channel(channelData);
      await channel.save();

      // Populate the created channel
      await channel.populate([
        { path: 'properties', select: 'name address.city address.country' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Channel created: ${channel._id} by user: ${userId}`);

      res.status(201).json({
        success: true,
        data: { channel },
        message: 'Channel created successfully'
      });

    } catch (error) {
      logger.error('Error creating channel:', error);

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
        code: 'CHANNEL_CREATE_ERROR'
      });
    }
  }

  /**
   * Update channel
   */
  static async updateChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user?.id;

      // Validate properties exist if provided
      if (updateData.properties && updateData.properties.length > 0) {
        const properties = await Property.find({ _id: { $in: updateData.properties } });
        if (properties.length !== updateData.properties.length) {
          res.status(404).json({
            success: false,
            message: 'One or more properties not found',
            code: 'PROPERTIES_NOT_FOUND'
          });
          return;
        }
      }

      // Add last modified by user
      updateData.lastModifiedBy = userId;

      const channel = await Channel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate([
        { path: 'properties', select: 'name address.city address.country' },
        { path: 'createdBy', select: 'email profile.firstName profile.lastName' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      logger.info(`Channel updated: ${channel._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { channel },
        message: 'Channel updated successfully'
      });

    } catch (error) {
      logger.error('Error updating channel:', error);

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
        code: 'CHANNEL_UPDATE_ERROR'
      });
    }
  }

  /**
   * Delete channel
   */
  static async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const channel = await Channel.findByIdAndDelete(id);

      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      logger.info(`Channel deleted: ${channel._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Channel deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting channel:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_DELETE_ERROR'
      });
    }
  }

  /**
   * Toggle channel status
   */
  static async toggleChannelStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      if (!Object.values(ChannelStatus).includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status value',
          code: 'INVALID_STATUS'
        });
        return;
      }

      const channel = await Channel.findByIdAndUpdate(
        id,
        { status, lastModifiedBy: userId },
        { new: true, runValidators: true }
      ).populate([
        { path: 'properties', select: 'name address.city address.country' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      logger.info(`Channel status updated: ${channel._id} to ${status} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { channel },
        message: `Channel status updated to ${status}`
      });

    } catch (error) {
      logger.error('Error toggling channel status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_STATUS_ERROR'
      });
    }
  }

  /**
   * Test channel connection
   */
  static async testChannelConnection(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const channel = await Channel.findById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      // Simulate connection test
      // In a real implementation, this would make actual API calls to the channel
      const connectionTest = {
        channelId: channel._id,
        channelName: channel.name,
        channelType: channel.type,
        isConnected: true,
        responseTime: Math.floor(Math.random() * 1000) + 100, // Simulate response time
        lastTested: new Date(),
        status: 'success',
        message: 'Connection test successful'
      };

      // Update channel sync status
      await channel.updateSyncStatus(SyncStatus.SUCCESS, 'Connection test successful');

      logger.info(`Channel connection tested: ${channel._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { connectionTest },
        message: 'Channel connection test completed successfully'
      });

    } catch (error) {
      logger.error('Error testing channel connection:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_CONNECTION_TEST_ERROR'
      });
    }
  }

  /**
   * Sync channel data
   */
  static async syncChannelData(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { syncType } = req.body; // 'bookings', 'rates', 'availability', 'propertyInfo', 'all'
      const userId = req.user?.id;

      const channel = await Channel.findById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      if (!channel.isConnected()) {
        res.status(400).json({
          success: false,
          message: 'Channel is not connected',
          code: 'CHANNEL_NOT_CONNECTED'
        });
        return;
      }

      // Simulate sync process
      // In a real implementation, this would sync with the actual channel API
      const syncResults = {
        channelId: channel._id,
        channelName: channel.name,
        syncType: syncType || 'all',
        startTime: new Date(),
        endTime: new Date(),
        status: 'success',
        results: {
          bookings: { synced: 5, failed: 0 },
          rates: { synced: 12, failed: 0 },
          availability: { synced: 30, failed: 0 },
          propertyInfo: { synced: 1, failed: 0 }
        },
        message: 'Channel sync completed successfully'
      };

      // Update channel sync status
      await channel.updateSyncStatus(SyncStatus.SUCCESS, 'Sync completed successfully');

      logger.info(`Channel data synced: ${channel._id} (${syncType}) by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { syncResults },
        message: 'Channel data sync completed successfully'
      });

    } catch (error) {
      logger.error('Error syncing channel data:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_SYNC_ERROR'
      });
    }
  }

  /**
   * Add property to channel
   */
  static async addPropertyToChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { propertyId } = req.body;
      const userId = req.user?.id;

      const channel = await Channel.findById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
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

      await channel.addProperty(propertyId);

      // Populate the updated channel
      await channel.populate([
        { path: 'properties', select: 'name address.city address.country' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Property added to channel: ${propertyId} to channel ${channel._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { channel },
        message: 'Property added to channel successfully'
      });

    } catch (error) {
      logger.error('Error adding property to channel:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_ADD_PROPERTY_ERROR'
      });
    }
  }

  /**
   * Remove property from channel
   */
  static async removePropertyFromChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { propertyId } = req.body;
      const userId = req.user?.id;

      const channel = await Channel.findById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      await channel.removeProperty(propertyId);

      // Populate the updated channel
      await channel.populate([
        { path: 'properties', select: 'name address.city address.country' },
        { path: 'lastModifiedBy', select: 'email profile.firstName profile.lastName' }
      ]);

      logger.info(`Property removed from channel: ${propertyId} from channel ${channel._id} by user: ${userId}`);

      res.status(200).json({
        success: true,
        data: { channel },
        message: 'Property removed from channel successfully'
      });

    } catch (error) {
      logger.error('Error removing property from channel:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_REMOVE_PROPERTY_ERROR'
      });
    }
  }

  /**
   * Get channel performance metrics
   */
  static async getChannelPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { /*startDate, endDate*/ } = req.query;

      const channel = await Channel.findById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          message: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND'
        });
        return;
      }

      // Get performance metrics
      const performance = {
        channelId: channel._id,
        channelName: channel.name,
        channelType: channel.type,
        totalBookings: channel.performance.totalBookings,
        totalRevenue: channel.performance.totalRevenue,
        averageRating: channel.performance.averageRating,
        responseTime: channel.performance.responseTime,
        successRate: channel.performance.successRate,
        lastUpdated: channel.performance.lastUpdated,
        monthlyStats: channel.performance.monthlyStats || []
      };

      res.status(200).json({
        success: true,
        data: { performance },
        message: 'Channel performance metrics retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting channel performance:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNEL_PERFORMANCE_ERROR'
      });
    }
  }

  /**
   * Get channels by property
   */
  static async getChannelsByProperty(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;

      const property = await Property.findById(propertyId);
      if (!property) {
        res.status(404).json({
          success: false,
          message: 'Property not found',
          code: 'PROPERTY_NOT_FOUND'
        });
        return;
      }

      const channels = await Channel.find({ properties: propertyId })
        .populate('createdBy', 'email profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        data: { channels },
        message: 'Channels retrieved successfully'
      });

    } catch (error) {
      logger.error('Error getting channels by property:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'CHANNELS_PROPERTY_ERROR'
      });
    }
  }
}

export default ChannelController;


