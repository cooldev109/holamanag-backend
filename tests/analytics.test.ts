import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import User from '../src/models/User';
import Property from '../src/models/Property';
import Booking from '../src/models/Booking';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  clearTestDatabase,
  generateTestToken,
  createTestUser,
  createTestProperty,
  createTestBooking
} from './utils/testHelpers';

describe('Analytics API Integration Tests', () => {
  let token: string;
  let userId: mongoose.Types.ObjectId;
  let propertyId: mongoose.Types.ObjectId;
  let roomId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // Create test user
    const userData = createTestUser();
    userId = userData._id;
    const user = new User(userData);
    await user.save();

    // Generate token
    token = generateTestToken(userId.toString());

    // Create test property
    const propertyData = createTestProperty(userId);
    const property = new Property(propertyData);
    await property.save();
    propertyId = property._id;
    roomId = property.rooms[0]._id;

    // Create sample bookings for analytics
    const booking1 = new Booking({
      ...createTestBooking(propertyId, roomId),
      checkIn: new Date('2025-01-01'),
      checkOut: new Date('2025-01-05'),
      status: 'checked-out',
      pricing: {
        baseRate: 150,
        taxes: 30,
        fees: 20,
        discounts: 0,
        total: 600,
        currency: 'USD'
      }
    });

    const booking2 = new Booking({
      ...createTestBooking(propertyId, roomId),
      checkIn: new Date('2025-01-10'),
      checkOut: new Date('2025-01-13'),
      status: 'confirmed',
      pricing: {
        baseRate: 150,
        taxes: 30,
        fees: 20,
        discounts: 50,
        total: 400,
        currency: 'USD'
      }
    });

    await booking1.save();
    await booking2.save();
  });

  describe('GET /api/v1/analytics/revenue', () => {
    it('should get revenue breakdown for property', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
      expect(response.body.data).toHaveProperty('averageDailyRate');
      expect(response.body.data).toHaveProperty('revenueByChannel');
      expect(response.body.data).toHaveProperty('revenueByRoomType');
    });

    it('should filter revenue by custom date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .query({
          propertyId: propertyId.toString(),
          range: 'custom',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
    });

    it('should return revenue for multiple channels', async () => {
      // Create booking from different channel
      const airbnbBooking = new Booking({
        ...createTestBooking(propertyId, roomId),
        channel: 'airbnb',
        checkIn: new Date('2025-01-15'),
        checkOut: new Date('2025-01-18'),
        pricing: {
          baseRate: 150,
          taxes: 30,
          fees: 20,
          discounts: 0,
          total: 450,
          currency: 'USD'
        }
      });
      await airbnbBooking.save();

      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.revenueByChannel).toBeInstanceOf(Array);
      expect(response.body.data.revenueByChannel.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/analytics/occupancy', () => {
    it('should get occupancy metrics for property', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/occupancy')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('occupancyRate');
      expect(response.body.data).toHaveProperty('totalRooms');
      expect(response.body.data).toHaveProperty('occupiedRoomNights');
      expect(response.body.data).toHaveProperty('availableRoomNights');
    });

    it('should calculate occupancy rate correctly', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/occupancy')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.occupancyRate).toBeGreaterThanOrEqual(0);
      expect(response.body.data.occupancyRate).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/v1/analytics/bookings', () => {
    it('should get booking statistics for property', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/bookings')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalBookings');
      expect(response.body.data).toHaveProperty('confirmedBookings');
      expect(response.body.data).toHaveProperty('cancelledBookings');
      expect(response.body.data).toHaveProperty('cancellationRate');
      expect(response.body.data).toHaveProperty('averageLeadTime');
      expect(response.body.data).toHaveProperty('averageStayDuration');
    });

    it('should group bookings by status', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/bookings')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('bookingsByStatus');
      expect(response.body.data.bookingsByStatus).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/analytics/guests', () => {
    it('should get guest demographics and statistics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/guests')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalGuests');
      expect(response.body.data).toHaveProperty('uniqueGuests');
      expect(response.body.data).toHaveProperty('repeatGuestRate');
      expect(response.body.data).toHaveProperty('guestsByNationality');
    });

    it('should calculate repeat guest rate', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/guests')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repeatGuestRate).toBeGreaterThanOrEqual(0);
      expect(response.body.data.repeatGuestRate).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/v1/analytics/revenue-forecast', () => {
    it('should forecast revenue for next 30 days', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query({ propertyId: propertyId.toString(), days: 30 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('confirmedRevenue');
      expect(response.body.data).toHaveProperty('projectedRevenue');
      expect(response.body.data).toHaveProperty('forecastByDay');
      expect(response.body.data.forecastByDay).toBeInstanceOf(Array);
    });

    it('should forecast revenue for next 90 days', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue-forecast')
        .query({ propertyId: propertyId.toString(), days: 90 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.forecastByDay.length).toBe(90);
    });
  });

  describe('POST /api/v1/analytics/export', () => {
    it('should export analytics data as CSV', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyId: propertyId.toString(),
          dataType: 'revenue',
          format: 'csv',
          range: 'last_30_days'
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should export analytics data as JSON', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/export')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyId: propertyId.toString(),
          dataType: 'bookings',
          format: 'json',
          range: 'last_30_days'
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('GET /api/v1/analytics/performance', () => {
    it('should get overall performance metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .query({ propertyId: propertyId.toString(), range: 'last_30_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('revPAR'); // Revenue per Available Room
      expect(response.body.data).toHaveProperty('ADR'); // Average Daily Rate
      expect(response.body.data).toHaveProperty('occupancyRate');
      expect(response.body.data).toHaveProperty('totalRevenue');
    });

    it('should compare metrics with previous period', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .query({
          propertyId: propertyId.toString(),
          range: 'last_30_days',
          compare: true
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('comparison');
      expect(response.body.data.comparison).toHaveProperty('revenueChange');
      expect(response.body.data.comparison).toHaveProperty('occupancyChange');
    });
  });

  describe('GET /api/v1/analytics/trends', () => {
    it('should get booking trends over time', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/trends')
        .query({ propertyId: propertyId.toString(), range: 'last_90_days' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('revenueTrend');
      expect(response.body.data).toHaveProperty('occupancyTrend');
      expect(response.body.data).toHaveProperty('bookingsTrend');
      expect(response.body.data.revenueTrend).toBeInstanceOf(Array);
    });
  });

  describe('Analytics Error Handling', () => {
    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .query({ propertyId: propertyId.toString() })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should fail with invalid property ID', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .query({ propertyId: 'invalid-id' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should fail with missing required parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
