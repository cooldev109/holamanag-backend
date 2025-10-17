import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import Property from '../src/models/Property';
import dotenv from 'dotenv';

dotenv.config();

/**
 * CORRECT Seed Data Following User's Rules
 * 
 * RULES:
 * 1. One property shared across all OTA platforms (same physical rooms)
 * 2. Follow shared inventory: Available = Total - (Airbnb + Booking + ...)
 * 3. Never negative availability
 */

async function seedCorrectInventory() {
  try {
    console.log('🌱 Creating CORRECT seed data following your rules...\n');
    
    await connectDB();

    // Clear existing data
    console.log('🗑️  Clearing existing RoomAvailability data...');
    await RoomAvailability.deleteMany({});
    console.log('✅ Cleared\n');

    // Get all properties
    const properties = await Property.find({}).populate('rooms');
    
    if (properties.length === 0) {
      console.error('❌ No properties found!');
      process.exit(1);
    }

    console.log(`📍 Found ${properties.length} properties\n`);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    let totalRecords = 0;

    for (const property of properties) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Property: ${property.name}`);
      console.log(`   ID: ${property._id}`);
      
      if (property.rooms.length === 0) {
        console.log('   ⚠️  No rooms, skipping...');
        continue;
      }

      for (const room of property.rooms) {
        console.log(`\n   🏠 Room: ${room.name} (${room.type})`);
        
        // RULE: Determine total rooms (constant for this room type)
        // Using room capacity as indication of total units available
        const totalRooms = Math.max(room.capacity?.adults || 2, 2);
        console.log(`      📊 Total physical rooms: ${totalRooms}`);
        console.log(`      💰 Base rate: $${room.baseRate}`);
        
        const records = [];

        // Create 60 days of availability
        for (let day = 0; day < 60; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + day);

          // RULE: Bookings from ANY channel (shared inventory)
          const bookedRooms = [];
          
          // Sample booking pattern that NEVER exceeds totalRooms
          // Days 0-2: Some Airbnb bookings
          if (day >= 0 && day < 3 && bookedRooms.length < totalRooms - 1) {
            bookedRooms.push({
              channel: 'airbnb',
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `John Doe ${day + 1}`,
              bookedAt: new Date()
            });
          }
          
          // Days 1-4: Some Booking.com bookings
          if (day >= 1 && day < 5 && bookedRooms.length < totalRooms) {
            bookedRooms.push({
              channel: 'booking',
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `Jane Smith ${day + 1}`,
              bookedAt: new Date()
            });
          }
          
          // Days 5-7: One more Airbnb booking
          if (day >= 5 && day < 8 && bookedRooms.length < totalRooms) {
            bookedRooms.push({
              channel: 'airbnb',
              bookingId: new mongoose.Types.ObjectId(),
              guestName: `Bob Wilson ${day + 1}`,
              bookedAt: new Date()
            });
          }
          
          // RULE: Calculate availability (NEVER negative)
          const booked = bookedRooms.length;
          const blocked = 0;
          const available = Math.max(0, totalRooms - booked - blocked);
          
          // Create availability record
          const availability = {
            property: property._id,
            room: room._id,
            date: date,
            
            // RULE 1: Total rooms is CONSTANT (same across all platforms)
            totalRooms: totalRooms,
            
            // RULE 1: Bookings from ANY channel (shared inventory)
            bookedRooms: bookedRooms,
            
            blockedRooms: blocked,
            
            // RULE 2 & 3: Available = Total - Booked (NEVER negative)
            availableRooms: available,
            
            // Different rates per channel (same rooms, different prices)
            rates: [
              { channel: 'airbnb', rate: Math.round(room.baseRate * 1.02), currency: room.currency || 'USD' },
              { channel: 'booking', rate: Math.round(room.baseRate * 0.98), currency: room.currency || 'USD' }
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
        
        // Show sample data
        const sample = records[0];
        console.log(`      📋 Sample (${sample.date.toISOString().split('T')[0]}):`);
        console.log(`         Total: ${sample.totalRooms}`);
        console.log(`         Booked: ${sample.bookedRooms.length}`);
        console.log(`         Available: ${sample.availableRooms}`);
        console.log(`         Formula: ${sample.totalRooms} - ${sample.bookedRooms.length} = ${sample.availableRooms} ✅`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Seed Data Created Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 Summary:`);
    console.log(`   Properties: ${properties.length}`);
    console.log(`   Total RoomAvailability records: ${totalRecords}`);
    console.log(`   Date range: ${startDate.toISOString().split('T')[0]} - ${new Date(startDate.getTime() + 59 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`);
    
    console.log(`\n✅ YOUR RULES FOLLOWED:`);
    console.log(`   1. ✅ One property shared across OTA platforms`);
    console.log(`      - Same physical rooms listed on Airbnb AND Booking.com`);
    console.log(`      - totalRooms is CONSTANT for each room type`);
    console.log(`\n   2. ✅ Shared inventory calculation`);
    console.log(`      - availableRooms = totalRooms - bookedRooms.length`);
    console.log(`      - Example: 4 total - (1 Airbnb + 1 Booking) = 2 available`);
    console.log(`\n   3. ✅ Never negative availability`);
    console.log(`      - Math.max(0, total - booked) ensures >= 0`);
    console.log(`      - Pre-save hook provides additional protection`);
    
    console.log(`\n🎯 Result:`);
    console.log(`   - ALL channels show SAME total for same date`);
    console.log(`   - ALL channels show SAME availability for same date`);
    console.log(`   - NO negative values possible`);
    console.log(`\n✅ CORRECT shared inventory model implemented!\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedCorrectInventory();



