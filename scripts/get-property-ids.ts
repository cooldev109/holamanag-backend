import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import Property from '../src/models/Property';

async function getPropertyIds() {
  try {
    await connectDB();
    
    const properties = await Property.find({}).limit(2);
    
    console.log('\n📋 Available Properties and Rooms:\n');
    
    properties.forEach((property, index) => {
      console.log(`${index + 1}. Property: ${property.name}`);
      console.log(`   ID: ${property._id}`);
      console.log(`   Rooms:`);
      
      property.rooms.forEach((room, roomIndex) => {
        console.log(`      ${roomIndex + 1}. ${room.name} (${room.type})`);
        console.log(`         ID: ${room._id}`);
        console.log(`         Base Rate: $${room.baseRate}`);
      });
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getPropertyIds();



