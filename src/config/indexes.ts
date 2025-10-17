import mongoose from 'mongoose';
import { logger } from './logger';

/**
 * Database indexes configuration for optimal performance
 */
export class DatabaseIndexes {
  /**
   * Create all database indexes
   */
  static async createAllIndexes(): Promise<void> {
    try {
      logger.info('Creating database indexes...');

      // User indexes
      try {
        await this.createUserIndexes();
      } catch (error) {
        logger.warn('Failed to create User indexes:', error);
      }
      
      // Property indexes
      try {
        await this.createPropertyIndexes();
      } catch (error) {
        logger.warn('Failed to create Property indexes:', error);
      }
      
      // Booking indexes
      try {
        await this.createBookingIndexes();
      } catch (error) {
        logger.warn('Failed to create Booking indexes:', error);
      }
      
      // RatePlan indexes
      try {
        await this.createRatePlanIndexes();
      } catch (error) {
        logger.warn('Failed to create RatePlan indexes:', error);
      }
      
      // Calendar indexes
      try {
        await this.createCalendarIndexes();
      } catch (error) {
        logger.warn('Failed to create Calendar indexes:', error);
      }
      
      // Channel indexes
      try {
        await this.createChannelIndexes();
      } catch (error) {
        logger.warn('Failed to create Channel indexes:', error);
      }

      logger.info('Database indexes creation completed');
    } catch (error) {
      logger.error('Error creating database indexes:', error);
      logger.warn('Failed to create some indexes, but application can continue');
    }
  }

  /**
   * Create User model indexes
   */
  private static async createUserIndexes(): Promise<void> {
    const userCollection = mongoose.connection.collection('users');
    
    try {
      // Email index (unique)
      await userCollection.createIndex({ email: 1 }, { unique: true });
      
      // Role index
      await userCollection.createIndex({ roles: 1 });
      
      // Active status index
      await userCollection.createIndex({ isActive: 1 });
      
      // Created date index
      await userCollection.createIndex({ createdAt: -1 });
      
      // Compound indexes
      await userCollection.createIndex({ roles: 1, isActive: 1 });
      await userCollection.createIndex({ isActive: 1, createdAt: -1 });
      
      // Text search index
      await userCollection.createIndex({
        email: 'text',
        'profile.firstName': 'text',
        'profile.lastName': 'text'
      });
      
      logger.info('User indexes created successfully');
    } catch (error) {
      logger.error('Error creating User indexes:', error);
      throw error;
    }
  }

  /**
   * Create Property model indexes
   */
  private static async createPropertyIndexes(): Promise<void> {
    const propertyCollection = mongoose.connection.collection('properties');
    
    try {
      // Name index
      await propertyCollection.createIndex({ name: 1 });
      
      // Property type index
      await propertyCollection.createIndex({ propertyType: 1 });
      
      // Status index
      await propertyCollection.createIndex({ status: 1 });
      
      // Owner index
      await propertyCollection.createIndex({ owner: 1 });
      
      // Manager index
      await propertyCollection.createIndex({ manager: 1 });
      
      // Created date index
      await propertyCollection.createIndex({ createdAt: -1 });
      
      // Geospatial index for coordinates
      await propertyCollection.createIndex({ 'address.coordinates': '2dsphere' });
      
      // Compound indexes
      await propertyCollection.createIndex({ propertyType: 1, status: 1 });
      await propertyCollection.createIndex({ owner: 1, status: 1 });
      await propertyCollection.createIndex({ manager: 1, status: 1 });
      await propertyCollection.createIndex({ 'address.city': 1, 'address.country': 1 });
      
      // Text search index - drop existing conflicting index first
      try {
        await propertyCollection.dropIndex('name_text_description_text');
      } catch (error) {
        // Index might not exist, continue
      }
      
      await propertyCollection.createIndex({
        name: 'text',
        description: 'text',
        'address.city': 'text',
        'address.country': 'text'
      });
      
      logger.info('Property indexes created successfully');
    } catch (error) {
      logger.error('Error creating Property indexes:', error);
      throw error;
    }
  }

