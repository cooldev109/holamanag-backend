import bcrypt from 'bcrypt';
import User, { Role } from '../models/User';
import Property, { PropertyType, PropertyStatus, RoomType } from '../models/Property';
import Booking, { BookingStatus, BookingChannel } from '../models/Booking';
import RatePlan, { RatePlanType, RatePlanStatus, CancellationPolicy } from '../models/RatePlan';
import Calendar, { CalendarStatus, CalendarChannel } from '../models/Calendar';
import Channel, { ChannelType, ChannelStatus } from '../models/Channel';
import { logger } from '../config/logger';

/**
 * Comprehensive seed data for development and testing
 */
export class SeedData {
  /**
   * Seed all data
   */
  static async seedAll(): Promise<void> {
    try {
      logger.info('Starting comprehensive seed data creation...');

      // Check if data already exists
      const existingUsers = await User.countDocuments();
      if (existingUsers > 0) {
        logger.info('Data already exists, skipping seed data');
        return;
      }

      // Seed in order to maintain relationships
      await this.seedUsers();
      await this.seedProperties();
      await this.seedRatePlans();
      await this.seedChannels();
      await this.seedBookings();
      await this.seedCalendar();

      logger.info('Comprehensive seed data creation completed successfully');
    } catch (error) {
      logger.error('Error creating seed data:', error);
      throw error;
    }
  }

  /**
   * Seed users
   */
  static async seedUsers(): Promise<void> {
    try {
      logger.info('Creating seed users...');

      const defaultPassword = 'Password123!';
      const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12', 10);
      const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

      const users = [
        {
          email: 'superadmin@reservario.com',
          password: hashedPassword,
          profile: {
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+1234567890'
          },
          roles: [Role.SUPERADMIN],
          isActive: true,
          isEmailVerified: true
        },
        {
          email: 'admin@reservario.com',
          password: hashedPassword,
          profile: {
            firstName: 'System',
            lastName: 'Admin',
            phone: '+1234567891'
          },
          roles: [Role.ADMIN],
          isActive: true,
          isEmailVerified: true
        },
        {
          email: 'supervisor@reservario.com',
          password: hashedPassword,
          profile: {
            firstName: 'Property',
            lastName: 'Supervisor',
            phone: '+1234567892'
          },
          roles: [Role.SUPERVISOR],
          isActive: true,
          isEmailVerified: true
        },
        {
          email: 'client@reservario.com',
          password: hashedPassword,
          profile: {
            firstName: 'Property',
            lastName: 'Owner',
            phone: '+1234567893'
          },
          roles: [Role.CLIENT],
          isActive: true,
          isEmailVerified: true
        },
        {
          email: 'test@reservario.com',
          password: hashedPassword,
          profile: {
            firstName: 'Test',
            lastName: 'User',
            phone: '+1234567894'
          },
          roles: [Role.CLIENT],
          isActive: true,
          isEmailVerified: false
        }
      ];

      const createdUsers = await User.insertMany(users);
      logger.info(`Created ${createdUsers.length} seed users`);

      // Store user IDs for later use
      this.userIds = {
        superadmin: createdUsers[0]._id,
        admin: createdUsers[1]._id,
        supervisor: createdUsers[2]._id,
        client: createdUsers[3]._id,
        test: createdUsers[4]._id
      };

    } catch (error) {
      logger.error('Error creating seed users:', error);
      throw error;
    }
  }

