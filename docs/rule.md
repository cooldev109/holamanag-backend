# Reservario Business Rules and Data Model

## 1. Shared Inventory Model

### Core Concept
In a Property Management System (PMS) with channel management, **the same physical rooms are listed on multiple OTA platforms** (Airbnb, Booking.com, Expedia, etc.). This is called "shared inventory."

### The Golden Rule
**Total physical rooms is CONSTANT across all channels.**

### Mathematical Relationship

```
Available Rooms = Total Rooms - Booked Rooms - Blocked Rooms
```

**Where:**
- `Total Rooms` = The physical number of rooms (CONSTANT, e.g., 4)
- `Booked Rooms` = Number of rooms booked across ALL channels
- `Blocked Rooms` = Rooms blocked for maintenance, owner use, etc.
- `Available Rooms` = Rooms that can still be booked on ANY channel

### Examples

#### Example 1: No Bookings
```
Property: Luxury Beach Resort
Room Type: Ocean View Suite
Total Physical Rooms: 4

Status: All rooms available
- Total: 4
- Booked: 0
- Available: 4

Display: 4/4 (all available)
```

#### Example 2: One Booking from Airbnb
```
Property: Luxury Beach Resort
Room Type: Ocean View Suite
Total Physical Rooms: 4

Bookings:
- 1 room booked via Airbnb (John Doe)

Status:
- Total: 4
- Booked: 1
- Available: 3

Display: 3/4 (3 available, 1 booked)

Channel Views:
- Airbnb: Shows 3 available (their guest booked 1)
- Booking.com: Shows 3 available (Airbnb guest booked 1)
- All channels: 3/4
```

#### Example 3: Multiple Bookings from Different Channels
```
Property: Luxury Beach Resort
Room Type: Ocean View Suite
Total Physical Rooms: 4

Bookings:
- 1 room booked via Airbnb (John Doe)
- 2 rooms booked via Booking.com (Jane Smith, Bob Johnson)

Status:
- Total: 4
- Booked: 3 (1 Airbnb + 2 Booking.com)
- Available: 1

Display: 1/4 (1 available, 3 booked)

Formula Verification:
- Airbnb view: 3/4 (they see 1 booked from their channel)
- Booking.com view: 2/4 (they see 2 booked from their channel)
- Total view: 1/4 (actual availability)
- Formula: 3/4 + 2/4 ≠ 5/4, instead: 4-1-2 = 1 ✓
```

#### Example 4: Fully Booked
```
Property: Luxury Beach Resort
Room Type: Ocean View Suite
Total Physical Rooms: 4

Bookings:
- 2 rooms booked via Airbnb
- 2 rooms booked via Booking.com

Status:
- Total: 4
- Booked: 4
- Available: 0

Display: 0/4 (fully booked, no availability)
```

#### Example 5: With Blocked Rooms
```
Property: Luxury Beach Resort
Room Type: Ocean View Suite
Total Physical Rooms: 4

Bookings:
- 1 room booked via Airbnb

Blocked:
- 1 room blocked for maintenance

Status:
- Total: 4
- Booked: 1
- Blocked: 1
- Available: 2

Display: 2/4 (2 available, 1 booked, 1 blocked)
Formula: 4 - 1 - 1 = 2 ✓
```

## 2. Data Model

### RoomAvailability Schema

```typescript
interface RoomAvailability {
  property: ObjectId;           // Reference to Property
  room: ObjectId;              // Reference to specific room in Property.rooms
  date: Date;                  // Calendar date (midnight UTC)

  // Core Inventory (CONSTANT per date)
  totalRooms: number;          // Total physical rooms of this type (e.g., 4)

  // Bookings (DYNAMIC)
  bookedRooms: Array<{
    channel: string;           // 'airbnb', 'booking', 'expedia', etc.
    bookingId: ObjectId;       // Reference to Booking
    guestName: string;         // Guest name for quick reference
    bookedAt: Date;           // When this booking was made
  }>;

  // Maintenance (DYNAMIC)
  blockedRooms: number;        // Rooms unavailable due to maintenance, etc.

  // Calculated (AUTO-COMPUTED)
  availableRooms: number;      // totalRooms - bookedRooms.length - blockedRooms

  // Rates (CHANNEL-SPECIFIC)
  rates: Array<{
    channel: string;           // 'airbnb', 'booking', etc.
    rate: number;             // Nightly rate for this channel
    currency: string;         // 'USD', 'EUR', etc.
  }>;

  // Restrictions
  minStay: number;            // Minimum nights required
  maxStay: number;            // Maximum nights allowed
  status: string;             // 'open', 'closed'
}
```

