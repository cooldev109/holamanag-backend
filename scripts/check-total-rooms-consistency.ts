import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import dotenv from 'dotenv';

dotenv.config();

async function checkTotalRoomsConsistency() {
  try {
    console.log('🔍 Checking totalRooms consistency across dates...\n');
    
    await connectDB();

    // Get all unique room IDs
    const rooms = await RoomAvailability.distinct('room');
    
    console.log(`Found ${rooms.length} unique rooms\n`);
    
    for (const roomId of rooms) {
      // Get all records for this room
      const records = await RoomAvailability.find({ room: roomId })
        .select('date totalRooms')
        .sort({ date: 1 })
        .limit(10)
        .lean();
      
      const uniqueTotalRooms = [...new Set(records.map(r => r.totalRooms))];
      
      console.log(`Room: ${roomId}`);
      console.log(`  Records checked: ${records.length}`);
      console.log(`  Unique totalRooms values: ${uniqueTotalRooms.join(', ')}`);
      
      if (uniqueTotalRooms.length > 1) {
        console.log(`  ⚠️  WARNING: totalRooms is INCONSISTENT!`);
        console.log(`  First 5 records:`);
        records.slice(0, 5).forEach(r => {
          console.log(`    ${r.date.toISOString().split('T')[0]}: totalRooms = ${r.totalRooms}`);
        });
      } else {
        console.log(`  ✅ totalRooms is consistent: ${uniqueTotalRooms[0]}`);
      }
      
      console.log();
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkTotalRoomsConsistency();



