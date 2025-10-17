import mongoose from 'mongoose';
import Property from '../src/models/Property';

async function countProperties() {
  try {
    await mongoose.connect('mongodb://localhost:27017/reservario_dev');

    const properties = await Property.find();

    console.log('=== Registered Hotels/Properties ===\n');
    console.log(`Total: ${properties.length} properties\n`);

    properties.forEach((p, index) => {
      console.log(`${index + 1}. ${p.name}`);
      console.log(`   Location: ${p.address?.city || 'N/A'}, ${p.address?.country || 'N/A'}`);
      console.log(`   Status: ${p.status}`);
      console.log(`   Room Types: ${p.rooms?.length || 0}`);
      if (p.rooms && p.rooms.length > 0) {
        p.rooms.forEach(r => {
          console.log(`      - ${r.name} (${r.baseRate} ${r.currency || 'USD'}/night)`);
        });
      }
      console.log();
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

countProperties();
