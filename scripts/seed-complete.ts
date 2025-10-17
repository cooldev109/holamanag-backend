import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Property from '../src/models/Property';
import Booking, { BookingStatus, BookingChannel } from '../src/models/Booking';
import RoomAvailability from '../src/models/RoomAvailability';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario_dev';

/**
 * Comprehensive Seed Script
 *
 * This script creates a complete, realistic dataset with proper relationships:
 * 1. Creates base inventory (all rooms available) for next 90 days
 * 2. Creates bookings with varied dates, channels, and statuses
 * 3. Updates inventory to reflect bookings (maintains Available = Total - Booked)
 * 4. Ensures data integrity and realistic scenarios
 */

// Helper function to get date range (excludes checkout day)
function getDateRange(checkIn: Date, checkOut: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(checkIn);
  current.setHours(0, 0, 0, 0);

  const end = new Date(checkOut);
  end.setHours(0, 0, 0, 0);

  while (current < end) {  // Note: < not <=, checkout day is NOT blocked
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// Helper function to get dates for inventory (90 days)
function getInventoryDates(startDate: Date, days: number): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function seedComplete() {
  try {
    console.log('🌱 Starting Complete Seed Process...\n');
    console.log('═══════════════════════════════════════════════\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // ========================================
    // STEP 1: Get Properties
    // ========================================
    console.log('📍 STEP 1: Loading Properties...');
    console.log('───────────────────────────────────────────────');

    const properties = await Property.find().lean();
    if (properties.length === 0) {
      console.log('❌ No properties found. Please run property seeder first.');
      process.exit(1);
    }

    console.log(`✅ Found ${properties.length} properties:`);
    properties.forEach(p => {
      console.log(`   • ${p.name} (${p.rooms?.length || 0} room types)`);
    });
    console.log();

    // ========================================
    // STEP 2: Clear Existing Data
    // ========================================
    console.log('🗑️  STEP 2: Clearing Existing Data...');
    console.log('───────────────────────────────────────────────');

    await Booking.deleteMany({});
    await RoomAvailability.deleteMany({});

    console.log('✅ Cleared all bookings and inventory\n');

    // ========================================
    // STEP 3: Create Base Inventory
    // ========================================
    console.log('📦 STEP 3: Creating Base Inventory...');
    console.log('───────────────────────────────────────────────');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inventoryDates = getInventoryDates(today, 90); // Next 90 days
    let totalInventoryRecords = 0;

    for (const property of properties) {
      if (!property.rooms || property.rooms.length === 0) continue;

      console.log(`\n   Creating inventory for: ${property.name}`);

      for (const room of property.rooms) {
        // Define how many physical rooms of this type exist
        // In reality, this would come from property configuration
        const totalPhysicalRooms = Math.floor(Math.random() * 3) + 3; // 3-5 rooms

        console.log(`   • ${room.name}: ${totalPhysicalRooms} physical rooms`);

        const inventoryRecords = inventoryDates.map(date => ({
          property: property._id,
          room: room._id,
          date: new Date(date),

          // CORE: Total rooms is CONSTANT
          totalRooms: totalPhysicalRooms,

          // Initially, no bookings
          bookedRooms: [],
          blockedRooms: 0,

          // Will be calculated by pre-save hook: totalRooms - bookedRooms.length - blockedRooms
          availableRooms: totalPhysicalRooms,

          // Channel-specific rates
          rates: [
            { channel: 'airbnb', rate: room.baseRate || 100, currency: room.currency || 'USD' },
            { channel: 'booking', rate: (room.baseRate || 100) * 0.95, currency: room.currency || 'USD' }, // 5% lower for Booking.com
            { channel: 'expedia', rate: (room.baseRate || 100) * 0.98, currency: room.currency || 'USD' },
            { channel: 'direct', rate: (room.baseRate || 100) * 0.90, currency: room.currency || 'USD' }, // Best rate for direct
          ],

          minStay: 1,
          maxStay: 30,
          status: 'open'
        }));

        await RoomAvailability.insertMany(inventoryRecords);
        totalInventoryRecords += inventoryRecords.length;
      }
    }

    console.log(`\n✅ Created ${totalInventoryRecords} inventory records (90 days × ${properties.reduce((sum, p) => sum + (p.rooms?.length || 0), 0)} room types)\n`);

    // ========================================
    // STEP 4: Create Realistic Bookings
    // ========================================
    console.log('📅 STEP 4: Creating Realistic Bookings...');
    console.log('───────────────────────────────────────────────');

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
      { firstName: 'Mohammed', lastName: 'Ali', nationality: 'AE' },
      { firstName: 'Sarah', lastName: 'Wilson', nationality: 'CA' },
      { firstName: 'Lars', lastName: 'Andersen', nationality: 'NO' },
    ];

    const channels: BookingChannel[] = [
      BookingChannel.AIRBNB,
      BookingChannel.BOOKING,
      BookingChannel.EXPEDIA,
      BookingChannel.DIRECT,
    ];

    let totalBookings = 0;
    let totalNights = 0;

    console.log('\n   Creating bookings for each property...\n');

    for (const property of properties) {
      if (!property.rooms || property.rooms.length === 0) continue;

      console.log(`   ${property.name}:`);

      // Create 15-25 bookings per property
      const numBookings = Math.floor(Math.random() * 11) + 15;

      for (let i = 0; i < numBookings; i++) {
        const room = property.rooms[Math.floor(Math.random() * property.rooms.length)];
        const guest = guests[Math.floor(Math.random() * guests.length)];
        const channel = channels[Math.floor(Math.random() * channels.length)];

        // Random check-in date in next 60 days
        const daysUntilCheckIn = Math.floor(Math.random() * 60);
        const checkIn = new Date(today);
        checkIn.setDate(today.getDate() + daysUntilCheckIn);
        checkIn.setHours(15, 0, 0, 0); // 3 PM check-in

        // Random stay length (1-7 nights)
        const nights = Math.floor(Math.random() * 7) + 1;
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkIn.getDate() + nights);
        checkOut.setHours(11, 0, 0, 0); // 11 AM check-out

        // Check if rooms are available for this date range
        const bookingDates = getDateRange(checkIn, checkOut);
        let hasAvailability = true;

        for (const date of bookingDates) {
          const availability = await RoomAvailability.findOne({
            property: property._id,
            room: room._id,
            date: date
          });

          if (!availability || availability.availableRooms <= 0) {
            hasAvailability = false;
            break;
          }
        }

        // Skip if no availability
        if (!hasAvailability) {
          continue;
        }

        // Create booking
        const adults = Math.floor(Math.random() * 3) + 1;
        const children = Math.random() > 0.7 ? Math.floor(Math.random() * 2) : 0;

        const baseRate = (room.baseRate || 100) * nights;
        const taxes = baseRate * 0.1;
        const fees = 25;
        const total = baseRate + taxes + fees;

        // Determine status and createdAt
        let status: BookingStatus;
        let createdAt: Date;

        if (daysUntilCheckIn < -7) {
          // Past bookings (created in the past)
          status = Math.random() > 0.05 ? BookingStatus.CHECKED_OUT : BookingStatus.CANCELLED;
          createdAt = new Date(checkIn);
          createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 60) - 7);
        } else if (daysUntilCheckIn <= 0) {
          // Currently checked-in
          status = BookingStatus.CHECKED_IN;
          createdAt = new Date(checkIn);
          createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30) - 7);
        } else {
          // Future bookings
          status = Math.random() > 0.1 ? BookingStatus.CONFIRMED : BookingStatus.CANCELLED;
          createdAt = new Date();
          createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30));
        }

        const booking = await Booking.create({
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
          guests: { adults, children, infants: 0 },
          status,
          channel,
          channelBookingId: `${channel.toUpperCase()}-${Math.random().toString(36).substring(2, 10)}`,
          channelConfirmationCode: `${channel.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          pricing: {
            baseRate,
            taxes,
            fees,
            discounts: 0,
            total: status === BookingStatus.CANCELLED ? 0 : total,
            currency: room.currency || 'USD'
          },
          specialRequests: Math.random() > 0.7 ? ['Early check-in requested'] : [],
          createdAt,
          updatedAt: createdAt,
          ...(status === BookingStatus.CHECKED_OUT && { checkedOutAt: checkOut }),
          ...(status === BookingStatus.CHECKED_IN && { checkedInAt: checkIn }),
          ...(status === BookingStatus.CANCELLED && {
            cancelledAt: new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
            cancellationReason: 'Guest cancelled'
          })
        });

        // Update inventory ONLY if booking is not cancelled
        if (status !== BookingStatus.CANCELLED) {
          let updatedDates = 0;
          for (const date of bookingDates) {
            const availability = await RoomAvailability.findOne({
              property: property._id,
              room: room._id,
              date: date
            });

            if (availability) {
              // Check if there's still availability
              if (availability.availableRooms > 0) {
                // Add booking to bookedRooms array
                availability.bookedRooms.push({
                  channel: channel,
                  bookingId: booking._id,
                  guestName: `${guest.firstName} ${guest.lastName}`,
                  bookedAt: createdAt
                });

                // Pre-save hook will automatically calculate:
                // availableRooms = totalRooms - bookedRooms.length - blockedRooms
                await availability.save();
                updatedDates++;
              } else {
                // No availability, delete this booking and skip
                await Booking.findByIdAndDelete(booking._id);
                console.log(`   ⚠️  Skipped booking (no availability on ${date.toISOString().split('T')[0]})`);
                break;
              }
            } else {
              console.log(`   ⚠️  No inventory record for ${date.toISOString().split('T')[0]}`);
              await Booking.findByIdAndDelete(booking._id);
              break;
            }
          }

          // Only count if all dates were successfully updated
          if (updatedDates === bookingDates.length) {
            totalNights += nights;
            totalBookings++;
          }
        } else {
          totalBookings++;
        }
      }

      console.log(`   ✅ Created bookings for ${property.name}`);
    }

    console.log(`\n✅ Created ${totalBookings} total bookings (${totalNights} room-nights)\n`);

    // ========================================
    // STEP 5: Verification & Summary
    // ========================================
    console.log('🔍 STEP 5: Verifying Data Integrity...');
    console.log('───────────────────────────────────────────────\n');

    // Verify the relationship: Available = Total - Booked
    const sampleDate = new Date(today);
    sampleDate.setDate(today.getDate() + 7); // Check 7 days from now

    const sampleAvailability = await RoomAvailability.find({ date: sampleDate }).populate('room');

    console.log(`   Sample Date: ${sampleDate.toISOString().split('T')[0]}\n`);

    let allValid = true;
    for (const avail of sampleAvailability.slice(0, 3)) { // Show first 3
      const calculated = avail.totalRooms - avail.bookedRooms.length - avail.blockedRooms;
      const isValid = avail.availableRooms === calculated;

      console.log(`   Room: ${(avail.room as any).name}`);
      console.log(`   • Total Rooms: ${avail.totalRooms}`);
      console.log(`   • Booked: ${avail.bookedRooms.length}`);
      console.log(`   • Blocked: ${avail.blockedRooms}`);
      console.log(`   • Available: ${avail.availableRooms}`);
      console.log(`   • Formula: ${avail.totalRooms} - ${avail.bookedRooms.length} - ${avail.blockedRooms} = ${calculated}`);
      console.log(`   • Valid: ${isValid ? '✅' : '❌'}`);

      if (avail.bookedRooms.length > 0) {
        console.log(`   • Bookings: ${avail.bookedRooms.map(b => `${b.guestName} (${b.channel})`).join(', ')}`);
      }
      console.log();

      if (!isValid) allValid = false;
    }

    if (allValid) {
      console.log('✅ All inventory calculations are correct!\n');
    } else {
      console.log('❌ Some inventory calculations are incorrect!\n');
    }

    // ========================================
    // STEP 6: Statistics
    // ========================================
    console.log('📊 STEP 6: Final Statistics');
    console.log('═══════════════════════════════════════════════\n');

    const statusCounts = await Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const channelCounts = await Booking.aggregate([
      { $group: { _id: '$channel', count: { $sum: 1 } } }
    ]);

    const revenueData = await Booking.aggregate([
      { $match: { status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } }
    ]);

    console.log('   Bookings by Status:');
    statusCounts.forEach(s => console.log(`   • ${s._id}: ${s.count}`));

    console.log('\n   Bookings by Channel:');
    channelCounts.forEach(c => console.log(`   • ${c._id}: ${c.count}`));

    const totalRevenue = revenueData[0]?.total || 0;
    const confirmedBookings = revenueData[0]?.count || 0;

    console.log('\n   Revenue:');
    console.log(`   • Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`   • Average Booking Value: $${confirmedBookings > 0 ? (totalRevenue / confirmedBookings).toFixed(2) : 0}`);
    console.log(`   • Room-Nights Booked: ${totalNights}`);

    // Calculate occupancy for next 7 days
    const next7Days = getInventoryDates(today, 7);
    let totalRoomsNext7Days = 0;
    let bookedRoomsNext7Days = 0;

    for (const date of next7Days) {
      const dayInventory = await RoomAvailability.find({ date });
      totalRoomsNext7Days += dayInventory.reduce((sum, inv) => sum + inv.totalRooms, 0);
      bookedRoomsNext7Days += dayInventory.reduce((sum, inv) => sum + inv.bookedRooms.length, 0);
    }

    const occupancyRate = totalRoomsNext7Days > 0 ? (bookedRoomsNext7Days / totalRoomsNext7Days * 100) : 0;

    console.log('\n   Occupancy (Next 7 Days):');
    console.log(`   • Occupancy Rate: ${occupancyRate.toFixed(1)}%`);
    console.log(`   • Total Room-Nights: ${totalRoomsNext7Days}`);
    console.log(`   • Booked Room-Nights: ${bookedRoomsNext7Days}`);
    console.log(`   • Available Room-Nights: ${totalRoomsNext7Days - bookedRoomsNext7Days}`);

    console.log('\n═══════════════════════════════════════════════');
    console.log('✨ Complete Seed Process Finished Successfully!');
    console.log('═══════════════════════════════════════════════\n');

    console.log('💡 Next Steps:');
    console.log('   1. Start the backend: cd backend && npm run dev');
    console.log('   2. Start the frontend: cd frontend && npm run dev');
    console.log('   3. Login at http://localhost:8080');
    console.log('   4. View Admin Dashboard to see charts');
    console.log('   5. View Inventory page to see availability\n');

  } catch (error) {
    console.error('\n❌ Error during seed process:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

seedComplete();
