import Router from 'koa-router';
import { ElasticClientProvider } from '../core/client/elasticClientProvider';
import { DeploymentState, DeploymentStrategy } from '../core/deployment/deploymentTypes';
import { IndexHealthChecker } from '../core/deployment/indexHealthChecker';
import { AliasManager } from '../core/management/aliasManager';
import { BatchError, ExtendedKoaContext } from '../core/types';
import { ProductIndexMapper } from '../product/mapping/productIndexMapper';
import { Product } from '../product/models/product';

/**
 * @swagger
 * tags:
 *   - name: Blue/Green Batch Processing
 *     description: API-based batch processing for zero-downtime deployments
 *   - name: System
 *     description: System health and monitoring endpoints
 */

const router = new Router();

// Initialize dependencies
const clientProvider = ElasticClientProvider.instance;
const aliasManager = new AliasManager(clientProvider);
const productIndexMapper = new ProductIndexMapper(clientProvider, aliasManager);
const healthChecker = new IndexHealthChecker(clientProvider);

/**
 * Batch Session Interface
 */
export interface BatchSession {
  sessionId: string;
  alias: string;
  targetIndex: string;
  targetColor: 'blue' | 'green';
  strategy: DeploymentStrategy;
  createdAt: Date;
  lastBatchAt: Date;
  totalBatches: number;
  processedBatches: number;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  status: 'active' | 'completed' | 'failed' | 'expired';
  errors: BatchError[];
  estimatedTotal?: number;
}

/**
 * Batch Session Manager
 */
class BatchSessionManager {
  private sessions = new Map<string, BatchSession>();
  private readonly sessionTimeout = 3600000; // 1 hour

  constructor() {
    // Cleanup expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 300000);
  }

  async startBatchSession(
    alias: string,
    strategy: DeploymentStrategy = DeploymentStrategy.SAFE,
    estimatedTotal?: number
  ): Promise<BatchSession> {
    const sessionId = this.generateSessionId();
    const timestamp = new Date().toISOString().replace(/[:.T-]/g, '').substring(0, 14); // YYYYMMDDHHMMSS format

    // Determine target color and index
    const currentState = await this.getCurrentDeploymentState(alias);
    const targetColor = this.getNextColor(currentState.activeColor);
    const targetIndex = `${alias}_${targetColor}_${timestamp}`;

    // Create new index for batch processing
    await productIndexMapper.createIndexAsync(targetIndex);

    const session: BatchSession = {
      sessionId,
      alias,
      targetIndex,
      targetColor,
      strategy,
      createdAt: new Date(),
      lastBatchAt: new Date(),
      totalBatches: 0,
      processedBatches: 0,
      totalDocuments: 0,
      processedDocuments: 0,
      failedDocuments: 0,
      status: 'active',
      errors: [],
      estimatedTotal
    };

    this.sessions.set(sessionId, session);

    console.log(`Started batch session ${sessionId} for alias ${alias} -> ${targetIndex}`);
    return session;
  }

