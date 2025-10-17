import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

/**
 * Connect to in-memory MongoDB for testing
 */
export const connectTestDatabase = async (): Promise<void> => {
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to test database');
  } catch (error) {
    console.error('❌ Error connecting to test database:', error);
    throw error;
  }
};

/**
 * Disconnect and stop in-memory MongoDB
 */
export const disconnectTestDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('✅ Disconnected from test database');
  } catch (error) {
    console.error('❌ Error disconnecting from test database:', error);
    throw error;
  }
};

/**
 * Clear all collections in test database
 */
export const clearTestDatabase = async (): Promise<void> => {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  } catch (error) {
    console.error('❌ Error clearing test database:', error);
    throw error;
  }
};

/**
 * Generate test JWT token
 */
export const generateTestToken = (userId: string, role: string = 'admin'): string => {
  const secret = process.env['JWT_SECRET'] || 'test-secret-key';
  return jwt.sign(
    { id: userId, role },
    secret,
    { expiresIn: '1h' }
  );
};

/**
 * Create test user data
 */
export const createTestUser = () => ({
  _id: new mongoose.Types.ObjectId(),
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
  password: 'hashedpassword123'
});

/**
 * Create test property data
 */
export const createTestProperty = (userId: mongoose.Types.ObjectId) => ({
  name: 'Test Hotel',
  type: 'hotel',
  address: {
    street: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    country: 'Test Country',
    postalCode: '12345'
  },
  contactInfo: {
    email: 'hotel@test.com',
    phone: '+1234567890',
    website: 'https://testhotel.com'
  },
  owner: userId,
  status: 'active',
  rooms: [
    {
      _id: new mongoose.Types.ObjectId(),
      name: 'Deluxe Room',
      type: 'deluxe',
      description: 'Spacious deluxe room',
      capacity: 2,
      baseRate: 150,
      amenities: ['WiFi', 'TV', 'Air Conditioning'],
      status: 'active'
    }
  ]
});

/**
 * Create test booking data
 */
export const createTestBooking = (
  propertyId: mongoose.Types.ObjectId,
  roomId: mongoose.Types.ObjectId
) => ({
  property: propertyId,
  room: roomId,
  guestInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    nationality: 'US',
    documentType: 'passport',
    documentNumber: 'AB123456'
  },
  checkIn: new Date(Date.now() + 86400000 * 7), // 7 days from now
  checkOut: new Date(Date.now() + 86400000 * 10), // 10 days from now
  guests: {
    adults: 2,
    children: 0,
    infants: 0
  },
  status: 'confirmed',
  channel: 'direct',
  pricing: {
    baseRate: 150,
    taxes: 30,
    fees: 20,
    discounts: 0,
    total: 500,
    currency: 'USD'
  },
  specialRequests: ['Late check-in']
});

/**
 * Create test organization data
 */
export const createTestOrganization = (ownerId: mongoose.Types.ObjectId) => ({
  name: 'Test Organization',
  type: 'hotel_chain',
  status: 'active',
  subscription: {
    plan: 'professional',
    startDate: new Date(),
    isActive: true,
    features: ['multi_property', 'analytics', 'automation']
  },
  limits: {
    maxProperties: 10,
    maxUsers: 20,
    maxBookingsPerMonth: 1000,
    maxAPICallsPerDay: 10000,
    customBranding: true,
    whiteLabel: false
  },
  owner: ownerId,
  admins: [ownerId],
  members: []
});

/**
 * Create test email template data
 */
export const createTestEmailTemplate = (propertyId?: mongoose.Types.ObjectId) => ({
  name: 'Test Booking Confirmation',
  type: 'booking_confirmation',
  subject: 'Your booking at {{propertyName}} is confirmed!',
  body: '<h1>Hello {{guestName}}!</h1><p>Your booking is confirmed.</p>',
  plainTextBody: 'Hello {{guestName}}! Your booking is confirmed.',
  status: 'active',
  language: 'en',
  variables: ['guestName', 'propertyName', 'checkInDate', 'checkOutDate'],
  property: propertyId,
  automation: {
    enabled: false,
    trigger: 'booking_created'
  },
  stats: {
    sent: 0,
    opened: 0,
    clicked: 0,
    bounced: 0
  }
});

/**
 * Wait for a specific duration (for async operations)
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Validate MongoDB ObjectId
 */
export const isValidObjectId = (id: string): boolean => {
  return mongoose.Types.ObjectId.isValid(id);
};
