import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import User from '../src/models/User';
import Property from '../src/models/Property';
import Booking from '../src/models/Booking';
import EmailTemplate from '../src/models/EmailTemplate';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  clearTestDatabase,
  generateTestToken,
  createTestUser,
  createTestProperty,
  createTestBooking,
  createTestEmailTemplate
} from './utils/testHelpers';

describe('Communication API Integration Tests', () => {
  let token: string;
  let userId: mongoose.Types.ObjectId;
  let propertyId: mongoose.Types.ObjectId;
  let roomId: mongoose.Types.ObjectId;
  let bookingId: mongoose.Types.ObjectId;

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

    // Create test booking
    const bookingData = createTestBooking(propertyId, roomId);
    const booking = new Booking(bookingData);
    await booking.save();
    bookingId = booking._id;
  });

  describe('POST /api/v1/communication/templates', () => {
    it('should create a new email template successfully', async () => {
      const templateData = {
        name: 'Booking Confirmation',
        type: 'booking_confirmation',
        subject: 'Your booking at {{propertyName}} is confirmed!',
        body: '<h1>Hello {{guestName}}!</h1><p>Your booking is confirmed.</p>',
        plainTextBody: 'Hello {{guestName}}! Your booking is confirmed.',
        status: 'active',
        language: 'en',
        variables: ['guestName', 'propertyName']
      };

      const response = await request(app)
        .post('/api/v1/communication/templates')
        .set('Authorization', `Bearer ${token}`)
        .send(templateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('Booking Confirmation');
      expect(response.body.data.type).toBe('booking_confirmation');
    });

    it('should fail to create template without authentication', async () => {
      const templateData = createTestEmailTemplate();

      const response = await request(app)
        .post('/api/v1/communication/templates')
        .send(templateData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should fail to create template with missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/communication/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incomplete Template' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/communication/templates', () => {
    it('should get all email templates', async () => {
      // Create multiple templates
      const template1 = new EmailTemplate(createTestEmailTemplate(propertyId));
      const template2 = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        name: 'Pre-Arrival Email',
        type: 'pre_arrival'
      });
      await template1.save();
      await template2.save();

      const response = await request(app)
        .get('/api/v1/communication/templates')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter templates by type', async () => {
      const template1 = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        type: 'booking_confirmation'
      });
      const template2 = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        type: 'pre_arrival',
        name: 'Pre-Arrival'
      });
      await template1.save();
      await template2.save();

      const response = await request(app)
        .get('/api/v1/communication/templates')
        .query({ type: 'booking_confirmation' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].type).toBe('booking_confirmation');
    });

    it('should filter templates by language', async () => {
      const template1 = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        language: 'en'
      });
      const template2 = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        language: 'es',
        name: 'Spanish Template'
      });
      await template1.save();
      await template2.save();

      const response = await request(app)
        .get('/api/v1/communication/templates')
        .query({ language: 'es' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].language).toBe('es');
    });
  });

  describe('GET /api/v1/communication/templates/:id', () => {
    it('should get template by ID', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const response = await request(app)
        .get(`/api/v1/communication/templates/${template._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(template._id.toString());
    });

    it('should return 404 for non-existent template', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/v1/communication/templates/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/communication/templates/:id', () => {
    it('should update template successfully', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const updates = {
        subject: 'Updated subject: Welcome to {{propertyName}}',
        status: 'inactive'
      };

      const response = await request(app)
        .put(`/api/v1/communication/templates/${template._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subject).toBe(updates.subject);
      expect(response.body.data.status).toBe('inactive');
    });
  });

  describe('DELETE /api/v1/communication/templates/:id', () => {
    it('should delete template successfully', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const response = await request(app)
        .delete(`/api/v1/communication/templates/${template._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify template is deleted
      const deletedTemplate = await EmailTemplate.findById(template._id);
      expect(deletedTemplate).toBeNull();
    });
  });

  describe('POST /api/v1/communication/templates/:id/clone', () => {
    it('should clone template successfully', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const response = await request(app)
        .post(`/api/v1/communication/templates/${template._id}/clone`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).not.toBe(template._id.toString());
      expect(response.body.data.name).toContain('Copy of');
    });
  });

  describe('POST /api/v1/communication/templates/:id/preview', () => {
    it('should preview template with sample data', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const variables = {
        guestName: 'John Doe',
        propertyName: 'Grand Hotel',
        checkInDate: '2025-10-20',
        checkOutDate: '2025-10-23'
      };

      const response = await request(app)
        .post(`/api/v1/communication/templates/${template._id}/preview`)
        .set('Authorization', `Bearer ${token}`)
        .send({ variables })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('subject');
      expect(response.body.data).toHaveProperty('body');
      expect(response.body.data.body).toContain('John Doe');
    });
  });

  describe('POST /api/v1/communication/templates/:id/test', () => {
    it('should send test email successfully', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const response = await request(app)
        .post(`/api/v1/communication/templates/${template._id}/test`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('messageId');
    });

    it('should fail without email address', async () => {
      const template = new EmailTemplate(createTestEmailTemplate(propertyId));
      await template.save();

      const response = await request(app)
        .post(`/api/v1/communication/templates/${template._id}/test`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/communication/templates/:id/stats', () => {
    it('should get template statistics', async () => {
      const template = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        stats: {
          sent: 100,
          opened: 75,
          clicked: 30,
          bounced: 5
        }
      });
      await template.save();

      const response = await request(app)
        .get(`/api/v1/communication/templates/${template._id}/stats`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sent).toBe(100);
      expect(response.body.data.opened).toBe(75);
      expect(response.body.data.openRate).toBeCloseTo(75);
      expect(response.body.data.clickRate).toBeCloseTo(30);
    });
  });

  describe('POST /api/v1/communication/send/booking-confirmation', () => {
    it('should send booking confirmation email', async () => {
      // Create template
      const template = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        type: 'booking_confirmation'
      });
      await template.save();

      const response = await request(app)
        .post('/api/v1/communication/send/booking-confirmation')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookingId: bookingId.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('messageId');
    });

    it('should fail with invalid booking ID', async () => {
      const response = await request(app)
        .post('/api/v1/communication/send/booking-confirmation')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookingId: new mongoose.Types.ObjectId().toString() })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/communication/send', () => {
    it('should send email with custom template type', async () => {
      // Create template
      const template = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        type: 'pre_arrival'
      });
      await template.save();

      const response = await request(app)
        .post('/api/v1/communication/send')
        .set('Authorization', `Bearer ${token}`)
        .send({
          templateType: 'pre_arrival',
          bookingId: bookingId.toString(),
          language: 'en'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should fail with missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/communication/send')
        .set('Authorization', `Bearer ${token}`)
        .send({ templateType: 'pre_arrival' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/communication/triggers/process', () => {
    it('should process automated triggers', async () => {
      // Create automated template
      const template = new EmailTemplate({
        ...createTestEmailTemplate(propertyId),
        automation: {
          enabled: true,
          trigger: 'booking_created',
          delayDays: 0
        }
      });
      await template.save();

      const response = await request(app)
        .post('/api/v1/communication/triggers/process')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('processed');
      expect(response.body.data).toHaveProperty('sent');
      expect(response.body.data).toHaveProperty('failed');
    });
  });
});
