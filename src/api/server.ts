import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import swaggerJSDoc from 'swagger-jsdoc';
import { koaSwagger } from 'koa2-swagger-ui';
import { ElasticClientProvider } from '../core/client/elasticClientProvider';
import blueGreenRoutes from './blueGreenRoutes';
import mount from 'koa-mount';

const app = new Koa();
const router = new Router();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser({ jsonLimit: '100mb', formLimit: '100mb' }));

// Services
const clientProvider = ElasticClientProvider.instance;

// Swagger configuration
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E4Dynamics Blue/Green Batch API',
      version: '2.0.0',
      description: 'Session-based batch API for zero-downtime blue/green deployments, optimized for large-scale product ingestion'
    },
    servers: [
      { url: `http://localhost:${port}/api`, description: 'Development server' }
    ]
  },
  apis: [
    './src/api/blueGreenRoutes.ts'
  ]
});

app.use(
  koaSwagger({
    routePrefix: '/api-docs',
    swaggerOptions: { spec: swaggerSpec as any }
  })
);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API and Elasticsearch health
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Health check successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 api:
 *                   type: string
 *                   example: healthy
 *                 elasticsearch:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     cluster:
 *                       type: object
 *       500:
 *         description: Health check failed
 */
router.get('/health', async (ctx) => {
  try {
    const isConnected = await clientProvider.isConnectedAsync();
    const health = isConnected ? await clientProvider.getClusterHealthAsync() : null;
    ctx.body = {
      api: 'healthy',
      elasticsearch: {
        connected: isConnected,
        cluster: health
      }
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      api: 'healthy',
      elasticsearch: {
        connected: false,
        error: (error as Error).message
      }
    };
  }
});

// Mount blue/green routes under /api
app.use(mount('/api', blueGreenRoutes.routes()));
app.use(mount('/api', blueGreenRoutes.allowedMethods()));

// Mount health check route under /api
app.use(mount('/api', router.routes()));
app.use(mount('/api', router.allowedMethods()));

// Start server only when run directly (not when imported)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 E4Dynamics Blue/Green Deployment API running on port ${port}`);
    console.log(`📚 API Documentation available at http://localhost:${port}/api-docs`);
  });
}

export default app;