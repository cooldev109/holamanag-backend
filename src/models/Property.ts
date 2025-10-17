import mongoose, { Document, Schema, Model } from 'mongoose';

// Property type enum
export enum PropertyType {
  HOTEL = 'hotel',
  APARTMENT = 'apartment',
  HOUSE = 'house',
  VILLA = 'villa',
  HOSTEL = 'hostel',
  RESORT = 'resort',
  BED_AND_BREAKFAST = 'bed_and_breakfast',
  GUESTHOUSE = 'guesthouse'
}

// Room type enum
export enum RoomType {
  SINGLE = 'single',
  DOUBLE = 'double',
  TWIN = 'twin',
  SUITE = 'suite',
  FAMILY = 'family',
  DELUXE = 'deluxe',
  EXECUTIVE = 'executive',
  PRESIDENTIAL = 'presidential'
}

// Property status enum
export enum PropertyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  SUSPENDED = 'suspended'
}

// Room interface
export interface IRoom {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: RoomType;
  capacity: {
    adults: number;
    children: number;
    infants: number;
  };
  amenities: string[];
  photos: string[];
  baseRate: number;
  currency: string;
  isActive: boolean;
  description?: string;
  size?: number; // in square meters
  floor?: number;
  view?: string;
  bedType?: string;
  smokingAllowed?: boolean;
  petFriendly?: boolean;
}

// Address interface
export interface IAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  timezone?: string;
  neighborhood?: string;
  landmark?: string;
}

// Property interface extending Document
export interface IProperty extends Document {
  name: string;
  description: string;
  propertyType: PropertyType;
  address: IAddress;
  rooms: IRoom[];
  amenities: string[];
  photos: string[];
  status: PropertyStatus;
  owner: mongoose.Types.ObjectId; // User reference
  manager: mongoose.Types.ObjectId; // User reference
  organization?: mongoose.Types.ObjectId; // Organization reference (optional for multi-property management)
  propertyGroup?: mongoose.Types.ObjectId; // Property group reference (optional)
  contactInfo: {
    phone: string;
    email: string;
    website?: string;
  };
  policies: {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    houseRules: string[];
    petPolicy?: string;
    smokingPolicy?: string;
  };
  settings: {
    currency: string;
    timezone: string;
    language: string;
    autoConfirmBookings: boolean;
    requireGuestVerification: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  getAvailableRooms(_checkIn: Date, _checkOut: Date): IRoom[];
  updateAvailability(roomId: string, isAvailable: boolean): Promise<void>;
  toJSON(): any;
}

// Room schema
const roomSchema = new Schema<IRoom>({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [100, 'Room name cannot exceed 100 characters']
  },
  type: {
    type: String,
    enum: Object.values(RoomType),
    required: [true, 'Room type is required']
  },
  capacity: {
    adults: {
      type: Number,
      required: [true, 'Adult capacity is required'],
      min: [1, 'Adult capacity must be at least 1'],
      max: [20, 'Adult capacity cannot exceed 20']
    },
    children: {
      type: Number,
      default: 0,
      min: [0, 'Children capacity cannot be negative'],
      max: [10, 'Children capacity cannot exceed 10']
    },
    infants: {
      type: Number,
      default: 0,
      min: [0, 'Infant capacity cannot be negative'],
      max: [5, 'Infant capacity cannot exceed 5']
    }
  },
  amenities: [{
    type: String,
    trim: true
  }],
  photos: [{
    type: String,
    trim: true
  }],
  baseRate: {
    type: Number,
    required: [true, 'Base rate is required'],
    min: [0, 'Base rate cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'USD',
    uppercase: true,
    length: [3, 'Currency must be 3 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Room description cannot exceed 500 characters']
  },
  size: {
    type: Number,
    min: [1, 'Room size must be at least 1 square meter']
  },
  floor: {
    type: Number,
    min: [0, 'Floor cannot be negative']
  },
  view: {
    type: String,
    trim: true
  },
  bedType: {
    type: String,
    trim: true
  },
  smokingAllowed: {
    type: Boolean,
    default: false
  },
  petFriendly: {
    type: Boolean,
    default: false
  }
}, { _id: true });

// Address schema
const addressSchema = new Schema<IAddress>({
  street: {
    type: String,
    required: [true, 'Street address is required'],
    trim: true,
    maxlength: [200, 'Street address cannot exceed 200 characters']
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [100, 'City name cannot exceed 100 characters']
  },
  state: {
    type: String,
    required: [true, 'State is required'],
    trim: true,
    maxlength: [100, 'State name cannot exceed 100 characters']
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
    maxlength: [100, 'Country name cannot exceed 100 characters']
  },
  postalCode: {
    type: String,
    required: [true, 'Postal code is required'],
    trim: true,
    maxlength: [20, 'Postal code cannot exceed 20 characters']
  },
  coordinates: {
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  timezone: {
    type: String,
    trim: true
  },
  neighborhood: {
    type: String,
    trim: true,
    maxlength: [100, 'Neighborhood name cannot exceed 100 characters']
  },
  landmark: {
    type: String,
    trim: true,
    maxlength: [200, 'Landmark description cannot exceed 200 characters']
  }
}, { _id: false });

// Property schema definition
const propertySchema = new Schema<IProperty>({
  name: {
    type: String,
    required: [true, 'Property name is required'],
    trim: true,
    maxlength: [200, 'Property name cannot exceed 200 characters'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Property description is required'],
    trim: true,
    maxlength: [2000, 'Property description cannot exceed 2000 characters']
  },
  propertyType: {
    type: String,
    enum: Object.values(PropertyType),
    required: [true, 'Property type is required'],
    index: true
  },
  address: {
    type: addressSchema,
    required: [true, 'Property address is required']
  },
  rooms: [roomSchema],
  amenities: [{
    type: String,
    trim: true
  }],
  photos: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: Object.values(PropertyStatus),
    default: PropertyStatus.ACTIVE,
    index: true
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Property owner is required'],
    index: true
  },
  manager: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Property manager is required'],
    index: true
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  propertyGroup: {
    type: Schema.Types.ObjectId,
    ref: 'PropertyGroup',
    index: true
  },
  contactInfo: {
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, 'Please provide a valid website URL']
    }
  },
  policies: {
    checkInTime: {
      type: String,
      required: [true, 'Check-in time is required'],
      default: '15:00',
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)']
    },
    checkOutTime: {
      type: String,
      required: [true, 'Check-out time is required'],
      default: '11:00',
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide a valid time format (HH:MM)']
    },
    cancellationPolicy: {
      type: String,
      required: [true, 'Cancellation policy is required'],
      trim: true,
      maxlength: [1000, 'Cancellation policy cannot exceed 1000 characters']
    },
    houseRules: [{
      type: String,
      trim: true,
      maxlength: [200, 'House rule cannot exceed 200 characters']
    }],
    petPolicy: {
      type: String,
      trim: true,
      maxlength: [500, 'Pet policy cannot exceed 500 characters']
    },
    smokingPolicy: {
      type: String,
      trim: true,
      maxlength: [500, 'Smoking policy cannot exceed 500 characters']
    }
  },
  settings: {
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
      uppercase: true,
      length: [3, 'Currency must be 3 characters']
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
      trim: true
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt'],
      trim: true
    },
    autoConfirmBookings: {
      type: Boolean,
      default: false
    },
    requireGuestVerification: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(_doc, ret) {
      delete ret['__v'];
      return ret;
    }
  }
});

