import mongoose from 'mongoose';
import Property from '../src/models/Property';
import Booking from '../src/models/Booking';
import RoomAvailability from '../src/models/RoomAvailability';

async function check() {
  try {
    await mongoose.connect('mongodb://localhost:27017/reservario_dev');

    console.log('=== Properties ===');
    const properties = await Property.find().select('name _id rooms.name rooms._id');
    properties.forEach(p => {
      console.log(`${p.name} (_id: ${p._id})`);
      p.rooms?.forEach(r => console.log(`  - ${r.name} (_id: ${r._id})`));
    });

    console.log('\n=== Sample Bookings ===');
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(3).populate('property', 'name');
    bookings.forEach(b => {
      console.log(`${b.guestInfo.firstName} ${b.guestInfo.lastName}: ${b.checkIn.toISOString().split('T')[0]} to ${b.checkOut.toISOString().split('T')[0]}`);
      console.log(`  Property: ${(b.property as any).name} (ID: ${b.property})`);
      console.log(`  Room: ${b.room}`);
      console.log(`  Channel: ${b.channel}, Status: ${b.status}`);
    });

    console.log('\n=== Sample Inventory (Today) ===');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inventory = await RoomAvailability.find({ date: today }).populate('property', 'name');
    inventory.forEach(inv => {
      console.log(`Date: ${inv.date.toISOString().split('T')[0]}`);
      console.log(`  Property: ${(inv.property as any)?.name || 'Unknown'}`);
      console.log(`  Room: ${inv.room}`);
      console.log(`  Total: ${inv.totalRooms}, Booked: ${inv.bookedRooms.length}, Available: ${inv.availableRooms}`);
      if (inv.bookedRooms.length > 0) {
        inv.bookedRooms.forEach(b => console.log(`    - ${b.guestName} (${b.channel})`));
      }
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

check();
