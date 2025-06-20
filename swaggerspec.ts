import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Elasticsearch API Wrapper',
      version: '1.0.0',
      description: 'API wrapper for Elasticsearch operations with Blue/Green deployment',
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server'
      },
    ],
  },
  apis: [
    './src/api/routes.ts',
    './src/api/blueGreenRoutes.ts', // Add this line
    './src/api/*.ts' // This will catch all API files
  ],
};

export const swaggerSpec = swaggerJsdoc(options);