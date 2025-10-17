import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import Property from '../src/models/Property';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Seed ALL Properties with Shared Inventory Data
 * 
 * This creates RoomAvailability records for ALL properties in the database
 * with the correct shared inventory model.
 */

async function seedAllPropertiesInventory() {
  try {
    console.log('🌱 Seeding inventory for ALL properties...\n');
    
    await connectDB();

    // Clear ALL existing RoomAvailability data
    console.log('🗑️  Clearing existing RoomAvailability data...');
    await RoomAvailability.deleteMany({});
    console.log('✅ Cleared\n');

    // Get all properties
    const properties = await Property.find({}).populate('rooms');
    
    if (properties.length === 0) {
      console.error('❌ No properties found! Please run the main seed script first.');
      process.exit(1);
    }

    console.log(`📍 Found ${properties.length} properties\n`);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    let totalRecords = 0;

    for (const property of properties) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Property: ${property.name}`);
      console.log(`   Rooms: ${property.rooms.length}`);
      
      if (property.rooms.length === 0) {
        console.log('   ⚠️  No rooms, skipping...');
        continue;
      }

      for (const room of property.rooms) {
        console.log(`\n   🏠 Room: ${room.name} (${room.type})`);
        
        // Determine total rooms based on room type
        // In a real system, this would come from room configuration
        // For now, we'll use a reasonable default
        const totalRooms = room.capacity?.adults || 4;
        console.log(`      Total units: ${totalRooms}`);

        const records = [];

        // Create 60 days of availability
        for (let day = 0; day < 60; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + day);

          // Example booking scenario for first few days
          const bookedRooms = [];
          
          // Add some sample bookings for demonstration
          // IMPORTANT: Never exceed totalRooms!
          if (day >= 0 && day < 3 && bookedRooms.length < totalRooms) {
            // Days 0-2: 1 Airbnb booking (if space available)
            bookedRooms.push({
              channel: 'airbnb',
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `Guest ${day + 1} (Airbnb)`,
              bookedAt: new Date()
            });
          }
          
          if (day >= 1 && day < 4 && bookedRooms.length < totalRooms) {
            // Days 1-3: 1 Booking.com booking (if space available)
            bookedRooms.push({
              channel: 'booking',
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `Guest ${day + 1} (Booking.com)`,
              bookedAt: new Date()
            });
          }

          // Create availability record
          const availability = {
            property: property._id,
            room: room._id,
            date: date,
            
            // KEY: Total rooms is CONSTANT
            totalRooms: totalRooms,
            
            // Bookings from ANY channel
            bookedRooms: bookedRooms,
            
            blockedRooms: 0,
            
            // CALCULATE explicitly (never negative)
            availableRooms: Math.max(0, totalRooms - bookedRooms.length - 0),
            
            // Different rates per channel
            rates: [
              { channel: 'airbnb', rate: room.baseRate * 1.02, currency: room.currency || 'USD' },
              { channel: 'booking', rate: room.baseRate * 0.98, currency: room.currency || 'USD' }
            ],
            
            minStay: 1,
            maxStay: 30,
            status: 'open'
          };

          records.push(availability);
        }

        // Bulk insert for this room
        await RoomAvailability.insertMany(records);
        console.log(`      ✅ Created ${records.length} records`);
        totalRecords += records.length;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Seeding Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 Summary:`);
    console.log(`   Properties: ${properties.length}`);
    console.log(`   Total RoomAvailability records: ${totalRecords}`);
    console.log(`   Date range: ${startDate.toISOString().split('T')[0]} - ${new Date(startDate.getTime() + 59 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`);
    console.log(`\n✅ All properties now have shared inventory data!`);
    console.log(`   The same rooms are listed on ALL channels.`);
    console.log(`   Total rooms are CONSTANT for each room across all days and channels.\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedAllPropertiesInventory();