  /**
   * Create Booking model indexes
   */
  private static async createBookingIndexes(): Promise<void> {
    const bookingCollection = mongoose.connection.collection('bookings');
    
    try {
      // Property index
      await bookingCollection.createIndex({ property: 1 });
      
      // Room index
      await bookingCollection.createIndex({ room: 1 });
      
      // Check-in date index
      await bookingCollection.createIndex({ checkIn: 1 });
      
      // Check-out date index
      await bookingCollection.createIndex({ checkOut: 1 });
      
      // Status index
      await bookingCollection.createIndex({ status: 1 });
      
      // Channel index
      await bookingCollection.createIndex({ channel: 1 });
      
      // Channel booking ID index
      await bookingCollection.createIndex({ channelBookingId: 1 });
      
      // Created by index
      await bookingCollection.createIndex({ createdBy: 1 });
      
      // Created date index
      await bookingCollection.createIndex({ createdAt: -1 });
      
      // Compound indexes
      await bookingCollection.createIndex({ property: 1, checkIn: 1, checkOut: 1 });
      await bookingCollection.createIndex({ room: 1, checkIn: 1, checkOut: 1 });
      await bookingCollection.createIndex({ status: 1, createdAt: -1 });
      await bookingCollection.createIndex({ channel: 1, status: 1 });
      await bookingCollection.createIndex({ checkIn: 1, status: 1 });
      
      // Guest email index
      await bookingCollection.createIndex({ 'guestInfo.email': 1 });
      
      logger.info('Booking indexes created successfully');
    } catch (error) {
      logger.error('Error creating Booking indexes:', error);
      throw error;
    }
  }

  /**
   * Create RatePlan model indexes
   */
  private static async createRatePlanIndexes(): Promise<void> {
    const ratePlanCollection = mongoose.connection.collection('rateplans');
    
    try {
      // Property index
      await ratePlanCollection.createIndex({ property: 1 });
      
      // Room index
      await ratePlanCollection.createIndex({ room: 1 });
      
      // Type index
      await ratePlanCollection.createIndex({ type: 1 });
      
      // Status index
      await ratePlanCollection.createIndex({ status: 1 });
      
      // Valid from date index
      await ratePlanCollection.createIndex({ validFrom: 1 });
      
      // Valid to date index
      await ratePlanCollection.createIndex({ validTo: 1 });
      
      // Priority index
      await ratePlanCollection.createIndex({ priority: -1 });
      
      // Created by index
      await ratePlanCollection.createIndex({ createdBy: 1 });
      
      // Created date index
      await ratePlanCollection.createIndex({ createdAt: -1 });
      
      // Compound indexes
      await ratePlanCollection.createIndex({ property: 1, room: 1, status: 1 });
      await ratePlanCollection.createIndex({ validFrom: 1, validTo: 1, status: 1 });
      await ratePlanCollection.createIndex({ type: 1, status: 1 });
      await ratePlanCollection.createIndex({ priority: -1, status: 1 });
      
      // Text search index
      await ratePlanCollection.createIndex({
        name: 'text',
        description: 'text'
      });
      
      logger.info('RatePlan indexes created successfully');
    } catch (error) {
      logger.error('Error creating RatePlan indexes:', error);
      throw error;
    }
  }

  /**
   * Create Calendar model indexes
   */
  private static async createCalendarIndexes(): Promise<void> {
    const calendarCollection = mongoose.connection.collection('calendars');
    
    try {
      // Property index
      await calendarCollection.createIndex({ property: 1 });
      
      // Room index
      await calendarCollection.createIndex({ room: 1 });
      
      // Date index
      await calendarCollection.createIndex({ date: 1 });
      
      // Status index
      await calendarCollection.createIndex({ status: 1 });
      
      // Channel index
      await calendarCollection.createIndex({ channel: 1 });
      
      // Booking index
      await calendarCollection.createIndex({ booking: 1 });
      
      // Created date index
      await calendarCollection.createIndex({ createdAt: -1 });
      
      // Unique compound index (property, room, date)
      // First, try to drop the existing index if it has issues
      try {
        await calendarCollection.dropIndex('property_1_room_1_date_1');
      } catch (error) {
        // Index might not exist, continue
      }
      
      // Remove duplicates before creating unique index
      const duplicates = await calendarCollection.aggregate([
        {
          $group: {
            _id: { property: '$property', room: '$room', date: '$date' },
            count: { $sum: 1 },
            ids: { $push: '$_id' }
          }
        },
        {
          $match: { count: { $gt: 1 } }
        }
      ]).toArray();
      
      // Remove duplicate entries, keeping only the first one
      for (const dup of duplicates) {
        const idsToRemove = dup.ids.slice(1); // Keep first, remove rest
        await calendarCollection.deleteMany({
          _id: { $in: idsToRemove }
        });
        logger.warn(`Removed ${idsToRemove.length} duplicate calendar entries for property: ${dup._id.property}, room: ${dup._id.room}, date: ${dup._id.date}`);
      }
      
      // Now create the unique index
      await calendarCollection.createIndex(
        { property: 1, room: 1, date: 1 }, 
        { unique: true }
      );
      
      // Compound indexes
      await calendarCollection.createIndex({ property: 1, date: 1, status: 1 });
      await calendarCollection.createIndex({ room: 1, date: 1, status: 1 });
      await calendarCollection.createIndex({ date: 1, status: 1 });
      await calendarCollection.createIndex({ channel: 1, status: 1 });
      
      logger.info('Calendar indexes created successfully');
    } catch (error) {
      logger.error('Error creating Calendar indexes:', error);
      // Don't throw, just log warning and continue
      logger.warn('Failed to create some indexes, but application can continue');
    }
  }

