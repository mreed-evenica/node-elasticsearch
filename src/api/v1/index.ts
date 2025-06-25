import Router from 'koa-router';
import { DeploymentStrategy } from '../../core/deployment/deploymentTypes';
import { ExtendedKoaContext } from '../../core/types';
import productBatchRouter, { productBatchSessionManager } from './productBatch';
import productsRouter from './products';

/**
 * @swagger
 * tags:
 *   - name: API v1
 *     description: Version 1 of the E4Dynamics API
 */

const router = new Router({ prefix: '/v1' });

// Mount product routes
router.use('/products', productsRouter.routes(), productsRouter.allowedMethods());

// Mount product batch routes
router.use('/products', productBatchRouter.routes(), productBatchRouter.allowedMethods());

/**
 * @swagger
 * /v1/products/{alias}/batch/start:
 *   post:
 *     summary: Start a new product batch processing session
 *     description: Initiates a new blue/green deployment session for processing products in batches
 *     tags: [Product Batch Processing]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The product alias to deploy to
 *         example: products
 *       - in: query
 *         name: strategy
 *         schema:
 *           type: string
 *           enum: [safe, auto-swap]
 *           default: safe
 *         description: Deployment strategy
 *       - in: query
 *         name: estimatedTotal
 *         schema:
 *           type: integer
 *         description: Estimated total number of products (optional)
 *         example: 1000000
 *     responses:
 *       200:
 *         description: Product batch session started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchSession'
 *       500:
 *         description: Failed to start batch session
 */
router.post('/products/:alias/batch/start', async (ctx: ExtendedKoaContext) => {
    try {
        const { alias } = ctx.params as { alias: string };
        if (!alias) {
            ctx.status = 400;
            ctx.body = { error: 'Alias parameter is required' };
            return;
        }

        const { strategy = 'safe', estimatedTotal } = ctx.query as { strategy?: string; estimatedTotal?: string };

        const session = await productBatchSessionManager.startBatchSession(
            alias,
            strategy as DeploymentStrategy,
            estimatedTotal ? parseInt(estimatedTotal) : undefined
        );

        ctx.body = session;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to start product batch session:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/batch/{sessionId}/complete:
 *   post:
 *     summary: Complete a product batch processing session
 *     description: Finalizes the product batch session and makes the index ready for promotion
 *     tags: [Product Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: product_batch_1640995200000_abc123def
 *     responses:
 *       200:
 *         description: Product batch session completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeploymentState'
 *       400:
 *         description: Invalid session
 *       404:
 *         description: Session not found
 *       500:
 *         description: Failed to complete session
 */
router.post('/products/batch/:sessionId/complete', async (ctx: ExtendedKoaContext) => {
    try {
        const { sessionId } = ctx.params as { sessionId: string };
        if (!sessionId) {
            ctx.status = 400;
            ctx.body = { error: 'Session ID parameter is required' };
            return;
        }
        const deploymentState = await productBatchSessionManager.completeBatchSession(sessionId);
        ctx.body = deploymentState;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to complete product batch session:', error);

        if (errorMessage.includes('not found')) {
            ctx.status = 404;
        } else if (errorMessage.includes('not active')) {
            ctx.status = 400;
        } else {
            ctx.status = 500;
        }

        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/batch/{sessionId}/status:
 *   get:
 *     summary: Get product batch session status
 *     description: Retrieve the current status and progress of a product batch session
 *     tags: [Product Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: product_batch_1640995200000_abc123def
 *     responses:
 *       200:
 *         description: Session status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchSession'
 *       404:
 *         description: Session not found
 */
router.get('/products/batch/:sessionId/status', async (ctx: ExtendedKoaContext) => {
    try {
        const { sessionId } = ctx.params as { sessionId: string };
        if (!sessionId) {
            ctx.status = 400;
            ctx.body = { error: 'Session ID parameter is required' };
            return;
        }
        const session = productBatchSessionManager.getSession(sessionId);

        if (!session) {
            ctx.status = 404;
            ctx.body = { error: 'Session not found' };
            return;
        }

        ctx.body = session;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to get product session status:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/batch/{sessionId}/cancel:
 *   post:
 *     summary: Cancel a product batch processing session
 *     description: Cancels an active product batch session and cleans up the target index
 *     tags: [Product Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: product_batch_1640995200000_abc123def
 *     responses:
 *       204:
 *         description: Session cancelled successfully
 *       404:
 *         description: Session not found
 *       500:
 *         description: Failed to cancel session
 */
router.post('/products/batch/:sessionId/cancel', async (ctx: ExtendedKoaContext) => {
    try {
        const { sessionId } = ctx.params as { sessionId: string };
        if (!sessionId) {
            ctx.status = 400;
            ctx.body = { error: 'Session ID parameter is required' };
            return;
        }
        await productBatchSessionManager.cancelBatchSession(sessionId);
        ctx.status = 204;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to cancel product batch session:', error);

        if (errorMessage.includes('not found')) {
            ctx.status = 404;
        } else {
            ctx.status = 500;
        }

        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/batch/active:
 *   get:
 *     summary: List all active product batch sessions
 *     description: Retrieve all currently active product batch processing sessions
 *     tags: [Product Batch Processing]
 *     responses:
 *       200:
 *         description: Active sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BatchSession'
 */
router.get('/products/batch/active', async (ctx: ExtendedKoaContext) => {
    try {
        const activeSessions = productBatchSessionManager.getAllActiveSessions();
        ctx.body = activeSessions;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Failed to get active product sessions:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

export default router;
