import mongoose from 'mongoose';
import Booking from '../src/models/Booking';
import User from '../src/models/User';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario_dev';

async function checkClientBookings() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the client user
    const client = await User.findOne({ email: 'client@reservario.com' }).select('_id email');

    if (!client) {
      console.log('❌ Client user not found!');
      console.log('Run: npx ts-node scripts/seed-dev-data.ts\n');
      return;
    }

    console.log(`✅ Found client: ${client.email} (${client._id})\n`);

    // Find bookings created by this client
    const bookings = await Booking.find({ createdBy: client._id })
      .populate('property', 'name')
      .populate('room', 'name')
      .sort({ checkIn: 1 })
      .lean();

    console.log(`📊 Total bookings for client: ${bookings.length}\n`);

    if (bookings.length === 0) {
      console.log('⚠️  No bookings found for client!');
      console.log('Creating sample booking...\n');

      // Create a sample booking for the client
      const Property = (await import('../src/models/Property')).default;
      const property = await Property.findOne();

      if (!property || !property.rooms || property.rooms.length === 0) {
        console.log('❌ No properties found! Run seed-dev-data.ts first.');
        return;
      }

      const sampleBooking = await Booking.create({
        property: property._id,
        room: property.rooms[0]._id,
        checkIn: new Date('2025-11-15'),
        checkOut: new Date('2025-11-18'),
        status: 'confirmed',
        channel: 'direct',
        guestInfo: {
          firstName: 'Emma',
          lastName: 'Williams',
          email: 'client@reservario.com',
          phone: '+1234567894',
          documentType: 'passport',
          documentNumber: 'P1234567',
          nationality: 'US'
        },
        guests: {
          adults: 2,
          children: 0
        },
        pricing: {
          baseRate: 400,
          total: 450,
          currency: 'USD',
          breakdown: {
            accommodation: 400,
            cleaning: 50
          }
        },
        specialRequests: ['Late checkout if possible'],
        createdBy: client._id
      });

      console.log('✅ Created sample booking:');
      console.log(`   ID: ${sampleBooking._id}`);
      console.log(`   Property: ${property.name}`);
      console.log(`   Check-in: ${sampleBooking.checkIn}`);
      console.log(`   Check-out: ${sampleBooking.checkOut}`);
      console.log(`   Total: $${sampleBooking.pricing.total}\n`);
    } else {
      console.log('📋 Client Bookings:');
      bookings.forEach((booking, index) => {
        console.log(`\n${index + 1}. Booking ID: ${booking._id}`);
        console.log(`   Property: ${(booking.property as any)?.name || 'Unknown'}`);
        console.log(`   Room: ${(booking.room as any)?.name || 'Unknown'}`);
        console.log(`   Check-in: ${booking.checkIn}`);
        console.log(`   Check-out: ${booking.checkOut}`);
        console.log(`   Status: ${booking.status}`);
        console.log(`   Channel: ${booking.channel}`);
        console.log(`   Total: ${booking.pricing.currency} ${booking.pricing.total}`);
      });
      console.log();
    }

    console.log('✅ Client bookings check complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkClientBookings();
