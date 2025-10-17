import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Property from '../src/models/Property';
import Booking, { BookingStatus, BookingChannel } from '../src/models/Booking';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario_dev';

async function seedHistoricalBookings() {
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

    const bookingsToCreate = [];
    const now = new Date();

    console.log('Creating historical bookings for analytics...\n');

    // Create bookings for the last 6 months
    for (const property of properties) {
      if (!property.rooms || property.rooms.length === 0) continue;

      const numRooms = property.rooms.length;

      // Create 30-50 bookings per property spread across 6 months
      const numBookings = Math.floor(Math.random() * 21) + 30;

      for (let i = 0; i < numBookings; i++) {
        const room = property.rooms[Math.floor(Math.random() * numRooms)];
        const guest = guests[Math.floor(Math.random() * guests.length)];
        const channel = channels[Math.floor(Math.random() * channels.length)];

        // Create bookings in the past (0-180 days ago)
        const daysAgo = Math.floor(Math.random() * 180);
        const createdAt = new Date(now);
        createdAt.setDate(now.getDate() - daysAgo);

        // Check-in 1-30 days after booking
        const daysUntilCheckIn = Math.floor(Math.random() * 30) + 1;
        const checkIn = new Date(createdAt);
        checkIn.setDate(createdAt.getDate() + daysUntilCheckIn);
        checkIn.setHours(15, 0, 0, 0);

        const nights = Math.floor(Math.random() * 7) + 1; // 1-7 nights
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkIn.getDate() + nights);
        checkOut.setHours(11, 0, 0, 0);

        const adults = Math.floor(Math.random() * 3) + 1;
        const children = Math.random() > 0.7 ? Math.floor(Math.random() * 2) : 0;

        // Calculate pricing
        const baseRate = (room.baseRate || 100) * nights;
        const taxes = baseRate * 0.1;
        const fees = 25;
        const total = baseRate + taxes + fees;

        const confirmationCode = `${channel.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        // Determine status based on check-out date
        let status: BookingStatus;
        if (checkOut < now) {
          // Past bookings: 95% confirmed/checked-out, 5% cancelled
          status = Math.random() > 0.05 ? BookingStatus.CHECKED_OUT : BookingStatus.CANCELLED;
        } else if (checkIn < now) {
          // Currently checked-in
          status = BookingStatus.CHECKED_IN;
        } else {
          // Future bookings: 90% confirmed, 10% cancelled
          status = Math.random() > 0.1 ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED;
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
          channelBookingId: `${channel.toUpperCase()}-${Math.random().toString(36).substring(2, 10)}`,
          channelConfirmationCode: confirmationCode,
          pricing: {
            baseRate,
            taxes,
            fees,
            discounts: 0,
            total: status === BookingStatus.CANCELLED ? 0 : total, // Cancelled bookings have 0 revenue
            currency: room.currency || 'USD'
          },
          specialRequests: Math.random() > 0.7 ? [
            ['Early check-in if possible', 'Late check-out requested', 'High floor preferred', 'Extra towels please'][Math.floor(Math.random() * 4)]
          ] : [],
          createdAt: createdAt, // Important: set createdAt to past date
          updatedAt: createdAt,
          ...(status === BookingStatus.CHECKED_OUT && { checkedOutAt: checkOut }),
          ...(status === BookingStatus.CHECKED_IN && { checkedInAt: checkIn }),
          ...(status === BookingStatus.CANCELLED && {
            cancelledAt: new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
            cancellationReason: 'Guest cancelled'
          })
        });
      }
    }

    // Insert all bookings
    console.log(`Creating ${bookingsToCreate.length} historical bookings...`);
    const createdBookings = await Booking.insertMany(bookingsToCreate);
    console.log(`✅ Created ${createdBookings.length} historical bookings\n`);

    // Print summary
    console.log('========================================');
    console.log('   📊 Historical Booking Summary');
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
    console.log(`Average Booking Value: $${(totalRevenue[0]?.total / createdBookings.filter(b => b.status !== BookingStatus.CANCELLED).length).toFixed(2) || 0}`);

    // Show monthly breakdown
    const monthlyRevenue = await Booking.aggregate([
      {
        $match: {
          status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
          createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } // This year
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$pricing.total' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    console.log('\n📅 Monthly Revenue (This Year):');
    monthlyRevenue.forEach(m => {
      const monthName = new Date(m._id.year, m._id.month - 1).toLocaleString('default', { month: 'short' });
      console.log(`  ${monthName} ${m._id.year}: $${m.revenue.toFixed(2)} (${m.count} bookings)`);
    });

    console.log('\n✅ Historical booking seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding historical bookings:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

seedHistoricalBookings();