  /**
   * Seed properties
   */
  static async seedProperties(): Promise<void> {
    try {
      logger.info('Creating seed properties...');

      const properties = [
        {
          name: 'Luxury Beach Resort',
          description: 'A stunning beachfront resort with world-class amenities and breathtaking ocean views.',
          propertyType: PropertyType.RESORT,
          address: {
            street: '123 Ocean Drive',
            city: 'Miami',
            state: 'Florida',
            country: 'United States',
            postalCode: '33101',
            coordinates: {
              latitude: 25.7617,
              longitude: -80.1918
            },
            timezone: 'America/New_York'
          },
          rooms: [
            {
              name: 'Ocean View Suite',
              type: RoomType.SUITE,
              capacity: { adults: 2, children: 2, infants: 1 },
              amenities: ['Ocean View', 'Balcony', 'Mini Bar', 'Room Service'],
              photos: ['https://example.com/suite1.jpg'],
              baseRate: 299,
              currency: 'USD',
              isActive: true,
              description: 'Spacious suite with panoramic ocean views',
              size: 65,
              floor: 5,
              view: 'Ocean',
              bedType: 'King',
              smokingAllowed: false,
              petFriendly: false
            },
            {
              name: 'Deluxe Room',
              type: RoomType.DELUXE,
              capacity: { adults: 2, children: 1, infants: 1 },
              amenities: ['City View', 'Work Desk', 'Coffee Machine'],
              photos: ['https://example.com/deluxe1.jpg'],
              baseRate: 199,
              currency: 'USD',
              isActive: true,
              description: 'Comfortable deluxe room with modern amenities',
              size: 35,
              floor: 3,
              view: 'City',
              bedType: 'Queen',
              smokingAllowed: false,
              petFriendly: false
            }
          ],
          amenities: ['Pool', 'Spa', 'Restaurant', 'Gym', 'Beach Access', 'WiFi', 'Parking'],
          photos: ['https://example.com/resort1.jpg', 'https://example.com/resort2.jpg'],
          status: PropertyStatus.ACTIVE,
          owner: this.userIds.client,
          manager: this.userIds.supervisor,
          contactInfo: {
            phone: '+13055551234',
            email: 'info@luxurybeachresort.com',
            website: 'https://luxurybeachresort.com'
          },
          policies: {
            checkInTime: '15:00',
            checkOutTime: '11:00',
            cancellationPolicy: 'Free cancellation up to 24 hours before check-in',
            houseRules: ['No smoking', 'No pets', 'Quiet hours after 10 PM'],
            petPolicy: 'Pets not allowed',
            smokingPolicy: 'Non-smoking property'
          },
          settings: {
            currency: 'USD',
            timezone: 'America/New_York',
            language: 'en',
            autoConfirmBookings: false,
            requireGuestVerification: true
          }
        },
        {
          name: 'Downtown Business Hotel',
          description: 'Modern business hotel in the heart of downtown with excellent connectivity.',
          propertyType: PropertyType.HOTEL,
          address: {
            street: '456 Business Ave',
            city: 'New York',
            state: 'New York',
            country: 'United States',
            postalCode: '10001',
            coordinates: {
              latitude: 40.7589,
              longitude: -73.9851
            },
            timezone: 'America/New_York'
          },
          rooms: [
            {
              name: 'Executive Suite',
              type: RoomType.EXECUTIVE,
              capacity: { adults: 2, children: 0, infants: 0 },
              amenities: ['City View', 'Work Desk', 'Meeting Room', 'Executive Lounge'],
              photos: ['https://example.com/executive1.jpg'],
              baseRate: 399,
              currency: 'USD',
              isActive: true,
              description: 'Executive suite for business travelers',
              size: 55,
              floor: 15,
              view: 'City',
              bedType: 'King',
              smokingAllowed: false,
              petFriendly: false
            },
            {
              name: 'Standard Room',
              type: RoomType.SINGLE,
              capacity: { adults: 1, children: 0, infants: 0 },
              amenities: ['City View', 'Work Desk', 'WiFi'],
              photos: ['https://example.com/standard1.jpg'],
              baseRate: 149,
              currency: 'USD',
              isActive: true,
              description: 'Comfortable standard room for business travelers',
              size: 25,
              floor: 8,
              view: 'City',
              bedType: 'Twin',
              smokingAllowed: false,
              petFriendly: false
            }
          ],
          amenities: ['Business Center', 'Meeting Rooms', 'Restaurant', 'Gym', 'WiFi', 'Parking'],
          photos: ['https://example.com/hotel1.jpg', 'https://example.com/hotel2.jpg'],
          status: PropertyStatus.ACTIVE,
          owner: this.userIds.client,
          manager: this.userIds.admin,
          contactInfo: {
            phone: '+12125551234',
            email: 'info@downtownbusiness.com',
            website: 'https://downtownbusiness.com'
          },
          policies: {
            checkInTime: '14:00',
            checkOutTime: '12:00',
            cancellationPolicy: 'Free cancellation up to 48 hours before check-in',
            houseRules: ['No smoking', 'Business attire preferred in common areas'],
            petPolicy: 'Pets not allowed',
            smokingPolicy: 'Non-smoking property'
          },
          settings: {
            currency: 'USD',
            timezone: 'America/New_York',
            language: 'en',
            autoConfirmBookings: true,
            requireGuestVerification: true
          }
        }
      ];

      const createdProperties = await Property.insertMany(properties);
      logger.info(`Created ${createdProperties.length} seed properties`);

      // Store property and room IDs for later use
      this.propertyIds = {
        resort: createdProperties[0]._id,
        hotel: createdProperties[1]._id
      };

      this.roomIds = {
        resortSuite: (createdProperties[0].rooms[0] as any).id,
        resortDeluxe: (createdProperties[0].rooms[1] as any).id,
        hotelExecutive: (createdProperties[1].rooms[0] as any).id,
        hotelStandard: (createdProperties[1].rooms[1] as any).id
      };

    } catch (error) {
      logger.error('Error creating seed properties:', error);
      throw error;
    }
  }

