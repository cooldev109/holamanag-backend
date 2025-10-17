import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// User Schema (simplified)
interface IUser {
  email: string;
  password: string;
  roles: string[];
  profile: {
    firstName: string;
    lastName: string;
  };
  isActive: boolean;
  isEmailVerified: boolean;
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roles: [{ type: String, enum: ['superadmin', 'admin', 'supervisor', 'client'] }],
  profile: {
    firstName: String,
    lastName: String,
  },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
}, { timestamps: true });

const User = mongoose.model<IUser>('User', userSchema);

async function createSuperadmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if superadmin already exists
    const existingSuperadmin = await User.findOne({ roles: 'superadmin' });
    if (existingSuperadmin) {
      console.log('\nSuperadmin already exists:');
      console.log('Email:', existingSuperadmin.email);
      console.log('Name:', existingSuperadmin.profile.firstName, existingSuperadmin.profile.lastName);
      console.log('\nYou can use this account to login.');
      await mongoose.disconnect();
      return;
    }

    // Create superadmin user
    const superadminEmail = 'superadmin@demo.io';
    const superadminPassword = 'superadmin123'; // You can change this

    console.log('\nCreating superadmin user...');
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(superadminPassword, salt);

    // Create user
    const superadmin = new User({
      email: superadminEmail,
      password: hashedPassword,
      roles: ['superadmin'],
      profile: {
        firstName: 'Super',
        lastName: 'Admin',
      },
      isActive: true,
      isEmailVerified: true,
    });

    await superadmin.save();

    console.log('\n✅ Superadmin created successfully!');
    console.log('\n📧 Email:', superadminEmail);
    console.log('🔑 Password:', superadminPassword);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error creating superadmin:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperadmin();

