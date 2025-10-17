import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../src/models/User';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario_dev';

async function verifyCredentials() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const testCredentials = [
      { email: 'superadmin@reservario.com', password: 'Super@123', role: 'superadmin' },
      { email: 'admin@reservario.com', password: 'Admin@123', role: 'admin' },
      { email: 'supervisor1@reservario.com', password: 'Admin@123', role: 'supervisor' },
      { email: 'supervisor2@reservario.com', password: 'Admin@123', role: 'supervisor' },
      { email: 'client@reservario.com', password: 'Admin@123', role: 'client' }
    ];

    console.log('🔐 Testing Credentials:\n');

    for (const cred of testCredentials) {
      const user = await User.findOne({ email: cred.email }).select('+password');

      if (!user) {
        console.log(`❌ ${cred.email} - USER NOT FOUND`);
        continue;
      }

      const passwordMatch = await bcrypt.compare(cred.password, user.password);

      console.log(`${passwordMatch ? '✅' : '❌'} ${cred.email}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Expected Role: ${cred.role}`);
      console.log(`   Actual Role: ${user.roles.join(', ')}`);
      console.log(`   Password Match: ${passwordMatch ? 'YES' : 'NO'}`);
      console.log(`   Active: ${user.isActive}`);
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

verifyCredentials();