  async processBatch(sessionId: string, documents: Product[]): Promise<BatchProcessResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or expired`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
    }

    try {
      const client = clientProvider.client;
      const body = [];

      // Prepare documents with proper IDs
      const processedDocuments = documents.map(doc => ({
        ...doc,
        id: doc.id || doc.RecordId?.toString() || `doc_${Date.now()}_${Math.random()}`
      }));

      // Prepare bulk request
      for (const doc of processedDocuments) {
        body.push({ index: { _index: session.targetIndex, _id: doc.id } });
        body.push(doc);
      }

      // Execute bulk request
      const response = await client.bulk({ body });

      // Process results
      const result = this.processBulkResponse(response, processedDocuments);

      // Update session
      session.totalBatches++;
      session.processedBatches++;
      session.totalDocuments += documents.length;
      session.processedDocuments += result.successful;
      session.failedDocuments += result.failed;
      session.lastBatchAt = new Date();

      if (result.errors.length > 0) {
        session.errors.push(...result.errors);
      }

      console.log(`Session ${sessionId}: Processed batch ${session.processedBatches}, ${result.successful}/${documents.length} successful`);

      return {
        sessionId,
        batchNumber: session.processedBatches,
        successful: result.successful,
        failed: result.failed,
        errors: result.errors,
        sessionStatus: session.status,
        totalProcessed: session.processedDocuments,
        totalFailed: session.failedDocuments,
        progress: session.estimatedTotal ? (session.processedDocuments / session.estimatedTotal) * 100 : undefined
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      session.errors.push({
        batchNumber: session.totalBatches + 1,
        error: errorMessage,
        timestamp: new Date()
      });
      throw error;
    }
  }

  async completeBatchSession(sessionId: string): Promise<DeploymentState> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active`);
    }

    try {
      console.log(`Completing batch session ${sessionId}`);

      // Refresh the index
      const client = clientProvider.client;
      await client.indices.refresh({ index: session.targetIndex });

      // Wait for index to be ready
      await healthChecker.waitForIndexReady(session.targetIndex, {
        timeout: 300000,
        expectedDocCount: session.processedDocuments
      });

      // Validate index health
      const isHealthy = await healthChecker.validateIndexHealth(session.targetIndex);
      if (!isHealthy) {
        throw new Error(`Index ${session.targetIndex} failed health validation`);
      }

      // Mark session as completed
      session.status = 'completed';

      // Get current state for building deployment state
      const currentState = await this.getCurrentDeploymentState(session.alias);

      // Create deployment state
      const deploymentState: DeploymentState = {
        alias: session.alias,
        activeColor: currentState.activeColor,
        activeIndex: currentState.activeIndex,
        stagingColor: session.targetColor,
        stagingIndex: session.targetIndex,
        deploymentStatus: 'READY_FOR_SWAP',
        lastDeployment: new Date(),
        strategy: session.strategy
      };

      // Auto-swap if strategy requires it
      if (session.strategy === DeploymentStrategy.AUTO_SWAP) {
        await this.swapAlias(session.alias, session.targetColor, session.targetIndex);
        deploymentState.activeColor = session.targetColor;
        deploymentState.activeIndex = session.targetIndex;
        deploymentState.stagingColor = undefined;
        deploymentState.stagingIndex = undefined;
        deploymentState.deploymentStatus = 'COMPLETED';
      }

      console.log(`Session ${sessionId} completed: ${session.processedDocuments} documents indexed`);
      return deploymentState;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      session.status = 'failed';
      session.errors.push({
        error: errorMessage,
        timestamp: new Date(),
        phase: 'completion'
      });
      throw error;
    }
  }

  async cancelBatchSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      // Delete the target index
      const client = clientProvider.client;
      await client.indices.delete({
        index: session.targetIndex,
        ignore_unavailable: true
      });

      session.status = 'failed';
      console.log(`Session ${sessionId} cancelled and index ${session.targetIndex} deleted`);
    } catch (error) {
      console.error(`Error cancelling session ${sessionId}:`, error);
      throw error;
    }
  }

  getSession(sessionId: string): BatchSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllActiveSessions(): BatchSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  private generateSessionId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getNextColor(currentColor?: 'blue' | 'green'): 'blue' | 'green' {
    return currentColor === 'blue' ? 'green' : 'blue';
  }

  private async getCurrentDeploymentState(alias: string): Promise<{ activeColor?: 'blue' | 'green'; activeIndex?: string }> {
    try {
      // Check if alias exists and get current indices
      const aliasExists = await aliasManager.aliasExistsAsync(alias);
      if (!aliasExists) {
        return { activeColor: undefined, activeIndex: undefined };
      }

      const indices = await aliasManager.getIndicesForAliasAsync(alias);
      if (indices.length === 0) {
        return { activeColor: undefined, activeIndex: undefined };
      }

      // Determine color from index name
      const activeIndex = indices[0];
      const activeColor = activeIndex.includes('_blue_') ? 'blue' : activeIndex.includes('_green_') ? 'green' : undefined;

      return { activeColor, activeIndex };
    } catch (error) {
      console.error(`Error getting current deployment state for ${alias}:`, error);
      return { activeColor: undefined, activeIndex: undefined };
    }
  }

  private async swapAlias(alias: string, targetColor: 'blue' | 'green', targetIndex: string): Promise<void> {
    await aliasManager.swapAliasAsync(alias, targetIndex, false);
  }

  private processBulkResponse(response: any, documents: Product[]): BatchResult {
    const result = {
      successful: 0,
      failed: 0,
      errors: [] as BatchError[]
    };

    if (response.errors) {
      response.items.forEach((item: any, index: number) => {
        if (item.index?.error) {
          result.failed++;
          result.errors.push({
            document: documents[index],
            error: item.index.error,
            index
          });
        } else {
          result.successful++;
        }
      });
    } else {
      result.successful = documents.length;
    }

    return result;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastBatchAt.getTime() > this.sessionTimeout) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        session.status = 'expired';
        this.sessions.delete(sessionId);
      }
    }
  }
}

