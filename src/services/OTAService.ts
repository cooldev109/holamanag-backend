import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../config/logger';

export enum OTAProvider {
  AIRBNB = 'airbnb',
  BOOKING = 'booking',
  EXPEDIA = 'expedia',
  AGODA = 'agoda',
  VRBO = 'vrbo'
}

interface OTAConfig {
  baseURL: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

interface OTAResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

interface PropertyData {
  name: string;
  description: string;
  type: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
  amenities?: string[];
  images?: string[];
  checkInTime?: string;
  checkOutTime?: string;
}

interface BookingData {
  propertyId: string;
  roomId?: string;
  guestInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  checkIn: string;
  checkOut: string;
  guests: {
    adults: number;
    children: number;
  };
  pricing: {
    total: number;
    currency: string;
  };
}

interface CalendarUpdate {
  propertyId: string;
  roomId?: string;
  startDate: string;
  endDate: string;
  updates: {
    available?: boolean;
    rate?: number;
    minStay?: number;
    maxStay?: number;
  };
}

interface RateUpdate {
  propertyId: string;
  roomId?: string;
  date: string;
  rate: number;
  currency: string;
  minStay?: number;
  maxStay?: number;
}

class OTAService {
  private clients: Map<OTAProvider, AxiosInstance> = new Map();
  private config: Map<OTAProvider, OTAConfig> = new Map();

  constructor() {
    this.initializeClients();
  }

  /**
   * Initialize HTTP clients for each OTA provider
   */
  private initializeClients(): void {
    const baseURL = process.env.MOCK_OTA_URL || 'http://localhost:3001';
    const timeout = parseInt(process.env.OTA_TIMEOUT || '30000', 10);

    const providers = Object.values(OTAProvider);

    providers.forEach(provider => {
      const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] || `mock-${provider}-key-12345`;

      const config: OTAConfig = {
        baseURL,
        apiKey,
        timeout,
        retryAttempts: 3,
        retryDelay: 1000
      };

      this.config.set(provider, config);

      const client = axios.create({
        baseURL,
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      });

      // Request interceptor for logging
      client.interceptors.request.use(
        config => {
          logger.debug(`[OTA-${provider}] Request: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        error => {
          logger.error(`[OTA-${provider}] Request Error:`, error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for logging
      client.interceptors.response.use(
        response => {
          logger.debug(`[OTA-${provider}] Response: ${response.status} ${response.config.url}`);
          return response;
        },
        async error => {
          return this.handleResponseError(provider, error);
        }
      );

      this.clients.set(provider, client);
    });

    logger.info(`OTA Service initialized with ${providers.length} providers`);
  }

  /**
   * Handle response errors with retry logic
   */
  private async handleResponseError(provider: OTAProvider, error: AxiosError): Promise<any> {
    const config = this.config.get(provider);

    if (!config) {
      return Promise.reject(error);
    }

    // Log the error
    if (error.response) {
      logger.error(`[OTA-${provider}] Response Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`[OTA-${provider}] Request Error: No response received`);
    } else {
      logger.error(`[OTA-${provider}] Error: ${error.message}`);
    }

    // Retry logic for specific errors
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    const shouldRetry = error.response && retryableStatusCodes.includes(error.response.status);

    if (shouldRetry && error.config && !error.config.headers?.['x-retry-count']) {
      const retryCount = 0;
      error.config.headers = error.config.headers || {};
      error.config.headers['x-retry-count'] = retryCount;

      if (retryCount < config.retryAttempts!) {
        const delay = config.retryDelay! * Math.pow(2, retryCount); // Exponential backoff
        logger.info(`[OTA-${provider}] Retrying request in ${delay}ms (attempt ${retryCount + 1}/${config.retryAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));

        error.config.headers['x-retry-count'] = retryCount + 1;
        const client = this.clients.get(provider);
        return client!(error.config);
      }
    }

    return Promise.reject(error);
  }

  /**
   * Get HTTP client for a specific provider
   */
  private getClient(provider: OTAProvider): AxiosInstance {
    const client = this.clients.get(provider);
    if (!client) {
      throw new Error(`OTA client not found for provider: ${provider}`);
    }
    return client;
  }

  // ==================== PROPERTY OPERATIONS ====================

  /**
   * Create property on OTA
   */
  async createProperty(provider: OTAProvider, propertyData: PropertyData): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.post(`/api/${provider}/properties`, propertyData);
      logger.info(`[OTA-${provider}] Property created successfully`, { propertyId: response.data.data?.id });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to create property:`, error);
      throw error;
    }
  }

  /**
   * Update property on OTA
   */
  async updateProperty(provider: OTAProvider, propertyId: string, propertyData: Partial<PropertyData>): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.put(`/api/${provider}/properties/${propertyId}`, propertyData);
      logger.info(`[OTA-${provider}] Property updated successfully`, { propertyId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to update property:`, error);
      throw error;
    }
  }

  /**
   * Get property from OTA
   */
  async getProperty(provider: OTAProvider, propertyId: string): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.get(`/api/${provider}/properties/${propertyId}`);
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to get property:`, error);
      throw error;
    }
  }

  /**
   * List properties from OTA
   */
  async listProperties(provider: OTAProvider, params?: { page?: number; pageSize?: number; search?: string }): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.get(`/api/${provider}/properties`, { params });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to list properties:`, error);
      throw error;
    }
  }

  /**
   * Delete property from OTA
   */
  async deleteProperty(provider: OTAProvider, propertyId: string): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.delete(`/api/${provider}/properties/${propertyId}`);
      logger.info(`[OTA-${provider}] Property deleted successfully`, { propertyId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to delete property:`, error);
      throw error;
    }
  }

