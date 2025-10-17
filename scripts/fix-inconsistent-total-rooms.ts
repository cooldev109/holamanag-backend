import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Fix Inconsistent totalRooms Values
 * 
 * Ensures all records for the same room have the same totalRooms value
 */

async function fixInconsistentTotalRooms() {
  try {
    console.log('🔧 Fixing inconsistent totalRooms values...\n');
    
    await connectDB();

    // Get all unique rooms
    const rooms = await RoomAvailability.distinct('room');
    
    console.log(`Found ${rooms.length} unique rooms\n`);
    
    let totalFixed = 0;

    for (const roomId of rooms) {
      // Get all records for this room
      const records = await RoomAvailability.find({ room: roomId })
        .select('_id date totalRooms')
        .lean();
      
      // Find the most common totalRooms value (or max)
      const totalRoomsValues = records.map(r => r.totalRooms);
      const uniqueValues = [...new Set(totalRoomsValues)];
      
      if (uniqueValues.length > 1) {
        console.log(`❌ Room ${roomId} has INCONSISTENT totalRooms:`);
        console.log(`   Unique values found: ${uniqueValues.join(', ')}`);
        
        // Use the maximum value as the correct one
        const correctValue = Math.max(...uniqueValues);
        console.log(`   ✅ Setting all to: ${correctValue}`);
        
        // Update all records to use the correct value
        const result = await RoomAvailability.updateMany(
          { room: roomId },
          { $set: { totalRooms: correctValue } }
        );
        
        console.log(`   Updated ${result.modifiedCount} records\n`);
        totalFixed += result.modifiedCount;
      } else {
        console.log(`✅ Room ${roomId}: Consistent (totalRooms = ${uniqueValues[0]})`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Fix Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📊 Total records fixed: ${totalFixed}`);
    console.log(`✅ All rooms now have consistent totalRooms values!\n`);

    // Verify
    console.log('🔍 Verification:');
    for (const roomId of rooms) {
      const records = await RoomAvailability.find({ room: roomId })
        .select('totalRooms')
        .limit(1)
        .lean();
      
      const allRecordsCount = await RoomAvailability.countDocuments({ room: roomId });
      const consistentCount = await RoomAvailability.countDocuments({ 
        room: roomId, 
        totalRooms: records[0]?.totalRooms 
      });
      
      if (allRecordsCount === consistentCount) {
        console.log(`✅ Room ${roomId}: All ${allRecordsCount} records have totalRooms = ${records[0]?.totalRooms}`);
      } else {
        console.log(`❌ Room ${roomId}: STILL INCONSISTENT!`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixInconsistentTotalRooms();