interface BatchProcessResult {
  sessionId: string;
  batchNumber: number;
  successful: number;
  failed: number;
  errors: BatchError[];
  sessionStatus: string;
  totalProcessed: number;
  totalFailed: number;
  progress?: number;
}

interface BatchResult {
  successful: number;
  failed: number;
  errors: BatchError[];
}

// Initialize batch session manager
const batchSessionManager = new BatchSessionManager();

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique product identifier
 *         RecordId:
 *           type: integer
 *           description: Product record ID
 *         name:
 *           type: string
 *           description: Product name
 *         price:
 *           type: number
 *           description: Product price
 *         rules:
 *           type: object
 *           description: Product rules and configuration
 *     BatchSession:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *           description: Unique session identifier
 *         alias:
 *           type: string
 *           description: Target alias name
 *         targetIndex:
 *           type: string
 *           description: Target index being built
 *         targetColor:
 *           type: string
 *           enum: [blue, green]
 *         strategy:
 *           type: string
 *           enum: [safe, auto-swap]
 *         status:
 *           type: string
 *           enum: [active, completed, failed, expired]
 *         totalBatches:
 *           type: integer
 *         processedBatches:
 *           type: integer
 *         totalDocuments:
 *           type: integer
 *         processedDocuments:
 *           type: integer
 *         failedDocuments:
 *           type: integer
 *         estimatedTotal:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastBatchAt:
 *           type: string
 *           format: date-time
 *     DeploymentState:
 *       type: object
 *       properties:
 *         alias:
 *           type: string
 *         activeColor:
 *           type: string
 *           enum: [blue, green]
 *         activeIndex:
 *           type: string
 *         stagingColor:
 *           type: string
 *           enum: [blue, green]
 *         stagingIndex:
 *           type: string
 *         deploymentStatus:
 *           type: string
 *         lastDeployment:
 *           type: string
 *           format: date-time
 *         strategy:
 *           type: string
 */

/**
 * @swagger
 * /{alias}/batch/start:
 *   post:
 *     summary: Start a new batch processing session
 *     description: Initiates a new blue/green deployment session for processing documents in batches
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The alias to deploy to
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
 *         description: Estimated total number of documents (optional)
 *         example: 1000000
 *     responses:
 *       200:
 *         description: Batch session started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchSession'
 *       500:
 *         description: Failed to start batch session
 */