  /**
   * Seed rate plans
   */
  static async seedRatePlans(): Promise<void> {
    try {
      logger.info('Creating seed rate plans...');

      const ratePlans = [
        {
          property: this.propertyIds.resort,
          room: this.roomIds.resortSuite,
          name: 'Standard Rate',
          description: 'Standard rate for ocean view suite',
          type: RatePlanType.STANDARD,
          baseRate: 299,
          currency: 'USD',
          isRefundable: true,
          cancellationPolicy: CancellationPolicy.FREE_CANCELLATION,
          minStay: 1,
          maxStay: 30,
          includesBreakfast: false,
          includesTaxes: false,
          includesFees: false,
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2024-12-31'),
          status: RatePlanStatus.ACTIVE,
          priority: 1,
          createdBy: this.userIds.admin
        },
        {
          property: this.propertyIds.resort,
          room: this.roomIds.resortSuite,
          name: 'Summer Premium',
          description: 'Premium rate for summer season',
          type: RatePlanType.SEASONAL,
          baseRate: 399,
          currency: 'USD',
          isRefundable: true,
          cancellationPolicy: CancellationPolicy.PARTIAL_REFUND,
          minStay: 2,
          maxStay: 14,
          includesBreakfast: true,
          includesTaxes: false,
          includesFees: false,
          validFrom: new Date('2024-06-01'),
          validTo: new Date('2024-08-31'),
          status: RatePlanStatus.ACTIVE,
          priority: 2,
          seasonalRates: [
            {
              startDate: new Date('2024-06-01'),
              endDate: new Date('2024-08-31'),
              rate: 399
            }
          ],
          createdBy: this.userIds.admin
        },
        {
          property: this.propertyIds.hotel,
          room: this.roomIds.hotelExecutive,
          name: 'Corporate Rate',
          description: 'Special rate for corporate clients',
          type: RatePlanType.CORPORATE,
          baseRate: 299,
          currency: 'USD',
          isRefundable: true,
          cancellationPolicy: CancellationPolicy.FREE_CANCELLATION,
          minStay: 1,
          maxStay: 90,
          includesBreakfast: true,
          includesTaxes: true,
          includesFees: false,
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2024-12-31'),
          status: RatePlanStatus.ACTIVE,
          priority: 1,
          advanceBookingDiscounts: [
            {
              minDaysAdvance: 30,
              maxDaysAdvance: 365,
              discountType: 'percentage',
              discountValue: 15
            }
          ],
          createdBy: this.userIds.admin
        }
      ];

      const createdRatePlans = await RatePlan.insertMany(ratePlans);
      logger.info(`Created ${createdRatePlans.length} seed rate plans`);

    } catch (error) {
      logger.error('Error creating seed rate plans:', error);
      throw error;
    }
  }

  /**
   * Seed channels
   */
  static async seedChannels(): Promise<void> {
    try {
      logger.info('Creating seed channels...');

      const channels = [
        {
          name: 'Airbnb',
          type: ChannelType.AIRBNB,
          displayName: 'Airbnb',
          description: 'Airbnb channel integration',
          isActive: true,
          status: ChannelStatus.ACTIVE,
          apiCredentials: {
            apiKey: 'airbnb_api_key_123',
            apiSecret: 'airbnb_secret_456',
            webhookUrl: 'https://api.reservario.com/webhooks/airbnb',
            sandboxMode: true
          },
          syncSettings: {
            autoSync: true,
            syncInterval: 60,
            syncDirection: 'bidirectional',
            syncTypes: {
              bookings: true,
              rates: true,
              availability: true,
              propertyInfo: true
            },
            retryAttempts: 3,
            retryDelay: 5
          },
          performance: {
            totalBookings: 0,
            totalRevenue: 0,
            averageRating: 0,
            responseTime: 0,
            successRate: 0,
            lastUpdated: new Date()
          },
          rateParity: {
            enabled: true,
            tolerance: 5,
            checkInterval: 30,
            autoAdjust: false
          },
          properties: [this.propertyIds.resort, this.propertyIds.hotel],
          settings: {
            currency: 'USD',
            timezone: 'America/New_York',
            language: 'en',
            commissionRate: 3
          },
          createdBy: this.userIds.admin
        },
        {
          name: 'Booking.com',
          type: ChannelType.BOOKING,
          displayName: 'Booking.com',
          description: 'Booking.com channel integration',
          isActive: true,
          status: ChannelStatus.ACTIVE,
          apiCredentials: {
            apiKey: 'booking_api_key_789',
            apiSecret: 'booking_secret_012',
            webhookUrl: 'https://api.reservario.com/webhooks/booking',
            sandboxMode: true
          },
          syncSettings: {
            autoSync: true,
            syncInterval: 30,
            syncDirection: 'bidirectional',
            syncTypes: {
              bookings: true,
              rates: true,
              availability: true,
              propertyInfo: true
            },
            retryAttempts: 5,
            retryDelay: 3
          },
          performance: {
            totalBookings: 0,
            totalRevenue: 0,
            averageRating: 0,
            responseTime: 0,
            successRate: 0,
            lastUpdated: new Date()
          },
          rateParity: {
            enabled: true,
            tolerance: 3,
            checkInterval: 15,
            autoAdjust: true
          },
          properties: [this.propertyIds.resort, this.propertyIds.hotel],
          settings: {
            currency: 'USD',
            timezone: 'America/New_York',
            language: 'en',
            commissionRate: 15
          },
          createdBy: this.userIds.admin
        }
      ];

      const createdChannels = await Channel.insertMany(channels);
      logger.info(`Created ${createdChannels.length} seed channels`);

    } catch (error) {
      logger.error('Error creating seed channels:', error);
      throw error;
    }
  }

