import mongoose from 'mongoose';
import { logger } from '../src/config/logger';

/**
 * Script to fix duplicate calendar entries
 */
async function fixDuplicateCalendars() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/reservario_dev';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    const calendarCollection = mongoose.connection.collection('calendars');

    // Find duplicates
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

    logger.info(`Found ${duplicates.length} duplicate calendar entries`);

    // Remove duplicates, keeping only the first entry
    let totalRemoved = 0;
    for (const dup of duplicates) {
      const idsToRemove = dup.ids.slice(1); // Keep first, remove rest
      const result = await calendarCollection.deleteMany({
        _id: { $in: idsToRemove }
      });
      totalRemoved += result.deletedCount || 0;
      logger.info(`Removed ${idsToRemove.length} duplicates for property: ${dup._id.property}, room: ${dup._id.room}, date: ${dup._id.date}`);
    }

    logger.info(`Total duplicates removed: ${totalRemoved}`);

    // Drop existing problematic index
    try {
      await calendarCollection.dropIndex('property_1_room_1_date_1');
      logger.info('Dropped existing property_1_room_1_date_1 index');
    } catch (error) {
      logger.info('Index does not exist or already dropped');
    }

    // Recreate the unique index
    await calendarCollection.createIndex(
      { property: 1, room: 1, date: 1 },
      { unique: true }
    );
    logger.info('Created unique index: property_1_room_1_date_1');

    // Verify no more duplicates
    const remainingDuplicates = await calendarCollection.aggregate([
      {
        $group: {
          _id: { property: '$property', room: '$room', date: '$date' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).toArray();

    if (remainingDuplicates.length === 0) {
      logger.info('✓ All duplicates removed successfully');
    } else {
      logger.warn(`⚠ Still have ${remainingDuplicates.length} duplicate entries`);
    }

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Error fixing duplicate calendars:', error);
    process.exit(1);
  }
}

// Run the script
fixDuplicateCalendars();