  // ==================== BOOKING OPERATIONS ====================

  /**
   * Create booking on OTA
   */
  async createBooking(provider: OTAProvider, bookingData: BookingData): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'reservations' : 'bookings';
      const response = await client.post(`/api/${provider}/${endpoint}`, bookingData);
      logger.info(`[OTA-${provider}] Booking created successfully`, { bookingId: response.data.data?.id });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to create booking:`, error);
      throw error;
    }
  }

  /**
   * Update booking on OTA
   */
  async updateBooking(provider: OTAProvider, bookingId: string, bookingData: Partial<BookingData>): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'reservations' : 'bookings';
      const response = await client.put(`/api/${provider}/${endpoint}/${bookingId}`, bookingData);
      logger.info(`[OTA-${provider}] Booking updated successfully`, { bookingId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to update booking:`, error);
      throw error;
    }
  }

  /**
   * Get booking from OTA
   */
  async getBooking(provider: OTAProvider, bookingId: string): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'reservations' : 'bookings';
      const response = await client.get(`/api/${provider}/${endpoint}/${bookingId}`);
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to get booking:`, error);
      throw error;
    }
  }

  /**
   * List bookings from OTA
   */
  async listBookings(provider: OTAProvider, params?: { page?: number; pageSize?: number; status?: string }): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'reservations' : 'bookings';
      const response = await client.get(`/api/${provider}/${endpoint}`, { params });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to list bookings:`, error);
      throw error;
    }
  }

  /**
   * Cancel booking on OTA
   */
  async cancelBooking(provider: OTAProvider, bookingId: string): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'reservations' : 'bookings';
      const response = await client.delete(`/api/${provider}/${endpoint}/${bookingId}`);
      logger.info(`[OTA-${provider}] Booking cancelled successfully`, { bookingId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to cancel booking:`, error);
      throw error;
    }
  }

  // ==================== CALENDAR OPERATIONS ====================

  /**
   * Update calendar on OTA
   */
  async updateCalendar(provider: OTAProvider, updates: CalendarUpdate): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'availability' : 'calendar';
      const response = await client.post(`/api/${provider}/${endpoint}`, updates);
      logger.info(`[OTA-${provider}] Calendar updated successfully`, { propertyId: updates.propertyId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to update calendar:`, error);
      throw error;
    }
  }

  /**
   * Get calendar from OTA
   */
  async getCalendar(provider: OTAProvider, params: { propertyId: string; startDate: string; endDate: string; roomId?: string }): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const endpoint = provider === OTAProvider.BOOKING ? 'availability' : 'calendar';
      const response = await client.get(`/api/${provider}/${endpoint}`, { params });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to get calendar:`, error);
      throw error;
    }
  }

  // ==================== RATE OPERATIONS ====================

  /**
   * Update rates on OTA
   */
  async updateRate(provider: OTAProvider, rateData: RateUpdate): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.post(`/api/${provider}/rates`, rateData);
      logger.info(`[OTA-${provider}] Rate updated successfully`, { propertyId: rateData.propertyId });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to update rate:`, error);
      throw error;
    }
  }

  /**
   * Get rates from OTA
   */
  async getRates(provider: OTAProvider, params: { propertyId: string; startDate?: string; endDate?: string; roomId?: string }): Promise<OTAResponse> {
    try {
      const client = this.getClient(provider);
      const response = await client.get(`/api/${provider}/rates`, { params });
      return response.data;
    } catch (error) {
      logger.error(`[OTA-${provider}] Failed to get rates:`, error);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Sync property to multiple OTAs
   */
  async syncPropertyToOTAs(propertyData: PropertyData, providers: OTAProvider[]): Promise<Record<string, OTAResponse | Error>> {
    const results: Record<string, OTAResponse | Error> = {};

    await Promise.allSettled(
      providers.map(async provider => {
        try {
          const result = await this.createProperty(provider, propertyData);
          results[provider] = result;
        } catch (error) {
          results[provider] = error as Error;
        }
      })
    );

    return results;
  }

  /**
   * Sync booking to multiple OTAs
   */
  async syncBookingToOTAs(bookingData: BookingData, providers: OTAProvider[]): Promise<Record<string, OTAResponse | Error>> {
    const results: Record<string, OTAResponse | Error> = {};

    await Promise.allSettled(
      providers.map(async provider => {
        try {
          const result = await this.createBooking(provider, bookingData);
          results[provider] = result;
        } catch (error) {
          results[provider] = error as Error;
        }
      })
    );

    return results;
  }

  /**
   * Get OTA provider status
   */
  async getProviderStatus(provider: OTAProvider): Promise<{ available: boolean; responseTime?: number; error?: string }> {
    const startTime = Date.now();

    try {
      const client = this.getClient(provider);
      await client.get('/health');
      const responseTime = Date.now() - startTime;

      return {
        available: true,
        responseTime
      };
    } catch (error) {
      return {
        available: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Get all OTA providers status
   */
  async getAllProvidersStatus(): Promise<Record<string, { available: boolean; responseTime?: number; error?: string }>> {
    const providers = Object.values(OTAProvider);
    const results: Record<string, { available: boolean; responseTime?: number; error?: string }> = {};

    await Promise.allSettled(
      providers.map(async provider => {
        results[provider] = await this.getProviderStatus(provider);
      })
    );

    return results;
  }
}

// Singleton instance
export const otaService = new OTAService();
export default otaService;
