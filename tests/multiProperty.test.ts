import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';
import User from '../src/models/User';
import Property from '../src/models/Property';
import Organization from '../src/models/Organization';
import PropertyGroup from '../src/models/PropertyGroup';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  clearTestDatabase,
  generateTestToken,
  createTestUser,
  createTestProperty,
  createTestOrganization
} from './utils/testHelpers';

describe('Multi-Property API Integration Tests', () => {
  let token: string;
  let userId: mongoose.Types.ObjectId;
  let organizationId: mongoose.Types.ObjectId;
  let property1Id: mongoose.Types.ObjectId;
  let property2Id: mongoose.Types.ObjectId;

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

    // Create test organization
    const orgData = createTestOrganization(userId);
    const organization = new Organization(orgData);
    await organization.save();
    organizationId = organization._id;

    // Create test properties
    const property1Data = {
      ...createTestProperty(userId),
      organization: organizationId
    };
    const property1 = new Property(property1Data);
    await property1.save();
    property1Id = property1._id;

    const property2Data = {
      ...createTestProperty(userId),
      name: 'Test Hotel 2',
      organization: organizationId
    };
    const property2 = new Property(property2Data);
    await property2.save();
    property2Id = property2._id;
  });

  describe('POST /api/v1/multi-property/organizations', () => {
    it('should create a new organization successfully', async () => {
      const orgData = {
        name: 'New Organization',
        type: 'hotel_chain',
        subscription: {
          plan: 'starter',
          startDate: new Date(),
          isActive: true
        }
      };

      const response = await request(app)
        .post('/api/v1/multi-property/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send(orgData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('New Organization');
      expect(response.body.data.type).toBe('hotel_chain');
    });

    it('should fail to create organization without authentication', async () => {
      const orgData = {
        name: 'New Organization',
        type: 'hotel_chain'
      };

      const response = await request(app)
        .post('/api/v1/multi-property/organizations')
        .send(orgData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/multi-property/organizations', () => {
    it('should get all organizations for user', async () => {
      const response = await request(app)
        .get('/api/v1/multi-property/organizations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/multi-property/organizations/:id', () => {
    it('should get organization by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/multi-property/organizations/${organizationId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(organizationId.toString());
      expect(response.body.data).toHaveProperty('subscription');
    });
  });

  describe('GET /api/v1/multi-property/organizations/:id/summary', () => {
    it('should get organization summary with properties and stats', async () => {
      const response = await request(app)
        .get(`/api/v1/multi-property/organizations/${organizationId}/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('organization');
      expect(response.body.data).toHaveProperty('totalProperties');
      expect(response.body.data.totalProperties).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /api/v1/multi-property/groups', () => {
    it('should create a new property group successfully', async () => {
      const groupData = {
        name: 'City Center Group',
        organization: organizationId.toString(),
        manager: userId.toString(),
        settings: {
          allowCrossPropertyBooking: true,
          sharedInventory: false,
          centralizedRateManagement: true,
          autoSync: true
        }
      };

      const response = await request(app)
        .post('/api/v1/multi-property/groups')
        .set('Authorization', `Bearer ${token}`)
        .send(groupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('City Center Group');
      expect(response.body.data.settings.allowCrossPropertyBooking).toBe(true);
    });
  });

  describe('POST /api/v1/multi-property/groups/:id/properties', () => {
    it('should add property to group successfully', async () => {
      // Create property group
      const group = new PropertyGroup({
        name: 'Test Group',
        organization: organizationId,
        properties: [],
        manager: userId,
        status: 'active'
      });
      await group.save();

      const response = await request(app)
        .post(`/api/v1/multi-property/groups/${group._id}/properties`)
        .set('Authorization', `Bearer ${token}`)
        .send({ propertyId: property1Id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.properties).toContain(property1Id.toString());
    });
  });

  describe('DELETE /api/v1/multi-property/groups/:id/properties/:propertyId', () => {
    it('should remove property from group successfully', async () => {
      // Create property group with property
      const group = new PropertyGroup({
        name: 'Test Group',
        organization: organizationId,
        properties: [property1Id],
        manager: userId,
        status: 'active'
      });
      await group.save();

      const response = await request(app)
        .delete(`/api/v1/multi-property/groups/${group._id}/properties/${property1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.properties).not.toContain(property1Id.toString());
    });
  });

  describe('GET /api/v1/multi-property/analytics', () => {
    it('should get cross-property analytics for organization', async () => {
      const response = await request(app)
        .get('/api/v1/multi-property/analytics')
        .query({ organizationId: organizationId.toString() })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalProperties');
      expect(response.body.data).toHaveProperty('totalRooms');
      expect(response.body.data).toHaveProperty('properties');
    });

    it('should get analytics for property group', async () => {
      // Create property group
      const group = new PropertyGroup({
        name: 'Test Group',
        organization: organizationId,
        properties: [property1Id, property2Id],
        manager: userId,
        status: 'active'
      });
      await group.save();

      const response = await request(app)
        .get('/api/v1/multi-property/analytics')
        .query({ propertyGroupId: group._id.toString() })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalProperties).toBe(2);
    });
  });

  describe('POST /api/v1/multi-property/analytics/compare', () => {
    it('should compare multiple properties', async () => {
      const response = await request(app)
        .post('/api/v1/multi-property/analytics/compare')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyIds: [property1Id.toString(), property2Id.toString()],
          range: 'last_30_days'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0]).toHaveProperty('propertyId');
      expect(response.body.data[0]).toHaveProperty('revenue');
      expect(response.body.data[0]).toHaveProperty('occupancy');
    });
  });

  describe('POST /api/v1/multi-property/bulk/rates', () => {
    it('should bulk update rates across properties', async () => {
      const response = await request(app)
        .post('/api/v1/multi-property/bulk/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyIds: [property1Id.toString(), property2Id.toString()],
          rateAdjustment: {
            type: 'percentage',
            value: 10,
            applyTo: 'all'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('successCount');
      expect(response.body.data).toHaveProperty('failureCount');
      expect(response.body.data.successCount).toBeGreaterThan(0);
    });

    it('should handle fixed amount rate adjustment', async () => {
      const response = await request(app)
        .post('/api/v1/multi-property/bulk/rates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyIds: [property1Id.toString()],
          rateAdjustment: {
            type: 'fixed',
            value: 20,
            applyTo: 'all'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.successCount).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/multi-property/bulk/availability', () => {
    it('should bulk update availability across properties', async () => {
      const startDate = new Date();
      const endDate = new Date(Date.now() + 86400000 * 30); // 30 days

      const response = await request(app)
        .post('/api/v1/multi-property/bulk/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyIds: [property1Id.toString(), property2Id.toString()],
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          status: 'available'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('successCount');
    });
  });

  describe('POST /api/v1/multi-property/bulk/settings', () => {
    it('should bulk update settings across properties', async () => {
      const response = await request(app)
        .post('/api/v1/multi-property/bulk/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          propertyIds: [property1Id.toString(), property2Id.toString()],
          settings: {
            policies: {
              checkInTime: '15:00',
              checkOutTime: '11:00',
              cancellationPolicy: 'Free cancellation up to 24 hours before check-in'
            }
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.successCount).toBe(2);
    });
  });
});