  /**
   * Seed bookings
   */
  static async seedBookings(): Promise<void> {
    try {
      logger.info('Creating seed bookings...');

      const bookings = [
        {
          property: this.propertyIds.resort,
          room: this.roomIds.resortSuite,
          guestInfo: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            phone: '+1234567890',
            nationality: 'American',
            documentType: 'passport',
            documentNumber: 'US123456789'
          },
          checkIn: new Date('2024-06-15'),
          checkOut: new Date('2024-06-18'),
          guests: { adults: 2, children: 1, infants: 0 },
          status: BookingStatus.CONFIRMED,
          channel: BookingChannel.AIRBNB,
          channelBookingId: 'AIRBNB_123456',
          channelConfirmationCode: 'ABC123',
          pricing: {
            baseRate: 897, // 299 * 3 nights
            taxes: 89.7,
            fees: 50,
            discounts: 0,
            total: 1036.7,
            currency: 'USD'
          },
          notes: 'Guest requested late check-in',
          specialRequests: ['Late check-in', 'Extra towels'],
          createdBy: this.userIds.admin
        },
        {
          property: this.propertyIds.hotel,
          room: this.roomIds.hotelExecutive,
          guestInfo: {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@company.com',
            phone: '+1987654321',
            nationality: 'Canadian',
            documentType: 'passport',
            documentNumber: 'CA987654321'
          },
          checkIn: new Date('2024-07-01'),
          checkOut: new Date('2024-07-03'),
          guests: { adults: 1, children: 0, infants: 0 },
          status: BookingStatus.PENDING,
          channel: BookingChannel.BOOKING,
          channelBookingId: 'BOOKING_789012',
          pricing: {
            baseRate: 598, // 299 * 2 nights
            taxes: 59.8,
            fees: 30,
            discounts: 89.7, // 15% advance booking discount
            total: 598.1,
            currency: 'USD'
          },
          notes: 'Corporate booking',
          specialRequests: ['Business center access'],
          createdBy: this.userIds.admin
        }
      ];

      const createdBookings = await Booking.insertMany(bookings);
      logger.info(`Created ${createdBookings.length} seed bookings`);

      // Store booking IDs for calendar
      this.bookingIds = {
        resortBooking: createdBookings[0]._id,
        hotelBooking: createdBookings[1]._id
      };

    } catch (error) {
      logger.error('Error creating seed bookings:', error);
      throw error;
    }
  }

  /**
   * Seed calendar
   */
  static async seedCalendar(): Promise<void> {
    try {
      logger.info('Creating seed calendar...');

      const calendarEntries = [];

      // Create calendar entries for the next 90 days
      // IMPORTANT: Create separate entries for each OTA channel
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      // OTA channels - Airbnb and Booking.com
      const otaChannels = [CalendarChannel.AIRBNB, CalendarChannel.BOOKING];

      for (let i = 0; i < 90; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);

        // Create inventory for each channel separately
        for (const channel of otaChannels) {
          // Resort suite - 2 units per channel
          for (let unit = 1; unit <= 2; unit++) {
            let status = CalendarStatus.AVAILABLE;
            let booking = undefined;

            // First unit on Airbnb is booked for first 3 days
            if (i < 3 && channel === CalendarChannel.AIRBNB && unit === 1) {
              status = CalendarStatus.BOOKED;
              booking = this.bookingIds.resortBooking;
            }

            calendarEntries.push({
              property: this.propertyIds.resort,
              room: this.roomIds.resortSuite,
              date: date,
              status: status,
              rate: channel === CalendarChannel.AIRBNB ? 299 : 295,
              currency: 'USD',
              minStay: 2,
              maxStay: 30,
              channel: channel,
              booking: booking
            });
          }

          // Resort deluxe room - 3 units per channel
          for (let unit = 1; unit <= 3; unit++) {
            calendarEntries.push({
              property: this.propertyIds.resort,
              room: this.roomIds.resortDeluxe,
              date: date,
              status: CalendarStatus.AVAILABLE,
              rate: channel === CalendarChannel.AIRBNB ? 199 : 195,
              currency: 'USD',
              minStay: 2,
              maxStay: 30,
              channel: channel
            });
          }

          // Hotel executive suite - 2 units per channel
          let hotelStatus = CalendarStatus.AVAILABLE;
          let hotelBooking = undefined;

          // First unit on Booking.com is booked for days 10-13
          if (i >= 10 && i < 13 && channel === CalendarChannel.BOOKING) {
            hotelStatus = CalendarStatus.BOOKED;
            hotelBooking = this.bookingIds.hotelBooking;
          }

          for (let unit = 1; unit <= 2; unit++) {
            const unitBooked = unit === 1 && hotelStatus === CalendarStatus.BOOKED;

            calendarEntries.push({
              property: this.propertyIds.hotel,
              room: this.roomIds.hotelExecutive,
              date: date,
              status: unitBooked ? CalendarStatus.BOOKED : CalendarStatus.AVAILABLE,
              rate: 299,
              currency: 'USD',
              minStay: 1,
              maxStay: 14,
              channel: channel,
              booking: unitBooked ? hotelBooking : undefined
            });
          }

          // Hotel standard room - 4 units per channel
          for (let unit = 1; unit <= 4; unit++) {
            calendarEntries.push({
              property: this.propertyIds.hotel,
              room: this.roomIds.hotelStandard,
              date: date,
              status: CalendarStatus.AVAILABLE,
              rate: channel === CalendarChannel.AIRBNB ? 149 : 145,
              currency: 'USD',
              minStay: 1,
              maxStay: 14,
              channel: channel
            });
          }
        }
      }

      // Add some blocked dates for maintenance
      const maintenanceDate = new Date();
      maintenanceDate.setDate(maintenanceDate.getDate() + 30);
      maintenanceDate.setHours(0, 0, 0, 0);

      calendarEntries.push({
        property: this.propertyIds.resort,
        room: this.roomIds.resortSuite,
        date: maintenanceDate,
        status: CalendarStatus.MAINTENANCE,
        blockReason: 'maintenance',
        blockDescription: 'Room maintenance and deep cleaning',
        channel: CalendarChannel.ALL
      });

      const createdCalendar = await Calendar.insertMany(calendarEntries);
      logger.info(`Created ${createdCalendar.length} seed calendar entries`);

    } catch (error) {
      logger.error('Error creating seed calendar:', error);
      throw error;
    }
  }

  /**
   * Clear all seed data
   */
  static async clearAllData(): Promise<void> {
    try {
      logger.warn('Clearing all seed data...');

      await Calendar.deleteMany({});
      await Booking.deleteMany({});
      await RatePlan.deleteMany({});
      await Channel.deleteMany({});
      await Property.deleteMany({});
      await User.deleteMany({});

      logger.warn('All seed data cleared successfully');
    } catch (error) {
      logger.error('Error clearing seed data:', error);
      throw error;
    }
  }

  /**
   * Get seed credentials for testing
   */
  static getSeedCredentials() {
    return {
      superadmin: {
        email: 'superadmin@reservario.com',
        password: 'Password123!',
        roles: [Role.SUPERADMIN]
      },
      admin: {
        email: 'admin@reservario.com',
        password: 'Password123!',
        roles: [Role.ADMIN]
      },
      supervisor: {
        email: 'supervisor@reservario.com',
        password: 'Password123!',
        roles: [Role.SUPERVISOR]
      },
      client: {
        email: 'client@reservario.com',
        password: 'Password123!',
        roles: [Role.CLIENT]
      },
      test: {
        email: 'test@reservario.com',
        password: 'Password123!',
        roles: [Role.CLIENT]
      }
    };
  }

  // Store IDs for relationships
  private static userIds: any = {};
  private static propertyIds: any = {};
  private static roomIds: any = {};
  private static bookingIds: any = {};
}

export default SeedData;