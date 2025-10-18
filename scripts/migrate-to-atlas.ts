import mongoose from 'mongoose';
import { logger } from '../src/config/logger';

// Local MongoDB connection
const LOCAL_URI = 'mongodb://localhost:27017/reservario_dev';

// Atlas MongoDB connection - REPLACE <YOUR_PASSWORD> with your actual password
const ATLAS_URI = 'mongodb+srv://cooldev109:<YOUR_PASSWORD>@cluster0.fwxncyi.mongodb.net/reservario_dev?retryWrites=true&w=majority&appName=Cluster0';

async function migrateData() {
  try {
    console.log('Starting data migration from Local MongoDB to Atlas...\n');

    // Connect to local database
    console.log('Connecting to local MongoDB...');
    const localConnection = await mongoose.createConnection(LOCAL_URI).asPromise();
    console.log('✓ Connected to local MongoDB\n');

    // Connect to Atlas database
    console.log('Connecting to MongoDB Atlas...');
    const atlasConnection = await mongoose.createConnection(ATLAS_URI).asPromise();
    console.log('✓ Connected to MongoDB Atlas\n');

    // Get all collections from local database
    const collections = await localConnection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections to migrate:\n`);

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`Migrating collection: ${collectionName}...`);

      // Get data from local collection
      const localCollection = localConnection.db.collection(collectionName);
      const documents = await localCollection.find({}).toArray();

      if (documents.length === 0) {
        console.log(`  ⚠ Collection "${collectionName}" is empty, skipping...\n`);
        continue;
      }

      // Insert data into Atlas collection
      const atlasCollection = atlasConnection.db.collection(collectionName);

      // Drop existing collection in Atlas (optional - comment out if you want to keep existing data)
      try {
        await atlasCollection.drop();
        console.log(`  - Dropped existing collection in Atlas`);
      } catch (error) {
        // Collection might not exist, which is fine
      }

      // Insert documents
      await atlasCollection.insertMany(documents);
      console.log(`  ✓ Migrated ${documents.length} documents\n`);
    }

    // Close connections
    await localConnection.close();
    await atlasConnection.close();

    console.log('\n✓ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update your .env file with the Atlas connection string');
    console.log('2. Restart your backend server');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateData();
