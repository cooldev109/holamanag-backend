export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export type Role = 'superadmin' | 'admin' | 'supervisor' | 'client';

export interface User {
  _id: string;
  email: string;
  password: string;
  roles: Role[];
  isActive: boolean;
  profile?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatar?: string;
  };
  preferences?: {
    language: 'en' | 'es' | 'de' | 'pt' | 'nl';
    timezone: string;
    notifications: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  roles: Role[];
  iat?: number;
  exp?: number;
}

export interface Property {
  _id: string;
  name: string;
  description: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  rooms: Room[];
  amenities: string[];
  images: string[];
  policies: {
    checkIn: string;
    checkOut: string;
    cancellation: string;
    houseRules: string[];
  };
  owner: string; // User ID
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Room {
  _id: string;
  name: string;
  type: 'single' | 'double' | 'suite' | 'apartment';
  capacity: number;
  amenities: string[];
  images: string[];
  basePrice: number;
  isActive: boolean;
}

export interface Booking {
  _id: string;
  property: string; // Property ID
  room: string; // Room ID
  guest: {
    name: string;
    email: string;
    phone: string;
  };
  checkIn: Date;
  checkOut: Date;
  guests: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  channel: string; // Channel ID
  channelBookingId?: string;
  specialRequests?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RatePlan {
  _id: string;
  name: string;
  property: string; // Property ID
  room: string; // Room ID
  basePrice: number;
  rules: {
    minStay?: number;
    maxStay?: number;
    advanceBooking?: number;
    cancellationPolicy: 'flexible' | 'moderate' | 'strict';
  };
  seasonalRates?: {
    startDate: Date;
    endDate: Date;
    multiplier: number;
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Calendar {
  _id: string;
  property: string; // Property ID
  room: string; // Room ID
  date: Date;
  availability: 'available' | 'blocked' | 'booked';
  price?: number;
  minStay?: number;
  maxStay?: number;
  restrictions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Channel {
  _id: string;
  name: string;
  type: 'airbnb' | 'booking' | 'expedia' | 'agoda' | 'vrbo' | 'mock';
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  isActive: boolean;
  syncSettings: {
    autoSync: boolean;
    syncInterval: number; // minutes
    lastSync?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  roles: Role[];
  profile?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
}


