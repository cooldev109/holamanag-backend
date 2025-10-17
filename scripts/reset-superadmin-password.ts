import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  roles: [String],
  profile: {
    firstName: String,
    lastName: String,
  },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function resetSuperadminPassword() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/reservario';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // Find superadmin
    const superadmin = await User.findOne({ roles: 'superadmin' });
    
    if (!superadmin) {
      console.log('❌ No superadmin user found in database.\n');
      await mongoose.disconnect();
      return;
    }

    console.log('Found superadmin:', superadmin.email);

    // Set new password
    const newPassword = 'superadmin123';
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    superadmin.password = hashedPassword;
    await superadmin.save();

    console.log('\n✅ Password reset successfully!');
    console.log('\n📧 Email:', superadmin.email);
    console.log('🔑 New Password:', newPassword);
    console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

resetSuperadminPassword();