// Indexes for performance
// Note: Text search index is created in config/indexes.ts to avoid conflicts
propertySchema.index({ 'address.coordinates': '2dsphere' }); // Geospatial
propertySchema.index({ propertyType: 1, status: 1 }); // Compound
propertySchema.index({ owner: 1, status: 1 }); // Owner properties
propertySchema.index({ manager: 1, status: 1 }); // Manager properties
propertySchema.index({ organization: 1, status: 1 }); // Organization properties
propertySchema.index({ propertyGroup: 1, status: 1 }); // Group properties
propertySchema.index({ createdAt: -1 }); // Recent properties
propertySchema.index({ 'address.city': 1, 'address.country': 1 }); // Location search

// Virtual for total rooms
propertySchema.virtual('totalRooms').get(function() {
  return this.rooms.length;
});

// Virtual for active rooms
propertySchema.virtual('activeRooms').get(function() {
  return this.rooms.filter(room => room.isActive).length;
});

// Virtual for total capacity
propertySchema.virtual('totalCapacity').get(function() {
  return this.rooms.reduce((total, room) => {
    return total + room.capacity.adults + room.capacity.children;
  }, 0);
});

// Instance method to get available rooms
propertySchema.methods.getAvailableRooms = function(_checkIn: Date, _checkOut: Date): IRoom[] {
  // This would typically check against the Calendar model
  // For now, return all active rooms
  return this.rooms.filter((room: IRoom) => room.isActive);
};

// Instance method to update room availability
propertySchema.methods.updateAvailability = async function(roomId: string, isAvailable: boolean): Promise<void> {
  const room = this.rooms.id(roomId);
  if (room) {
    room.isActive = isAvailable;
    await this.save();
  }
};

// Static method to find properties by location
propertySchema.statics.findByLocation = function(latitude: number, longitude: number, radius: number = 10) {
  return this.find({
    'address.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: radius * 1000 // Convert km to meters
      }
    },
    status: PropertyStatus.ACTIVE
  });
};

// Static method to find properties by type
propertySchema.statics.findByType = function(propertyType: PropertyType) {
  return this.find({ propertyType, status: PropertyStatus.ACTIVE });
};

// Static method to find properties by owner
propertySchema.statics.findByOwner = function(ownerId: string) {
  return this.find({ owner: ownerId });
};

// Static method to find properties by organization
propertySchema.statics.findByOrganization = function(organizationId: string) {
  return this.find({ organization: organizationId, status: PropertyStatus.ACTIVE });
};

// Static method to find properties by group
propertySchema.statics.findByGroup = function(groupId: string) {
  return this.find({ propertyGroup: groupId, status: PropertyStatus.ACTIVE });
};

// Create and export the model
const Property: Model<IProperty> = mongoose.model<IProperty>('Property', propertySchema);

export default Property;