### Pre-save Middleware

The `availableRooms` field is automatically calculated before saving:

```typescript
roomAvailabilitySchema.pre('save', function(next) {
  this.availableRooms = this.totalRooms - this.bookedRooms.length - this.blockedRooms;

  // Ensure availableRooms doesn't go negative
  if (this.availableRooms < 0) {
    this.availableRooms = 0;
  }

  next();
});
```

### Booking Schema

```typescript
interface Booking {
  property: ObjectId;
  room: ObjectId;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;        // 'pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'
  channel: BookingChannel;      // 'airbnb', 'booking', 'expedia', 'direct', etc.
  guestInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    // ... other fields
  };
  pricing: {
    baseRate: number;
    taxes: number;
    fees: number;
    total: number;
    currency: string;
  };
  // ... other fields
}
```

## 3. Seed Data Rules

### Rule 1: Consistent Total Rooms
Each room type at a property has a **fixed** `totalRooms` value that represents the physical inventory.

```typescript
// Example: Ocean View Suite has 4 physical rooms
totalRooms: 4  // This NEVER changes regardless of bookings or channels
```

### Rule 2: Booking Creates Inventory Reduction
When a booking is created for a date range, the `bookedRooms` array in `RoomAvailability` must be updated for each night of the stay.

```typescript
// Guest books Oct 15-17 (2 nights)
// Update RoomAvailability for:
// - Oct 15 (add to bookedRooms)
// - Oct 16 (add to bookedRooms)
// - Oct 17 is checkout day (NOT added)
```

### Rule 3: Available = Total - Booked - Blocked
This calculation must always hold true:

```typescript
// Before any bookings
totalRooms: 4
bookedRooms: []
blockedRooms: 0
availableRooms: 4  // 4 - 0 - 0 = 4 ✓

// After 1 Airbnb booking
totalRooms: 4
bookedRooms: [{ channel: 'airbnb', ... }]
blockedRooms: 0
availableRooms: 3  // 4 - 1 - 0 = 3 ✓

// After 1 Airbnb + 2 Booking.com bookings
totalRooms: 4
bookedRooms: [
  { channel: 'airbnb', ... },
  { channel: 'booking', ... },
  { channel: 'booking', ... }
]
blockedRooms: 0
availableRooms: 1  // 4 - 3 - 0 = 1 ✓
```

### Rule 4: No Overbooking
Cannot book more rooms than available:

```typescript
// Validation before creating booking
if (availableRooms <= 0) {
  throw new Error('No rooms available for selected dates');
}

// After booking is confirmed
availableRooms = totalRooms - bookedRooms.length - blockedRooms;
if (availableRooms < 0) {
  throw new Error('Overbooking detected!');
}
```

### Rule 5: Channel-Agnostic Availability
All channels see the same real-time availability:

```typescript
// Property has 4 rooms total
// 1 booked on Airbnb
// Result: ALL channels (Airbnb, Booking.com, Expedia) show 3 available

// This prevents overbooking across channels
```

## 4. API Display Rules

### Inventory API Response

