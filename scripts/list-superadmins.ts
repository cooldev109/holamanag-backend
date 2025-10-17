import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const userSchema = new mongoose.Schema({
  email: String,
  roles: [String],
  profile: {
    firstName: String,
    lastName: String,
  },
  isActive: Boolean,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function listSuperadmins() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    const superadmins = await User.find({ roles: 'superadmin' }).select('email roles profile isActive createdAt');

    if (superadmins.length === 0) {
      console.log('No superadmin users found in database.\n');
    } else {
      console.log(`Found ${superadmins.length} superadmin user(s):\n`);
      superadmins.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.profile.firstName} ${user.profile.lastName}`);
        console.log(`   Roles: ${user.roles.join(', ')}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log('');
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

listSuperadmins();



