import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User, { Role } from '../src/models/User';
import Property from '../src/models/Property';
import { logger } from '../src/config/logger';
import connectDB from '../src/config/database';

dotenv.config();

async function seedDevData() {
  try {
    await connectDB();
    logger.info('🌱 Starting development seed data creation...');

    // Check if data exists
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      logger.info('⚠️  Data already exists, clearing first...');
      await User.deleteMany({});
      await Property.deleteMany({});
    }

    // 1. CREATE SUPERADMIN
    const superadmin = await User.create({
      email: 'superadmin@reservario.com',
      password: 'Super@123',
      profile: {
        firstName: 'System',
        lastName: 'Administrator',
        phone: '+1234567890'
      },
      roles: [Role.SUPERADMIN],
      isActive: true,
      preferences: {
        language: 'en',
        timezone: 'America/New_York',
        notifications: { email: true, push: true, sms: false }
      }
    });
    logger.info(`✅ Superadmin: ${superadmin.email}`);

    // 2. CREATE ADMIN
    const admin = await User.create({
      email: 'admin@reservario.com',
      password: 'Admin@123',
      profile: {
        firstName: 'John',
        lastName: 'Manager',
        phone: '+1234567891'
      },
      roles: [Role.ADMIN],
      isActive: true,
      preferences: {
        language: 'en',
        timezone: 'America/New_York',
        notifications: { email: true, push: true, sms: false }
      }
    });
    logger.info(`✅ Admin: ${admin.email}`);

    // 3. CREATE PROPERTIES
    const property1 = await Property.create({
      name: 'Luxury Beach Resort',
      description: 'A beautiful beachfront resort with stunning ocean views',
      propertyType: 'resort',
      status: 'active',
      owner: admin._id,
      manager: admin._id,
      address: {
        street: '123 Ocean Drive',
        city: 'Miami Beach',
        state: 'FL',
        country: 'USA',
        postalCode: '33139',
        coordinates: { latitude: 25.7907, longitude: -80.1300 }
      },
      contactInfo: {
        phone: '+13055550100',
        email: 'info@luxurybeachresort.com',
        website: 'https://luxurybeachresort.com'
      },
      rooms: [
        {
          name: 'Ocean View Suite',
          type: 'suite',
          description: 'Spacious suite with panoramic ocean views',
          capacity: {
            adults: 4,
            children: 2,
            infants: 1
          },
          baseRate: 299,
          currency: 'USD',
          amenities: ['wifi', 'tv', 'minibar', 'balcony', 'ocean-view'],
          photos: [],
          isActive: true
        },
        {
          name: 'Deluxe Room',
          type: 'deluxe',
          description: 'Comfortable room with modern amenities',
          capacity: {
            adults: 2,
            children: 1,
            infants: 1
          },
          baseRate: 199,
          currency: 'USD',
          amenities: ['wifi', 'tv', 'minibar'],
          photos: [],
          isActive: true
        }
      ],
      amenities: ['pool', 'spa', 'restaurant', 'gym', 'parking', 'wifi'],
      policies: {
        checkInTime: '15:00',
        checkOutTime: '11:00',
        cancellationPolicy: 'Free cancellation up to 48 hours before check-in',
        houseRules: ['No smoking', 'No parties'],
        petPolicy: 'Pets not allowed',
        smokingPolicy: 'Non-smoking property'
      },
      photos: []
    });
    logger.info(`✅ Property: ${property1.name}`);

    const property2 = await Property.create({
      name: 'Downtown Business Hotel',
      description: 'Modern hotel in the heart of downtown',
      propertyType: 'hotel',
      status: 'active',
      owner: admin._id,
      manager: admin._id,
      address: {
        street: '456 Main Street',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        postalCode: '10001',
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
      },
      contactInfo: {
        phone: '+12125550200',
        email: 'info@downtownhotel.com',
        website: 'https://downtownhotel.com'
      },
      rooms: [
        {
          name: 'Executive Suite',
          type: 'executive',
          description: 'Premium suite for business travelers',
          capacity: {
            adults: 2,
            children: 1,
            infants: 1
          },
          baseRate: 399,
          currency: 'USD',
          amenities: ['wifi', 'tv', 'desk', 'minibar', 'city-view'],
          photos: [],
          isActive: true
        },
        {
          name: 'Standard Room',
          type: 'single',
          description: 'Comfortable standard room',
          capacity: {
            adults: 2,
            children: 0,
            infants: 0
          },
          baseRate: 149,
          currency: 'USD',
          amenities: ['wifi', 'tv', 'desk'],
          photos: [],
          isActive: true
        }
      ],
      amenities: ['wifi', 'gym', 'restaurant', 'meeting-rooms', 'parking'],
      policies: {
        checkInTime: '15:00',
        checkOutTime: '12:00',
        cancellationPolicy: 'Free cancellation up to 24 hours before check-in',
        houseRules: ['No smoking', 'Quiet hours after 10 PM'],
        petPolicy: 'Small pets allowed with fee',
        smokingPolicy: 'Non-smoking property'
      },
      photos: []
    });
    logger.info(`✅ Property: ${property2.name}`);

    // 4. CREATE SUPERVISORS
    const supervisor1 = await User.create({
      email: 'supervisor1@reservario.com',
      password: 'Admin@123',
      profile: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        phone: '+1234567892'
      },
      roles: [Role.SUPERVISOR],
      isActive: true,
      createdBy: admin._id,
      preferences: {
        language: 'en',
        timezone: 'America/New_York',
        notifications: { email: true, push: false, sms: false }
      }
    });

    const supervisor2 = await User.create({
      email: 'supervisor2@reservario.com',
      password: 'Admin@123',
      profile: {
        firstName: 'Michael',
        lastName: 'Chen',
        phone: '+1234567893'
      },
      roles: [Role.SUPERVISOR],
      isActive: true,
      createdBy: admin._id,
      preferences: {
        language: 'en',
        timezone: 'America/New_York',
        notifications: { email: true, push: false, sms: false }
      }
    });

    // 5. ASSIGN SUPERVISORS TO PROPERTIES
    property1.manager = supervisor1._id;
    await property1.save();
    logger.info(`✅ Supervisor 1: ${supervisor1.email} → ${property1.name}`);

    property2.manager = supervisor2._id;
    await property2.save();
    logger.info(`✅ Supervisor 2: ${supervisor2.email} → ${property2.name}`);

    // 6. CREATE CLIENT
    const client = await User.create({
      email: 'client@reservario.com',
      password: 'Admin@123',
      profile: {
        firstName: 'Emma',
        lastName: 'Williams',
        phone: '+1234567894'
      },
      roles: [Role.CLIENT],
      isActive: true,
      createdBy: admin._id,
      preferences: {
        language: 'en',
        timezone: 'America/New_York',
        notifications: { email: true, push: false, sms: false }
      }
    });
    logger.info(`✅ Client: ${client.email}`);

    logger.info('\n========================================');
    logger.info('   ✨ Seed Data Summary');
    logger.info('========================================');
    logger.info(`Superadmin: ${superadmin.email} / Super@123`);
    logger.info(`Admin: ${admin.email} / Admin@123`);
    logger.info(`Supervisor 1: ${supervisor1.email} / Admin@123`);
    logger.info(`Supervisor 2: ${supervisor2.email} / Admin@123`);
    logger.info(`Client: ${client.email} / Admin@123`);
    logger.info(`\n✅ Development seed data created!\n`);

  } catch (error) {
    logger.error('❌ Error seeding data:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedDevData();

