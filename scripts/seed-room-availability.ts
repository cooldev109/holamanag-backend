import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RoomAvailability, { AvailabilityStatus } from '../src/models/RoomAvailability';
import Property from '../src/models/Property';
import { logger } from '../src/config/logger';
import connectDB from '../src/config/database';

dotenv.config();

async function seedRoomAvailability() {
  try {
    await connectDB();
    logger.info('🌱 Starting RoomAvailability seed data creation...');

    // Check if data exists
    const existingCount = await RoomAvailability.countDocuments();
    if (existingCount > 0) {
      logger.info('⚠️  RoomAvailability data already exists, clearing first...');
      await RoomAvailability.deleteMany({});
    }

    // Get all properties with rooms
    const properties = await Property.find({}).populate('rooms');
    if (properties.length === 0) {
      logger.error('❌ No properties found. Please run seed-dev-data.ts first.');
      return;
    }

    logger.info(`📋 Found ${properties.length} properties to seed`);

    // Generate availability for the next 90 days
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 90);

    let totalRecords = 0;

    for (const property of properties) {
      logger.info(`🏨 Processing property: ${property.name} (${property.rooms.length} rooms)`);

      for (const room of property.rooms) {
        logger.info(`  🛏️  Processing room: ${room.name}`);

        // Generate availability records for each date
        for (let date = new Date(today); date <= endDate; date.setDate(date.getDate() + 1)) {
          const currentDate = new Date(date);
          
          // Skip past dates
          if (currentDate < today) continue;

          // Randomize some data for realism
          const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
          const isHoliday = Math.random() < 0.1; // 10% chance of holiday
          const isMaintenance = Math.random() < 0.02; // 2% chance of maintenance

          // Base availability
          let totalRooms = room.capacity?.adults || 2; // Use room capacity as base
          let bookedRooms: any[] = [];
          let blockedRooms = 0;

          // Weekend and holiday adjustments
          if (isWeekend) {
            // Higher booking probability on weekends
            const weekendBookings = Math.floor(Math.random() * Math.min(3, totalRooms));
            for (let i = 0; i < weekendBookings; i++) {
              bookedRooms.push({
                channel: ['airbnb', 'booking', 'expedia', 'agoda', 'vrbo'][Math.floor(Math.random() * 5)],
                bookingId: new mongoose.Types.ObjectId(),
                guestName: `Guest ${i + 1}`,
                bookedAt: new Date()
              });
            }
          }

          // Holiday adjustments
          if (isHoliday) {
            const holidayBookings = Math.floor(Math.random() * Math.min(2, totalRooms));
            for (let i = 0; i < holidayBookings; i++) {
              bookedRooms.push({
                channel: ['airbnb', 'booking', 'expedia'][Math.floor(Math.random() * 3)],
                bookingId: new mongoose.Types.ObjectId(),
                guestName: `Holiday Guest ${i + 1}`,
                bookedAt: new Date()
              });
            }
          }

          // Maintenance
          if (isMaintenance) {
            blockedRooms = Math.floor(Math.random() * Math.min(2, totalRooms));
          }

          // Random additional bookings
          const additionalBookings = Math.floor(Math.random() * Math.min(2, totalRooms - bookedRooms.length));
          for (let i = 0; i < additionalBookings; i++) {
            bookedRooms.push({
              channel: ['airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct'][Math.floor(Math.random() * 6)],
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `Regular Guest ${i + 1}`,
              bookedAt: new Date()
            });
          }

          // Generate channel-specific rates
          const baseRate = room.baseRate || 100;
          const rates = [
            { channel: 'airbnb', rate: Math.floor(baseRate * (0.9 + Math.random() * 0.2)), currency: 'USD' },
            { channel: 'booking', rate: Math.floor(baseRate * (0.95 + Math.random() * 0.1)), currency: 'USD' },
            { channel: 'expedia', rate: Math.floor(baseRate * (0.9 + Math.random() * 0.15)), currency: 'USD' },
            { channel: 'agoda', rate: Math.floor(baseRate * (0.85 + Math.random() * 0.2)), currency: 'USD' },
            { channel: 'vrbo', rate: Math.floor(baseRate * (0.95 + Math.random() * 0.1)), currency: 'USD' },
            { channel: 'direct', rate: Math.floor(baseRate * (0.8 + Math.random() * 0.1)), currency: 'USD' }
          ];

          // Weekend/holiday rate adjustments
          if (isWeekend || isHoliday) {
            rates.forEach(rate => {
              rate.rate = Math.floor(rate.rate * (1.2 + Math.random() * 0.3)); // 20-50% increase
            });
          }

          // Create availability record
          const availabilityRecord = new RoomAvailability({
            property: property._id,
            room: room._id,
            date: currentDate,
            totalRooms,
            bookedRooms,
            blockedRooms,
            rates,
            minStay: Math.floor(Math.random() * 3) + 1, // 1-3 nights
            maxStay: Math.floor(Math.random() * 14) + 7, // 7-21 nights
            status: isMaintenance ? AvailabilityStatus.MAINTENANCE : AvailabilityStatus.OPEN,
            closedChannels: isMaintenance ? ['airbnb', 'booking'] : []
          });

          await availabilityRecord.save();
          totalRecords++;
        }
      }
    }

    logger.info(`✅ Successfully created ${totalRecords} RoomAvailability records`);
    logger.info('🎉 RoomAvailability seed data creation completed!');

  } catch (error) {
    logger.error('❌ Error creating RoomAvailability seed data:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Run the seed function
if (require.main === module) {
  seedRoomAvailability()
    .then(() => {
      logger.info('✅ Seed script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Seed script failed:', error);
      process.exit(1);
    });
}

export default seedRoomAvailability;
