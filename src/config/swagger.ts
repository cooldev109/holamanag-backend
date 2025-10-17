import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Reservario Channel Manager API',
      version: '1.0.0',
      description: 'Professional Channel Manager API for property management and OTA integration',
      contact: {
        name: 'Reservario Team',
        email: 'support@reservario.com',
        url: 'https://reservario.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env['API_BASE_URL'] || 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.reservario.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for external integrations'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['email', 'password', 'roles'],
          properties: {
            _id: {
              type: 'string',
              description: 'User ID'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            roles: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['superadmin', 'admin', 'supervisor', 'client']
              },
              description: 'User roles'
            },
            isActive: {
              type: 'boolean',
              description: 'User account status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update date'
            }
          }
        },
        Property: {
          type: 'object',
          required: ['name', 'propertyType', 'address', 'rooms'],
          properties: {
            _id: {
              type: 'string',
              description: 'Property ID'
            },
            name: {
              type: 'string',
              description: 'Property name'
            },
            description: {
              type: 'string',
              description: 'Property description'
            },
            propertyType: {
              type: 'string',
              enum: ['hotel', 'apartment', 'house', 'villa', 'hostel', 'resort'],
              description: 'Type of property'
            },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                country: { type: 'string' },
                postalCode: { type: 'string' },
                coordinates: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' }
                  }
                }
              }
            },
            rooms: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Room'
              }
            },
            amenities: {
              type: 'array',
              items: { type: 'string' }
            },
            photos: {
              type: 'array',
              items: { type: 'string' }
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'maintenance'],
              description: 'Property status'
            }
          }
        },
        Room: {
          type: 'object',
          required: ['name', 'type', 'capacity'],
          properties: {
            _id: {
              type: 'string',
              description: 'Room ID'
            },
            name: {
              type: 'string',
              description: 'Room name or number'
            },
            type: {
              type: 'string',
              enum: ['single', 'double', 'twin', 'triple', 'quad', 'suite', 'family'],
              description: 'Room type'
            },
            capacity: {
              type: 'number',
              description: 'Maximum occupancy'
            },
            amenities: {
              type: 'array',
              items: { type: 'string' }
            },
            photos: {
              type: 'array',
              items: { type: 'string' }
            },
            isActive: {
              type: 'boolean',
              description: 'Room availability status'
            }
          }
        },
        Booking: {
          type: 'object',
          required: ['property', 'room', 'guest', 'checkIn', 'checkOut'],
          properties: {
            _id: {
              type: 'string',
              description: 'Booking ID'
            },
            property: {
              type: 'string',
              description: 'Property ID'
            },
            room: {
              type: 'string',
              description: 'Room ID'
            },
            guest: {
              $ref: '#/components/schemas/GuestInfo'
            },
            checkIn: {
              type: 'string',
              format: 'date',
              description: 'Check-in date'
            },
            checkOut: {
              type: 'string',
              format: 'date',
              description: 'Check-out date'
            },
            pricing: {
              $ref: '#/components/schemas/PricingDetails'
            },
            status: {
              type: 'string',
              enum: ['confirmed', 'cancelled', 'checked-in', 'checked-out', 'no-show'],
              description: 'Booking status'
            },
            channel: {
              type: 'string',
              description: 'Booking channel'
            },
            externalBookingId: {
              type: 'string',
              description: 'External booking reference'
            }
          }
        },
        GuestInfo: {
          type: 'object',
          required: ['firstName', 'lastName', 'email'],
          properties: {
            firstName: {
              type: 'string',
              description: 'Guest first name'
            },
            lastName: {
              type: 'string',
              description: 'Guest last name'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Guest email'
            },
            phone: {
              type: 'string',
              description: 'Guest phone number'
            },
            nationality: {
              type: 'string',
              description: 'Guest nationality'
            },
            documentType: {
              type: 'string',
              enum: ['passport', 'id', 'driver_license'],
              description: 'Document type'
            },
            documentNumber: {
              type: 'string',
              description: 'Document number'
            }
          }
        },
        PricingDetails: {
          type: 'object',
          required: ['baseRate', 'currency'],
          properties: {
            baseRate: {
              type: 'number',
              description: 'Base rate per night'
            },
            currency: {
              type: 'string',
              description: 'Currency code'
            },
            taxes: {
              type: 'number',
              description: 'Tax amount'
            },
            fees: {
              type: 'number',
              description: 'Additional fees'
            },
            discounts: {
              type: 'number',
              description: 'Discount amount'
            },
            total: {
              type: 'number',
              description: 'Total amount'
            }
          }
        },
        RatePlan: {
          type: 'object',
          required: ['name', 'property', 'baseRate', 'currency'],
          properties: {
            _id: {
              type: 'string',
              description: 'Rate plan ID'
            },
            name: {
              type: 'string',
              description: 'Rate plan name'
            },
            description: {
              type: 'string',
              description: 'Rate plan description'
            },
            property: {
              type: 'string',
              description: 'Property ID'
            },
            roomType: {
              type: 'string',
              description: 'Room type'
            },
            baseRate: {
              type: 'number',
              description: 'Base rate per night'
            },
            currency: {
              type: 'string',
              description: 'Currency code'
            },
            validFrom: {
              type: 'string',
              format: 'date',
              description: 'Valid from date'
            },
            validTo: {
              type: 'string',
              format: 'date',
              description: 'Valid to date'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              description: 'Rate plan status'
            }
          }
        },
        Calendar: {
          type: 'object',
          required: ['property', 'room', 'date', 'status'],
          properties: {
            _id: {
              type: 'string',
              description: 'Calendar entry ID'
            },
            property: {
              type: 'string',
              description: 'Property ID'
            },
            room: {
              type: 'string',
              description: 'Room ID'
            },
            date: {
              type: 'string',
              format: 'date',
              description: 'Calendar date'
            },
            status: {
              type: 'string',
              enum: ['available', 'booked', 'blocked', 'maintenance'],
              description: 'Availability status'
            },
            rate: {
              type: 'number',
              description: 'Rate for this date'
            },
            currency: {
              type: 'string',
              description: 'Currency code'
            },
            minStay: {
              type: 'number',
              description: 'Minimum stay requirement'
            },
            maxStay: {
              type: 'number',
              description: 'Maximum stay allowed'
            }
          }
        },
        Channel: {
          type: 'object',
          required: ['name', 'type', 'property'],
          properties: {
            _id: {
              type: 'string',
              description: 'Channel ID'
            },
            name: {
              type: 'string',
              description: 'Channel name'
            },
            type: {
              type: 'string',
              enum: ['airbnb', 'booking', 'expedia', 'agoda', 'vrbo', 'direct'],
              description: 'Channel type'
            },
            property: {
              type: 'string',
              description: 'Property ID'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'error'],
              description: 'Channel status'
            },
            isActive: {
              type: 'boolean',
              description: 'Channel active status'
            },
            lastSync: {
              type: 'string',
              format: 'date-time',
              description: 'Last synchronization time'
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Request success status'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  value: { type: 'string' }
                }
              },
              description: 'Validation errors'
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' }
              },
              description: 'Pagination information'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  value: { type: 'string' }
                }
              },
              description: 'Detailed error information'
            }
          }
        }
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1
          }
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 10
          }
        },
        SortParam: {
          name: 'sort',
          in: 'query',
          description: 'Sort field and direction',
          schema: {
            type: 'string',
            example: 'createdAt:desc'
          }
        },
        SearchParam: {
          name: 'search',
          in: 'query',
          description: 'Search query',
          schema: {
            type: 'string'
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Users',
        description: 'User management operations'
      },
      {
        name: 'Properties',
        description: 'Property management operations'
      },
      {
        name: 'Bookings',
        description: 'Booking management operations'
      },
      {
        name: 'Rate Plans',
        description: 'Rate plan management operations'
      },
      {
        name: 'Calendar',
        description: 'Calendar and availability management'
      },
      {
        name: 'Channels',
        description: 'Channel and OTA integration management'
      },
      {
        name: 'Health',
        description: 'System health and status'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/models/*.ts'
  ]
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  // Swagger UI setup
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Reservario API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));

  // JSON endpoint for the OpenAPI spec
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  console.log('📚 Swagger documentation available at: /api-docs');
  console.log('📄 OpenAPI JSON spec available at: /api-docs.json');
};

export default specs;


