import mongoose from 'mongoose';
import '../src/models/Property'; // Need to import for populate to work
import Booking from '../src/models/Booking';
import RoomAvailability from '../src/models/RoomAvailability';

async function check() {
  try {
    await mongoose.connect('mongodb://localhost:27017/reservario_dev');

    // Check Nov 16, 2025 - we know John Smith has a booking
    const checkDate = new Date('2025-11-16');
    checkDate.setHours(0, 0, 0, 0);

    console.log(`=== Inventory for ${checkDate.toISOString().split('T')[0]} ===\n`);

    const inventory = await RoomAvailability.find({ date: checkDate }).populate('property', 'name');

    inventory.forEach(inv => {
      const propertyName = (inv.property as any)?.name || 'Unknown';
      console.log(`${propertyName}:`);
      console.log(`  Room ID: ${inv.room}`);
      console.log(`  Display: ${inv.availableRooms}/${inv.totalRooms}`);
      console.log(`  Total: ${inv.totalRooms}, Booked: ${inv.bookedRooms.length}, Available: ${inv.availableRooms}`);

      if (inv.bookedRooms.length > 0) {
        console.log(`  Bookings:`);
        inv.bookedRooms.forEach(b => {
          console.log(`    - ${b.guestName} via ${b.channel}`);
        });
      } else {
        console.log(`  No bookings`);
      }
      console.log();
    });

    // Also check bookings for this date
    console.log('=== Bookings that include this date ===\n');
    const bookings = await Booking.find({
      checkIn: { $lte: checkDate },
      checkOut: { $gt: checkDate },
      status: { $ne: 'cancelled' }
    }).populate('property', 'name');

    bookings.forEach(b => {
      console.log(`${b.guestInfo.firstName} ${b.guestInfo.lastName}:`);
      console.log(`  Property: ${(b.property as any).name}`);
      console.log(`  Room: ${b.room}`);
      console.log(`  Dates: ${b.checkIn.toISOString().split('T')[0]} to ${b.checkOut.toISOString().split('T')[0]}`);
      console.log(`  Channel: ${b.channel}, Status: ${b.status}`);
      console.log();
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

check();
