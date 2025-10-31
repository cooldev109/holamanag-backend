import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Property from '../src/models/Property';
import Booking, { BookingStatus, BookingChannel } from '../src/models/Booking';
import RoomAvailability from '../src/models/RoomAvailability';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario_dev';

interface BookingData {
  property: mongoose.Types.ObjectId;
  room: mongoose.Types.ObjectId;
  checkIn: Date;
  checkOut: Date;
  guestInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
  };
  guests: {
    adults: number;
    children: number;
    infants: number;
  };
  status: BookingStatus;
  channel: BookingChannel;
  confirmationCode: string;
  pricing: {
    baseRate: number;
    taxes: number;
    fees: number;
    discounts: number;
    total: number;
    currency: string;
  };
  specialRequests?: string[];
  bookingType: 'guest';
  bookingSource: BookingChannel;
}

async function seedBookings() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    // Get all properties with their rooms
    const properties = await Property.find().lean();
    if (properties.length === 0) {
      console.log('No properties found. Please run property seeder first.');
      return;
    }

    console.log(`Found ${properties.length} properties\n`);

    // Clear existing bookings
    await Booking.deleteMany({});
    console.log('Cleared existing bookings');

    const bookingsToCreate: BookingData[] = [];
    const now = new Date();
    
    // Guest names for variety
    const guests = [
      { firstName: 'John', lastName: 'Smith', nationality: 'US' },
      { firstName: 'Emma', lastName: 'Johnson', nationality: 'UK' },
      { firstName: 'Carlos', lastName: 'Garcia', nationality: 'ES' },
      { firstName: 'Sophie', lastName: 'Martin', nationality: 'FR' },
      { firstName: 'Luca', lastName: 'Rossi', nationality: 'IT' },
      { firstName: 'Anna', lastName: 'Schmidt', nationality: 'DE' },
      { firstName: 'Wei', lastName: 'Zhang', nationality: 'CN' },
      { firstName: 'Yuki', lastName: 'Tanaka', nationality: 'JP' },
      { firstName: 'Maria', lastName: 'Silva', nationality: 'BR' },
      { firstName: 'Mohammed', lastName: 'Ali', nationality: 'AE' }
    ];

    const channels: BookingChannel[] = [
      BookingChannel.AIRBNB,
      BookingChannel.BOOKING,
      BookingChannel.DIRECT,
      BookingChannel.EXPEDIA
    ];

    let bookingCount = 0;

    // Create bookings for each property
    for (const property of properties) {
      if (!property.rooms || property.rooms.length === 0) continue;

      const numRooms = property.rooms.length;

      // Create 2-4 bookings per day for the past 90 days for better chart data
      for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
        const bookingsPerDay = Math.floor(Math.random() * 3) + 2; // 2-4 bookings per day

        for (let i = 0; i < bookingsPerDay; i++) {
          const room = property.rooms[Math.floor(Math.random() * numRooms)];
          const guest = guests[Math.floor(Math.random() * guests.length)];
          const channel = channels[Math.floor(Math.random() * channels.length)];

          // Historical dates (past 90 days)
          const checkIn = new Date(now);
          checkIn.setDate(now.getDate() - daysAgo);
          checkIn.setHours(15, 0, 0, 0); // Check-in at 3 PM

          const nights = Math.floor(Math.random() * 4) + 2; // 2-5 nights
          const checkOut = new Date(checkIn);
          checkOut.setDate(checkIn.getDate() + nights);
          checkOut.setHours(11, 0, 0, 0); // Check-out at 11 AM

          const adults = Math.floor(Math.random() * 3) + 1; // 1-3 adults
          const children = Math.random() > 0.7 ? Math.floor(Math.random() * 2) : 0; // 0-1 children (30% chance)

          // Calculate pricing
          const baseRate = (room.baseRate || 100) * nights;
          const taxes = baseRate * 0.1; // 10% tax
          const fees = 25; // Fixed cleaning fee
          const total = baseRate + taxes + fees;

          // Generate unique confirmation code
          const confirmationCode = `${channel.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

          // All historical bookings are checked out
          let status: BookingStatus = BookingStatus.CHECKED_OUT;
          if (daysAgo <= 0) {
            status = BookingStatus.CHECKED_IN;
          } else if (daysAgo <= 3) {
            status = Math.random() > 0.5 ? BookingStatus.CONFIRMED : BookingStatus.CHECKED_IN;
          }

          bookingsToCreate.push({
            property: property._id,
            room: room._id,
            checkIn,
            checkOut,
            guestInfo: {
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: `${guest.firstName.toLowerCase()}.${guest.lastName.toLowerCase()}@email.com`,
              phone: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
              nationality: guest.nationality,
              documentType: 'passport',
              documentNumber: `${guest.nationality}${Math.floor(Math.random() * 1000000)}`
            },
            guests: {
              adults,
              children,
              infants: 0
            },
            status,
            channel,
            confirmationCode,
            pricing: {
              baseRate,
              taxes,
              fees,
              discounts: 0,
              total,
              currency: room.currency || 'USD'
            },
            specialRequests: Math.random() > 0.7 ? [
              ['Early check-in if possible', 'Late check-out requested', 'High floor preferred', 'Extra towels please'][Math.floor(Math.random() * 4)]
            ] : [],
            bookingType: 'guest' as const,
            bookingSource: channel
          });

          bookingCount++;
        }
      }
    }

    // Insert all bookings
    console.log(`\nCreating ${bookingsToCreate.length} bookings...`);
    const createdBookings = await Booking.insertMany(bookingsToCreate);
    console.log(`✅ Created ${createdBookings.length} bookings`);

    // Update RoomAvailability with booking references
    console.log('\n📅 Updating room availability...');
    let updatedDays = 0;

    for (const booking of createdBookings) {
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      
      // Update availability for each day of the booking
      let currentDate = new Date(checkIn);
      currentDate.setHours(0, 0, 0, 0);
      
      while (currentDate < checkOut) {
        try {
          const availability = await RoomAvailability.findOne({
            property: booking.property,
            room: booking.room,
            date: currentDate
          });

          if (availability) {
            // Use the model's addBooking method to maintain consistency
            await availability.addBooking(
              booking.channel as string,
              booking._id,
              `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`
            );
            updatedDays++;
          }
        } catch (error) {
          // Skip if availability doesn't exist or room is full
          console.log(`⚠️  Could not add booking to ${currentDate.toISOString().split('T')[0]} (may be full)`);
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    console.log(`✅ Updated ${updatedDays} availability records\n`);

    // Print summary
    console.log('========================================');
    console.log('   📊 Booking Seed Summary');
    console.log('========================================\n');

    const statusCounts = await Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const channelCounts = await Booking.aggregate([
      { $group: { _id: '$channel', count: { $sum: 1 } } }
    ]);

    console.log('By Status:');
    statusCounts.forEach(s => console.log(`  ${s._id}: ${s.count}`));

    console.log('\nBy Channel:');
    channelCounts.forEach(c => console.log(`  ${c._id}: ${c.count}`));

    const totalRevenue = await Booking.aggregate([
      { $match: { status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    console.log(`\nTotal Revenue: $${totalRevenue[0]?.total.toFixed(2) || 0}`);
    console.log(`Average Booking Value: $${(totalRevenue[0]?.total / bookingsToCreate.length).toFixed(2) || 0}`);

    console.log('\n✅ Booking seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding bookings:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

seedBookings();



