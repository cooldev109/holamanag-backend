import mongoose from 'mongoose';
import Calendar, { CalendarStatus, CalendarChannel } from '../src/models/Calendar';
import connectDB from '../src/config/database';
import dotenv from 'dotenv';

dotenv.config();

async function quickSeedCalendar() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();

    console.log('Clearing existing calendar data...');
    await Calendar.collection.drop().catch(() => console.log('Collection does not exist, creating new...'));

    const propertyId = '68e929a6ad8936e9b4b4979b'; // Luxury Beach Resort
    const roomIds = {
      suite: '68e929a6ad8936e9b4b4979c',
      deluxe: '68e929a6ad8936e9b4b4979d'
    };

    const calendarEntries = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const channels = [CalendarChannel.AIRBNB, CalendarChannel.BOOKING];

    console.log('Creating calendar entries for 30 days...');

    for (let day = 0; day < 30; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day);

      for (const channel of channels) {
        // Resort Suite - 2 units per channel
        for (let unit = 1; unit <= 2; unit++) {
          const isBooked = day < 3 && channel === CalendarChannel.AIRBNB && unit === 1;
          
          calendarEntries.push({
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomIds.suite),
            date: date,
            status: isBooked ? CalendarStatus.BOOKED : CalendarStatus.AVAILABLE,
            rate: channel === CalendarChannel.AIRBNB ? 299 : 295,
            currency: 'USD',
            minStay: 2,
            maxStay: 30,
            channel: channel
          });
        }

        // Resort Deluxe - 3 units per channel
        for (let unit = 1; unit <= 3; unit++) {
          calendarEntries.push({
            property: new mongoose.Types.ObjectId(propertyId),
            room: new mongoose.Types.ObjectId(roomIds.deluxe),
            date: date,
            status: CalendarStatus.AVAILABLE,
            rate: channel === CalendarChannel.AIRBNB ? 199 : 195,
            currency: 'USD',
            minStay: 2,
            maxStay: 30,
            channel: channel
          });
        }
      }
    }

    console.log(`Inserting ${calendarEntries.length} calendar entries...`);
    await Calendar.insertMany(calendarEntries);

    console.log('✅ Calendar seeded successfully!');
    console.log(`Total entries: ${calendarEntries.length}`);
    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${new Date(startDate.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`);
    console.log(`Channels: Airbnb, Booking.com`);
    console.log(`Rooms: 2 (Suite, Deluxe)`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding calendar:', error);
    process.exit(1);
  }
}

quickSeedCalendar();

