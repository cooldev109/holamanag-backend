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

describe('Booking API Integration Tests', () => {
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
  });

  describe('POST /api/v1/bookings', () => {
    it('should create a new booking successfully', async () => {
      const bookingData = createTestBooking(propertyId, roomId);

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.guestInfo.email).toBe(bookingData.guestInfo.email);
      expect(response.body.data.status).toBe('confirmed');
    });

    it('should fail to create booking without authentication', async () => {
      const bookingData = createTestBooking(propertyId, roomId);

      const response = await request(app)
        .post('/api/v1/bookings')
        .send(bookingData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should fail to create booking with missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ property: propertyId })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should fail to create booking with invalid property ID', async () => {
      const bookingData = createTestBooking(new mongoose.Types.ObjectId(), roomId);

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingData)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/bookings', () => {
    it('should get all bookings for authenticated user', async () => {
      // Create multiple bookings
      const booking1 = new Booking(createTestBooking(propertyId, roomId));
      const booking2 = new Booking(createTestBooking(propertyId, roomId));
      await booking1.save();
      await booking2.save();

      const response = await request(app)
        .get('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter bookings by status', async () => {
      const booking1 = new Booking({
        ...createTestBooking(propertyId, roomId),
        status: 'confirmed'
      });
      const booking2 = new Booking({
        ...createTestBooking(propertyId, roomId),
        status: 'cancelled'
      });
      await booking1.save();
      await booking2.save();

      const response = await request(app)
        .get('/api/v1/bookings')
        .query({ status: 'confirmed' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('confirmed');
    });

    it('should filter bookings by date range', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30);
      const booking = new Booking({
        ...createTestBooking(propertyId, roomId),
        checkIn: futureDate
      });
      await booking.save();

      const response = await request(app)
        .get('/api/v1/bookings')
        .query({
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000 * 60).toISOString()
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/bookings/:id', () => {
    it('should get a specific booking by ID', async () => {
      const booking = new Booking(createTestBooking(propertyId, roomId));
      await booking.save();

      const response = await request(app)
        .get(`/api/v1/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(booking._id.toString());
      expect(response.body.data.guestInfo.email).toBe(booking.guestInfo.email);
    });

    it('should return 404 for non-existent booking', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/v1/bookings/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/bookings/:id', () => {
    it('should update a booking successfully', async () => {
      const booking = new Booking(createTestBooking(propertyId, roomId));
      await booking.save();

      const updates = {
        guestInfo: {
          ...booking.guestInfo,
          phone: '+9876543210'
        }
      };

      const response = await request(app)
        .put(`/api/v1/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.guestInfo.phone).toBe('+9876543210');
    });

    it('should update booking status', async () => {
      const booking = new Booking(createTestBooking(propertyId, roomId));
      await booking.save();

      const response = await request(app)
        .put(`/api/v1/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'checked-in' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('checked-in');
    });
  });

  describe('DELETE /api/v1/bookings/:id (Cancel)', () => {
    it('should cancel a booking successfully', async () => {
      const booking = new Booking(createTestBooking(propertyId, roomId));
      await booking.save();

      const response = await request(app)
        .delete(`/api/v1/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancellationReason: 'Guest request' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancellationReason).toBe('Guest request');
    });
  });

  describe('POST /api/v1/bookings/:id/check-in', () => {
    it('should check in a booking successfully', async () => {
      const booking = new Booking({
        ...createTestBooking(propertyId, roomId),
        checkIn: new Date() // Today
      });
      await booking.save();

      const response = await request(app)
        .post(`/api/v1/bookings/${booking._id}/check-in`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('checked-in');
      expect(response.body.data).toHaveProperty('checkedInAt');
    });
  });

  describe('POST /api/v1/bookings/:id/check-out', () => {
    it('should check out a booking successfully', async () => {
      const booking = new Booking({
        ...createTestBooking(propertyId, roomId),
        status: 'checked-in',
        checkedInAt: new Date()
      });
      await booking.save();

      const response = await request(app)
        .post(`/api/v1/bookings/${booking._id}/check-out`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('checked-out');
      expect(response.body.data).toHaveProperty('checkedOutAt');
    });
  });

  describe('Guest Booking Flow (No Auth)', () => {
    it('should create a guest booking without authentication', async () => {
      const bookingData = createTestBooking(propertyId, roomId);

      const response = await request(app)
        .post('/api/v1/guest/bookings')
        .send(bookingData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.channel).toBe('direct');
    });

    it('should get booking by confirmation code', async () => {
      const booking = new Booking({
        ...createTestBooking(propertyId, roomId),
        channelConfirmationCode: 'TEST123'
      });
      await booking.save();

      const response = await request(app)
        .get(`/api/v1/guest/bookings/${booking._id}`)
        .query({ confirmationCode: 'TEST123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(booking._id.toString());
    });
  });
});
