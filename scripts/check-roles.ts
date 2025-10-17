import mongoose from 'mongoose';
import User, { Role } from '../src/models/User';

async function checkRoles() {
  try {
    await mongoose.connect('mongodb://localhost:27017/reservario_dev');

    console.log('=== User Roles Defined in the Platform ===\n');

    // Show all possible roles
    console.log('Possible Roles:');
    Object.values(Role).forEach((role, index) => {
      console.log(`  ${index + 1}. ${role}`);
    });
    console.log(`\nTotal: ${Object.values(Role).length} roles\n`);

    // Get all users and their roles
    const users = await User.find().select('email roles');

    // Collect all unique roles actually in use
    const allRoles = new Set<string>();
    users.forEach(u => {
      u.roles.forEach(r => allRoles.add(r));
    });

    console.log('=== Roles Currently in Use ===\n');
    Array.from(allRoles).sort().forEach((role, index) => {
      const count = users.filter(u => u.roles.includes(role as any)).length;
      console.log(`  ${index + 1}. ${role} (${count} users)`);
    });

    console.log('\n=== All Users ===\n');
    console.log(`Total Users: ${users.length}\n`);
    users.forEach(u => {
      console.log(`${u.email}: [${u.roles.join(', ')}]`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
  }
}

checkRoles();
