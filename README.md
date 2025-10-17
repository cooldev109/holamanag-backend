# Reservario Channel Manager - Backend

## Overview
Professional Channel Manager backend built with Node.js, Express, TypeScript, and MongoDB. This backend provides a comprehensive API for managing properties, bookings, rates, and OTA integrations.

## Features
- 🔐 Multi-role authentication system (Superadmin, Admin, Supervisor, Client)
- 🏨 Property and booking management
- 📅 Calendar synchronization with conflict resolution
- 💰 Dynamic rate management and pricing
- 🔗 Mock OTA integration (Airbnb, Booking.com, Expedia, Agoda, Vrbo)
- 📊 Comprehensive reporting and analytics
- 🌐 Multi-language support (EN, ES, DE, PT, NL)
- 🔒 Security-first approach with JWT and role-based access
- 📝 Comprehensive API documentation

## Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with refresh tokens
- **Logging**: Winston with file and console logging
- **Validation**: Zod schemas
- **Security**: Helmet, CORS, Rate limiting
- **Testing**: Jest, Supertest
- **Code Quality**: ESLint, Prettier

## Getting Started

### Prerequisites
- Node.js 18+ 
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd reservario/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/reservario
   JWT_SECRET=your-super-secret-jwt-key-here
   CORS_ORIGIN=http://localhost:5173
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run clean` - Clean build directory
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication Endpoints
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - User logout

### Property Management
- `GET /properties` - Get all properties
- `POST /properties` - Create new property
- `GET /properties/:id` - Get property by ID
- `PUT /properties/:id` - Update property
- `DELETE /properties/:id` - Delete property

### Booking Management
- `GET /bookings` - Get all bookings
- `POST /bookings` - Create new booking
- `GET /bookings/:id` - Get booking by ID
- `PUT /bookings/:id` - Update booking
- `DELETE /bookings/:id` - Cancel booking

### Rate Management
- `GET /rates` - Get all rate plans
- `POST /rates` - Create rate plan
- `PUT /rates/:id` - Update rate plan
- `DELETE /rates/:id` - Delete rate plan

### Calendar Management
- `GET /calendar` - Get calendar availability
- `POST /calendar/sync` - Sync calendar with OTAs
- `PUT /calendar/:id` - Update calendar entry

### Channel Management
- `GET /channels` - Get all OTA channels
- `POST /channels` - Add new channel
- `PUT /channels/:id` - Update channel settings
- `DELETE /channels/:id` - Remove channel

## Project Structure

```
backend/
├── src/
│   ├── controllers/     # API route handlers
│   ├── models/         # Mongoose schemas
│   ├── routes/         # Express routes
│   ├── middleware/     # Custom middleware
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   ├── config/         # Configuration files
│   ├── types/          # TypeScript interfaces
│   └── app.ts          # Express app setup
├── tests/              # Test files
├── docs/               # API documentation
├── logs/               # Log files
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── env.example
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/reservario` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `24h` |
| `CORS_ORIGIN` | CORS allowed origin | `http://localhost:5173` |
| `LOG_LEVEL` | Logging level | `info` |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit per window | `100` |

## Database Schema

### User Model
```typescript
{
  email: string;
  password: string;
  roles: Role[];
  isActive: boolean;
  profile: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    avatar?: string;
  };
  preferences: {
    language: 'en' | 'es' | 'de' | 'pt' | 'nl';
    timezone: string;
    notifications: boolean;
  };
}
```

### Property Model
```typescript
{
  name: string;
  description: string;
  address: Address;
  rooms: Room[];
  amenities: string[];
  images: string[];
  policies: Policies;
  owner: string; // User ID
  isActive: boolean;
}
```

### Booking Model
```typescript
{
  property: string; // Property ID
  room: string; // Room ID
  guest: GuestInfo;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  totalAmount: number;
  status: BookingStatus;
  channel: string; // Channel ID
  channelBookingId?: string;
}
```

## Security Features

- **JWT Authentication** with refresh tokens
- **Role-based Access Control** (RBAC)
- **Rate Limiting** to prevent abuse
- **Input Validation** with Zod schemas
- **Security Headers** with Helmet
- **CORS Protection** for cross-origin requests
- **Password Hashing** with bcrypt
- **SQL Injection Protection** with Mongoose
- **XSS Protection** with input sanitization

## Development Guidelines

### Code Quality
- Use TypeScript with strict mode
- Follow ESLint rules
- Format code with Prettier
- Write comprehensive tests
- Document all functions and classes

### Git Workflow
- Use feature branches
- Write descriptive commit messages
- Create pull requests for code review
- Follow conventional commit format

### Testing
- Write unit tests for all business logic
- Write integration tests for API endpoints
- Maintain >80% test coverage
- Use Jest and Supertest for testing

## Deployment

### Production Environment
- Use MongoDB Atlas for production database
- Set up proper environment variables
- Enable SSL/TLS certificates
- Configure monitoring and logging
- Set up automated backups

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the development guidelines

---

**Built with ❤️ for the hospitality industry**


