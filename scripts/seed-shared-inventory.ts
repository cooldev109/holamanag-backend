import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import Property from '../src/models/Property';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Seed Script: Create Shared Inventory Data
 * 
 * CORRECT MODEL:
 * - Property has 4 Ocean View Suites (same 4 rooms)
 * - These same 4 rooms are listed on Airbnb AND Booking.com
 * - Total rooms: 4 (constant across all channels)
 * - When 1 books on Airbnb, all channels show 3 available
 */

async function seedSharedInventory() {
  try {
    console.log('🌱 Seeding shared inventory data...\n');
    
    await connectDB();

    // Clear existing data
    console.log('🗑️  Clearing existing RoomAvailability data...');
    await RoomAvailability.deleteMany({});

    // Get Luxury Beach Resort
    const property = await Property.findOne({ name: /Luxury Beach Resort/i }).populate('rooms');
    
    if (!property) {
      console.error('❌ Property "Luxury Beach Resort" not found!');
      console.log('   Please run the main seed script first to create properties.');
      process.exit(1);
    }

    console.log(`✅ Found property: ${property.name}`);
    console.log(`   Rooms: ${property.rooms.length}\n`);

    // Ocean View Suite - let's say this property has 4 of these
    const oceanViewSuite = property.rooms.find(r => r.name === 'Ocean View Suite');
    
    if (!oceanViewSuite) {
      console.error('❌ Ocean View Suite not found!');
      process.exit(1);
    }

    console.log(`📦 Creating availability for: ${oceanViewSuite.name}`);
    console.log(`   Total physical rooms: 4`);
    console.log(`   Listed on: Airbnb, Booking.com\n`);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const records = [];

    // Create 30 days of availability
    for (let day = 0; day < 30; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);

      // Example booking scenario matching user's requirement:
      // 3/4(airbnb) + 2/4(booking) = 1/4(total)
      // This means: 1 booked on Airbnb, 2 booked on Booking.com = 3 total booked, 1 available
      const bookedRooms = [];

      if (day >= 0 && day < 3) {
        // Days 0-2: 1 Airbnb booking
        bookedRooms.push({
          channel: 'airbnb',
          bookingId: new mongoose.Types.ObjectId(),
          guestName: 'John Doe',
          bookedAt: new Date()
        });

        // Days 0-2: 2 Booking.com bookings
        bookedRooms.push({
          channel: 'booking',
          bookingId: new mongoose.Types.ObjectId(),
          guestName: 'Jane Smith',
          bookedAt: new Date()
        });

        bookedRooms.push({
          channel: 'booking',
          bookingId: new mongoose.Types.ObjectId(),
          guestName: 'Bob Johnson',
          bookedAt: new Date()
        });
      }

      // Create availability record
      const availability = {
        property: property._id,
        room: oceanViewSuite._id,
        date: date,
        
        // KEY: Total rooms is CONSTANT
        totalRooms: 4,  // Always 4, regardless of channel
        
        // Bookings from ANY channel
        bookedRooms: bookedRooms,
        
        blockedRooms: 0,
        
        // CALCULATE: 4 - bookedRooms.length - 0
        availableRooms: 4 - bookedRooms.length - 0,  // Explicitly calculate
        
        // Different rates per channel
        rates: [
          { channel: 'airbnb', rate: 299, currency: 'USD' },
          { channel: 'booking', rate: 295, currency: 'USD' }
        ],
        
        minStay: 2,
        maxStay: 30,
        status: 'open'
      };

      records.push(availability);
    }

    // Bulk insert
    console.log(`💾 Inserting ${records.length} availability records...`);
    const created = await RoomAvailability.insertMany(records);
    
    console.log(`✅ Created ${created.length} records\n`);

    // Display sample data
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Sample Data:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sample = await RoomAvailability.findOne({ date: startDate });
    if (sample) {
      console.log(`Date: ${sample.date.toISOString().split('T')[0]}`);
      console.log(`Total Rooms: ${sample.totalRooms}`);
      console.log(`Booked: ${sample.bookedRooms.length}`);
      console.log(`Available: ${sample.availableRooms}`);
      console.log(`\nBookings:`);
      sample.bookedRooms.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.guestName} via ${b.channel}`);
      });
      console.log(`\nRates:`);
      sample.rates.forEach(r => {
        console.log(`  ${r.channel}: $${r.rate}`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Seeding Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📖 Understanding the Data:');
    console.log('   Days 0-2 (Oct 15-17):');
    console.log('   • Total: 4 rooms');
    console.log('   • Booked: 3 rooms (1 Airbnb + 2 Booking.com)');
    console.log('   • Available: 1 room\n');

    console.log('   Channel breakdown (available/total):');
    console.log('   • Airbnb view: 3/4 (1 booked on Airbnb, 3 available)');
    console.log('   • Booking view: 2/4 (2 booked on Booking, 2 available)');
    console.log('   • Total view: 1/4 (3 total booked, 1 available)\n');
    console.log('   Formula: 3/4 + 2/4 = 1/4 ✓\n');

    console.log('   Days 3+ (Oct 15+):');
    console.log('   • Total: 4 rooms');
    console.log('   • Booked: 0 rooms');
    console.log('   • Available: 4 rooms\n');

    console.log('✅ This prevents overbooking!');
    console.log('   When someone books on Airbnb, Booking.com also shows reduced availability.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedSharedInventory();