router.post('/:alias/batch/start', async (ctx: ExtendedKoaContext) => {
  try {
    const { alias } = ctx.params;
    if (!alias) {
      ctx.status = 400;
      ctx.body = { error: 'Alias parameter is required' };
      return;
    }

    const { strategy = 'safe', estimatedTotal } = ctx.query;

    const session = await batchSessionManager.startBatchSession(
      alias,
      strategy as DeploymentStrategy,
      estimatedTotal ? parseInt(estimatedTotal) : undefined
    );

    ctx.body = session;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to start batch session:', error);
    ctx.status = 500;
    ctx.body = { error: errorMessage };
  }
});

/**
 * @swagger
 * /batch/{sessionId}/process:
 *   post:
 *     summary: Process a batch of documents
 *     description: Add a batch of documents to an active batch session
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: batch_1640995200000_abc123def
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Product'
 *             maxItems: 5000
 *             description: Array of products (max 5000 per batch)
 *           example:
 *             - id: "prod_001"
 *               RecordId: 1
 *               name: "Sample Product"
 *               price: 29.99
 *               rules:
 *                 isActiveInSalesProcess: true
 *     responses:
 *       200:
 *         description: Batch processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 batchNumber:
 *                   type: integer
 *                 successful:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sessionStatus:
 *                   type: string
 *                 totalProcessed:
 *                   type: integer
 *                 totalFailed:
 *                   type: integer
 *                 progress:
 *                   type: number
 *                   description: Progress percentage (if estimatedTotal provided)
 *       400:
 *         description: Invalid session or request
 *       404:
 *         description: Session not found
 *       500:
 *         description: Batch processing failed
 */
