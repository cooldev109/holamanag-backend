import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import RoomAvailability from '../src/models/RoomAvailability';
import Calendar from '../src/models/Calendar';
import Property from '../src/models/Property';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration Script: Convert to Shared Inventory Model
 * 
 * OLD MODEL (Wrong):
 * - Each channel has separate calendar entries
 * - Airbnb: 2 units, Booking: 2 units = 4 separate units
 * 
 * NEW MODEL (Correct):
 * - One availability record per date
 * - totalRooms: 4 (constant)
 * - bookedRooms: array of bookings from ANY channel
 * - Same 4 rooms listed on ALL channels
 */

async function migrateToSharedInventory() {
  try {
    console.log('🚀 Starting migration to shared inventory model...\n');
    
    await connectDB();

    // Get all properties
    const properties = await Property.find({}).populate('rooms');
    console.log(`Found ${properties.length} properties\n`);

    for (const property of properties) {
      console.log(`📍 Processing: ${property.name}`);
      
      for (const room of property.rooms) {
        console.log(`  Room: ${room.name} (${room.type})`);
        
        // Get date range from old calendar data
        const oldRecords = await Calendar.find({
          property: property._id,
          room: room._id
        }).sort({ date: 1 });

        if (oldRecords.length === 0) {
          console.log(`    ⚠️  No calendar data found`);
          continue;
        }

        const startDate = oldRecords[0].date;
        const endDate = oldRecords[oldRecords.length - 1].date;
        console.log(`    Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        // Group old records by date
        const dateMap = new Map<string, any[]>();
        
        for (const record of oldRecords) {
          const dateKey = record.date.toISOString().split('T')[0];
          if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, []);
          }
          dateMap.get(dateKey)!.push(record);
        }

        // Create new availability records
        let createdCount = 0;
        let errorCount = 0;

        for (const [dateKey, records] of dateMap.entries()) {
          try {
            const date = new Date(dateKey);
            
            // Count total units from old model
            const totalRooms = records.length;
            
            // Find booked records
            const bookedRooms = records
              .filter(r => r.status === 'booked')
              .map(r => ({
                channel: r.channel,
                bookingId: r.booking || new mongoose.Types.ObjectId(),
                guestName: 'Migrated Booking',
                bookedAt: r.createdAt || new Date()
              }));

            // Get rates per channel
            const rates = records.map(r => ({
              channel: r.channel,
              rate: r.rate || room.baseRate,
              currency: r.currency || 'USD'
            }));

            // Deduplicate rates by channel (take first)
            const uniqueRates = rates.reduce((acc, rate) => {
              if (!acc.find(r => r.channel === rate.channel)) {
                acc.push(rate);
              }
              return acc;
            }, [] as any[]);

            // Create availability record
            const availability = new RoomAvailability({
              property: property._id,
              room: room._id,
              date: date,
              totalRooms: Math.max(totalRooms, 1), // At least 1
              bookedRooms: bookedRooms,
              blockedRooms: 0,
              availableRooms: 0, // Will be calculated by pre-save
              rates: uniqueRates,
              minStay: records[0]?.minStay || 1,
              maxStay: records[0]?.maxStay || 30,
              status: records[0]?.status === 'blocked' ? 'closed' : 'open'
            });

            await availability.save();
            createdCount++;

          } catch (err) {
            console.error(`    ❌ Error creating record for ${dateKey}:`, (err as Error).message);
            errorCount++;
          }
        }

        console.log(`    ✅ Created ${createdCount} availability records (${errorCount} errors)`);
      }
      
      console.log();
    }

    // Report
    const totalAvailability = await RoomAvailability.countDocuments();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Migration Complete!');
    console.log(`📊 Total RoomAvailability records: ${totalAvailability}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('⚠️  IMPORTANT: The old Calendar model is still intact.');
    console.log('   To complete migration:');
    console.log('   1. Test the new system thoroughly');
    console.log('   2. Update routes to use InventoryControllerV2');
    console.log('   3. Once confirmed working, you can drop the old Calendar collection\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateToSharedInventory();