```json
{
  "roomId": "68ef796ad8a4d4a0e5fe8cc8",
  "roomCode": "OVS-001",
  "availability": [
    {
      "date": "2025-10-15",
      "allotment": 4,        // Same as totalRooms
      "booked": 3,           // bookedRooms.length
      "available": 1,        // availableRooms (calculated)
      "channels": [
        {
          "channel": "airbnb",
          "guestName": "John Doe"
        },
        {
          "channel": "booking",
          "guestName": "Jane Smith"
        },
        {
          "channel": "booking",
          "guestName": "Bob Johnson"
        }
      ],
      "minStay": 2,
      "maxStay": 30,
      "rate": 299,
      "currency": "USD",
      "stopSell": false
    }
  ]
}
```

### Frontend Display

```
Date: Oct 15, 2025
Ocean View Suite: 1/4

Meaning:
- Total rooms: 4
- Booked: 3 (1 Airbnb + 2 Booking.com)
- Available: 1

Color coding:
- 0/n (fully booked): Red background
- 1-2/n (low availability): Yellow background
- 3+/n (good availability): Green background
```

## 5. Critical Validations

### Before Creating Booking
```typescript
// 1. Check date range availability
const dates = getDateRange(checkIn, checkOut);
for (const date of dates) {
  const availability = await RoomAvailability.findOne({
    property: propertyId,
    room: roomId,
    date: date
  });

  if (!availability || availability.availableRooms <= 0) {
    throw new Error(`No availability on ${date}`);
  }
}

// 2. Create booking
const booking = await Booking.create({ ... });

// 3. Update inventory for each night
for (const date of dates) {
  const availability = await RoomAvailability.findOne({
    property: propertyId,
    room: roomId,
    date: date
  });

  // Add to bookedRooms array
  availability.bookedRooms.push({
    channel: booking.channel,
    bookingId: booking._id,
    guestName: `${booking.guestInfo.firstName} ${booking.guestInfo.lastName}`,
    bookedAt: new Date()
  });

  // availableRooms is auto-calculated by pre-save hook
  await availability.save();
}
```

### Before Cancelling Booking
```typescript
// 1. Find booking
const booking = await Booking.findById(bookingId);

// 2. Update status
booking.status = 'cancelled';
await booking.save();

// 3. Release inventory for each night
const dates = getDateRange(booking.checkIn, booking.checkOut);
for (const date of dates) {
  const availability = await RoomAvailability.findOne({
    property: booking.property,
    room: booking.room,
    date: date
  });

  // Remove from bookedRooms array
  availability.bookedRooms = availability.bookedRooms.filter(
    b => b.bookingId.toString() !== bookingId.toString()
  );

  // availableRooms is auto-calculated by pre-save hook
  await availability.save();
}
```

## 6. Testing Scenarios

### Scenario 1: Sequential Bookings
```
Initial: 4/4 available
Book 1 via Airbnb → 3/4 available ✓
Book 1 via Booking.com → 2/4 available ✓
Book 1 via Expedia → 1/4 available ✓
Book 1 via Direct → 0/4 available ✓
Try to book another → ERROR: No availability ✓
```

### Scenario 2: Cancellation
```
Current: 1/4 available (3 booked)
Cancel 1 Airbnb booking → 2/4 available ✓
Cancel 1 Booking.com booking → 3/4 available ✓
```

### Scenario 3: Date Range Booking
```
Guest wants to book Oct 15-17 (2 nights)
Check Oct 15: 4/4 available ✓
Check Oct 16: 4/4 available ✓
Create booking → Updates both dates
Result:
- Oct 15: 3/4 available ✓
- Oct 16: 3/4 available ✓
- Oct 17: 4/4 available (checkout day, not blocked) ✓
```

## 7. Summary

**Key Principles:**
1. Total rooms = CONSTANT physical inventory
2. Booked rooms = SUM of all channel bookings
3. Available rooms = Total - Booked - Blocked
4. All channels see same real-time availability
5. No overbooking possible
6. Checkout day is NOT blocked

**Display Format:** `Available/Total` (e.g., 3/4, 2/5, 0/4)

**This ensures:**
- ✅ Accurate inventory across all channels
- ✅ No double bookings
- ✅ Real-time synchronization
- ✅ Proper revenue attribution per channel
- ✅ Clear availability visualization