  /**
   * Create Channel model indexes
   */
  private static async createChannelIndexes(): Promise<void> {
    const channelCollection = mongoose.connection.collection('channels');
    
    try {
      // Name index
      await channelCollection.createIndex({ name: 1 });
      
      // Type index
      await channelCollection.createIndex({ type: 1 });
      
      // Status index
      await channelCollection.createIndex({ status: 1 });
      
      // Active status index
      await channelCollection.createIndex({ isActive: 1 });
      
      // Created by index
      await channelCollection.createIndex({ createdBy: 1 });
      
      // Created date index
      await channelCollection.createIndex({ createdAt: -1 });
      
      // Properties array index
      await channelCollection.createIndex({ properties: 1 });
      
      // Compound indexes
      await channelCollection.createIndex({ type: 1, status: 1 });
      await channelCollection.createIndex({ isActive: 1, status: 1 });
      await channelCollection.createIndex({ 'syncSettings.autoSync': 1, 'syncSettings.nextSync': 1 });
      
      // Text search index
      await channelCollection.createIndex({
        name: 'text',
        displayName: 'text',
        description: 'text'
      });
      
      logger.info('Channel indexes created successfully');
    } catch (error) {
      logger.error('Error creating Channel indexes:', error);
      throw error;
    }
  }

  /**
   * Drop all indexes (for development/testing)
   */
  static async dropAllIndexes(): Promise<void> {
    try {
      logger.warn('Dropping all database indexes...');

      const collections = [
        'users',
        'properties',
        'bookings',
        'rateplans',
        'calendars',
        'channels'
      ];

      for (const collectionName of collections) {
        const collection = mongoose.connection.collection(collectionName);
        await collection.dropIndexes();
        logger.info(`Dropped indexes for ${collectionName} collection`);
      }

      logger.warn('All database indexes dropped successfully');
    } catch (error) {
      logger.error('Error dropping database indexes:', error);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  static async getIndexStats(): Promise<any> {
    try {
      const collections = [
        'users',
        'properties',
        'bookings',
        'rateplans',
        'calendars',
        'channels'
      ];

      const stats: any = {};

      for (const collectionName of collections) {
        const collection = mongoose.connection.collection(collectionName);
        const indexes = await collection.indexes();
        stats[collectionName] = {
          count: indexes.length,
          indexes: indexes.map(index => ({
            name: index.name,
            key: index.key,
            unique: index.unique || false,
            sparse: index.sparse || false
          }))
        };
      }

      return stats;
    } catch (error) {
      logger.error('Error getting index statistics:', error);
      throw error;
    }
  }

  /**
   * Optimize indexes for specific queries
   */
  static async optimizeForQueries(): Promise<void> {
    try {
      logger.info('Optimizing indexes for common queries...');

      // Add compound indexes for common query patterns
      const bookingCollection = mongoose.connection.collection('bookings');
      
      // Common booking queries
      await bookingCollection.createIndex({ 
        property: 1, 
        status: 1, 
        checkIn: 1 
      });
      
      await bookingCollection.createIndex({ 
        channel: 1, 
        status: 1, 
        createdAt: -1 
      });

      // Property availability queries
      const calendarCollection = mongoose.connection.collection('calendars');
      
      await calendarCollection.createIndex({ 
        property: 1, 
        status: 1, 
        date: 1 
      });
      
      await calendarCollection.createIndex({ 
        room: 1, 
        status: 1, 
        date: 1 
      });

      // Rate plan queries
      const ratePlanCollection = mongoose.connection.collection('rateplans');
      
      await ratePlanCollection.createIndex({ 
        property: 1, 
        room: 1, 
        validFrom: 1, 
        validTo: 1, 
        status: 1 
      });

      logger.info('Index optimization completed successfully');
    } catch (error) {
      logger.error('Error optimizing indexes:', error);
      throw error;
    }
  }

  /**
   * Monitor index usage
   */
  static async monitorIndexUsage(): Promise<any> {
    try {
      const collections = [
        'users',
        'properties',
        'bookings',
        'rateplans',
        'calendars',
        'channels'
      ];

      const usage: any = {};

      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.collection(collectionName);
          const stats = await collection.aggregate([
            { $indexStats: {} }
          ]).toArray();
          
          usage[collectionName] = stats.map(stat => ({
            name: stat.name,
            accesses: stat.accesses,
            lastAccess: stat.accesses.ops ? new Date(stat.accesses.ops.lastAccess) : null
          }));
        } catch (error) {
          logger.warn(`Could not get index stats for ${collectionName}:`, error);
          usage[collectionName] = [];
        }
      }

      return usage;
    } catch (error) {
      logger.error('Error monitoring index usage:', error);
      throw error;
    }
  }
}

export default DatabaseIndexes;


