import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import dotenv from 'dotenv';

dotenv.config();

async function checkAvailability() {
  try {
    console.log('🔍 Checking RoomAvailability records...\n');
    
    await connectDB();

    const records = await RoomAvailability.find().limit(5).lean();
    
    console.log(`Found ${records.length} records\n`);
    
    records.forEach((record, index) => {
      console.log(`Record ${index + 1}:`);
      console.log(`  Date: ${record.date.toISOString().split('T')[0]}`);
      console.log(`  Total Rooms: ${record.totalRooms}`);
      console.log(`  Booked Rooms: ${record.bookedRooms?.length || 0}`);
      console.log(`  Blocked Rooms: ${record.blockedRooms}`);
      console.log(`  Available Rooms: ${record.availableRooms}`);
      console.log(`  Status: ${record.status}`);
      
      if (record.availableRooms === undefined || record.availableRooms === null) {
        console.log(`  ⚠️  WARNING: availableRooms is ${record.availableRooms}!`);
      } else {
        console.log(`  ✅ availableRooms is set correctly`);
      }
      
      console.log();
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAvailability();