router.post('/batch/:sessionId/process', async (ctx: ExtendedKoaContext) => {
  try {
    const { sessionId } = ctx.params;
    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { error: 'Session ID parameter is required' };
      return;
    }

    const documents: Product[] = ctx.request.body as Product[];

    if (!Array.isArray(documents) || documents.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'Request body must be a non-empty array of documents' };
      return;
    }

    if (documents.length > 5000) {
      ctx.status = 400;
      ctx.body = { error: 'Maximum 5000 documents per batch' };
      return;
    }

    const result = await batchSessionManager.processBatch(sessionId, documents);
    ctx.body = result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Batch processing failed:', error);

    if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
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
 * /batch/{sessionId}/complete:
 *   post:
 *     summary: Complete a batch processing session
 *     description: Finalizes the batch session and makes the index ready for promotion
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: batch_1640995200000_abc123def
 *     responses:
 *       200:
 *         description: Batch session completed successfully
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
router.post('/batch/:sessionId/complete', async (ctx: ExtendedKoaContext) => {
  try {
    const { sessionId } = ctx.params;
    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { error: 'Session ID parameter is required' };
      return;
    }
    const deploymentState = await batchSessionManager.completeBatchSession(sessionId);
    ctx.body = deploymentState;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to complete batch session:', error);

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
 * /batch/{sessionId}/status:
 *   get:
 *     summary: Get batch session status
 *     description: Retrieve the current status and progress of a batch session
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: batch_1640995200000_abc123def
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
router.get('/batch/:sessionId/status', async (ctx: ExtendedKoaContext) => {
  try {
    const { sessionId } = ctx.params;
    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { error: 'Session ID parameter is required' };
      return;
    }
    const session = batchSessionManager.getSession(sessionId);

    if (!session) {
      ctx.status = 404;
      ctx.body = { error: 'Session not found' };
      return;
    }

    ctx.body = session;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to get session status:', error);
    ctx.status = 500;
    ctx.body = { error: errorMessage };
  }
});

/**
 * @swagger
 * /batch/{sessionId}/cancel:
 *   post:
 *     summary: Cancel a batch processing session
 *     description: Cancels an active batch session and cleans up the target index
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: batch_1640995200000_abc123def
 *     responses:
 *       204:
 *         description: Session cancelled successfully
 *       404:
 *         description: Session not found
 *       500:
 *         description: Failed to cancel session
 */
router.post('/batch/:sessionId/cancel', async (ctx: ExtendedKoaContext) => {
  try {
    const { sessionId } = ctx.params;
    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { error: 'Session ID parameter is required' };
      return;
    }
    await batchSessionManager.cancelBatchSession(sessionId);
    ctx.status = 204;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to cancel batch session:', error);

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
 * /batch/active:
 *   get:
 *     summary: List all active batch sessions
 *     description: Retrieve all currently active batch processing sessions
 *     tags: [Blue/Green Batch Processing]
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
router.get('/batch/active', async (ctx: ExtendedKoaContext) => {
  try {
    const activeSessions = batchSessionManager.getAllActiveSessions();
    ctx.body = activeSessions;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to get active sessions:', error);
    ctx.status = 500;
    ctx.body = { error: errorMessage };
  }
});

/**
 * @swagger
 * /{alias}/status:
 *   get:
 *     summary: Get current deployment status for an alias
 *     description: Retrieve the current blue/green deployment status
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The alias to check
 *         example: products
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alias:
 *                   type: string
 *                 exists:
 *                   type: boolean
 *                 activeIndex:
 *                   type: string
 *                 activeColor:
 *                   type: string
 *                 indices:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Failed to get status
 */
router.get('/:alias/status', async (ctx: ExtendedKoaContext) => {
  try {
    const { alias } = ctx.params;
    if (!alias) {
      ctx.status = 400;
      ctx.body = { error: 'Alias parameter is required' };
      return;
    }

    const aliasExists = await aliasManager.aliasExistsAsync(alias);
    if (!aliasExists) {
      ctx.body = {
        alias,
        exists: false,
        message: 'Alias does not exist. Use batch/start to create a new deployment.'
      };
      return;
    }

    const indices = await aliasManager.getIndicesForAliasAsync(alias);
    const activeIndex = indices.length > 0 ? indices[0] : undefined;
    const activeColor = activeIndex ?
      (activeIndex.includes('_blue_') ? 'blue' : activeIndex.includes('_green_') ? 'green' : undefined) :
      undefined;

    ctx.body = {
      alias,
      exists: true,
      activeIndex,
      activeColor,
      indices
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to get alias status:', error);
    ctx.status = 500;
    ctx.body = { error: errorMessage };
  }
});

/**
 * @swagger
 * /{alias}/promote:
 *   post:
 *     summary: Promote staging index to active
 *     description: Switch traffic from active to staging index
 *     tags: [Blue/Green Batch Processing]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The alias to promote
 *         example: products
 *       - in: query
 *         name: targetIndex
 *         required: true
 *         schema:
 *           type: string
 *         description: The index to promote to active
 *         example: products_green_20231201120000
 *     responses:
 *       200:
 *         description: Promotion completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 alias:
 *                   type: string
 *                 newActiveIndex:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Promotion failed
 */
router.post('/:alias/promote', async (ctx: ExtendedKoaContext) => {
  try {
    const { alias } = ctx.params;
    if (!alias) {
      ctx.status = 400;
      ctx.body = { error: 'Alias parameter is required' };
      return;
    }

    const { targetIndex } = ctx.query;

    if (!targetIndex) {
      ctx.status = 400;
      ctx.body = { error: 'targetIndex query parameter is required' };
      return;
    }

    // Verify the target index exists
    const client = clientProvider.client;
    const indexExists = await client.indices.exists({ index: targetIndex });

    if (!indexExists) {
      ctx.status = 400;
      ctx.body = { error: `Target index '${targetIndex}' does not exist` };
      return;
    }

    // Swap the alias
    await aliasManager.swapAliasAsync(alias, targetIndex, false);

    ctx.body = {
      success: true,
      alias,
      newActiveIndex: targetIndex,
      message: `Successfully promoted ${targetIndex} to active for alias ${alias}`
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Promotion failed:', error);
    ctx.status = 500;
    ctx.body = { error: errorMessage };
  }
});

export default router;
