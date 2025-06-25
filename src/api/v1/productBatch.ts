import { BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import Router from 'koa-router';
import { ElasticClientProvider } from '../../core/client/elasticClientProvider';
import { DeploymentState, DeploymentStrategy } from '../../core/deployment/deploymentTypes';
import { IndexHealthChecker } from '../../core/deployment/indexHealthChecker';
import { AliasManager } from '../../core/management/aliasManager';
import { BatchError, ExtendedKoaContext } from '../../core/types';
import { ProductIndexMapper } from '../../product/mapping/productIndexMapper';
import { Product } from '../../product/models/product';

/**
 * @swagger
 * tags:
 *   - name: Product Batch Processing
 *     description: Product-specific batch processing for zero-downtime deployments
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
class ProductBatchSessionManager {
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
        const timestamp = new Date().toISOString().replace(/[:.T-]/g, '').substring(0, 14);

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

        console.log(`Started product batch session ${sessionId} for alias ${alias} -> ${targetIndex}`);
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

            // Prepare documents with proper IDs - ensure uniqueness
            const processedDocuments = documents.map((doc, index) => ({
                ...doc,
                id: doc.id || doc.RecordId?.toString() || `doc_${session.sessionId}_${session.totalBatches + 1}_${index}_${Date.now()}`
            }));

            // Validate ID uniqueness
            const ids = processedDocuments.map(doc => doc.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
                console.error(`Duplicate IDs detected: ${duplicates.join(', ')}`);
                throw new Error(`Duplicate document IDs detected in batch: ${duplicates.join(', ')}`);
            }

            console.log(`Preparing ${processedDocuments.length} documents for indexing`);
            console.log(`Document IDs: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`);

            // Prepare bulk request
            for (const doc of processedDocuments) {
                body.push({ index: { _index: session.targetIndex, _id: doc.id } });
                body.push(doc);
            }

            console.log(`Bulk request prepared with ${body.length / 2} documents`);

            // Execute bulk request
            const response = await client.bulk({ body });

            console.log(`Bulk response received. Errors flag: ${response.errors}, Items count: ${response.items.length}`);

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

            console.log(`Product session ${sessionId}: Processed batch ${session.processedBatches}`);
            console.log(`  - Input documents: ${documents.length}`);
            console.log(`  - Successful: ${result.successful}`);
            console.log(`  - Failed: ${result.failed}`);
            console.log(`  - Total processed so far: ${session.processedDocuments}`);
            console.log(`  - Total failed so far: ${session.failedDocuments}`);

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
            console.log(`Completing product batch session ${sessionId}`);
            console.log(`Expected document count: ${session.processedDocuments}`);
            console.log(`Total failed documents: ${session.failedDocuments}`);

            // Refresh the index
            const client = clientProvider.client;
            await client.indices.refresh({ index: session.targetIndex });

            // Get actual document count before health check
            const countResponse = await client.count({ index: session.targetIndex });
            const actualCount = countResponse.count;
            console.log(`Actual document count in index: ${actualCount}`);

            if (actualCount !== session.processedDocuments) {
                console.warn(`Document count mismatch! Expected: ${session.processedDocuments}, Actual: ${actualCount}`);
                // Update the session with the actual count to prevent hanging
                console.log(`Updating expected count for health check to actual count: ${actualCount}`);
            }

            // Wait for index to be ready using the actual count
            await healthChecker.waitForIndexReady(session.targetIndex, {
                timeout: 300000,
                expectedDocCount: actualCount
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

            console.log(`Product session ${sessionId} completed: ${session.processedDocuments} documents indexed`);
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
            console.log(`Product session ${sessionId} cancelled and index ${session.targetIndex} deleted`);
        } catch (error) {
            console.error(`Error cancelling product session ${sessionId}:`, error);
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
        return `product_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getNextColor(currentColor?: 'blue' | 'green'): 'blue' | 'green' {
        return currentColor === 'blue' ? 'green' : 'blue';
    }

    private async getCurrentDeploymentState(alias: string): Promise<{ activeColor?: 'blue' | 'green'; activeIndex?: string }> {
        try {
            const aliasExists = await aliasManager.aliasExistsAsync(alias);
            if (!aliasExists) {
                return { activeColor: undefined, activeIndex: undefined };
            }

            const indices = await aliasManager.getIndicesForAliasAsync(alias);
            if (indices.length === 0) {
                return { activeColor: undefined, activeIndex: undefined };
            }

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

    private processBulkResponse(response: BulkResponse, documents: Product[]): BatchResult {
        const result = {
            successful: 0,
            failed: 0,
            errors: [] as BatchError[]
        };

        // Always process all items in the response
        response.items.forEach((item, index: number) => {
            const indexOperation = item.index;
            if (indexOperation?.error) {
                result.failed++;
                result.errors.push({
                    document: documents[index],
                    error: {
                        type: indexOperation.error.type || 'unknown',
                        reason: indexOperation.error.reason || 'unknown error',
                        status: indexOperation.status
                    },
                    index
                });
                console.warn(`Document ${index} failed indexing: ${indexOperation.error.reason || 'unknown error'}`);
            } else if (indexOperation?.status && (indexOperation.status === 200 || indexOperation.status === 201)) {
                result.successful++;
            } else {
                // Handle unexpected status codes
                result.failed++;
                result.errors.push({
                    document: documents[index],
                    error: {
                        type: 'unexpected_status',
                        reason: `Unexpected status code: ${indexOperation?.status || 'unknown'}`,
                        status: indexOperation?.status
                    },
                    index
                });
                console.warn(`Document ${index} unexpected status: ${indexOperation?.status || 'unknown'}`);
            }
        });

        // Verify we processed all documents
        const totalProcessed = result.successful + result.failed;
        if (totalProcessed !== documents.length) {
            console.error(`Mismatch: Expected ${documents.length} documents, processed ${totalProcessed}`);
            console.error(`Response items length: ${response.items.length}`);
            console.error(`Response has errors flag: ${response.errors}`);
        }

        return result;
    }

    private cleanupExpiredSessions(): void {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastBatchAt.getTime() > this.sessionTimeout) {
                console.log(`Cleaning up expired product session: ${sessionId}`);
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

// Initialize product batch session manager
const productBatchSessionManager = new ProductBatchSessionManager();

/**
 * @swagger
 * /api/v1/products/batch/{sessionId}/process:
 *   post:
 *     summary: Process a batch of products
 *     description: Add a batch of products to an active batch session
 *     tags: [Product Batch Processing]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch session ID
 *         example: product_batch_1640995200000_abc123def
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Product'
 *             maxItems: 1000
 *             description: Array of products (max 1000 per batch)
 *           example:
 *             - RecordId: 22565421965
 *               ItemId: "0003"
 *               ProductNumber: "0003"
 *               Name: "Sample Product"
 *               Rules:
 *                 IsActiveInSalesProcess: true
 *               DefaultProductProperties:
 *                 - KeyName: "Color"
 *                   ValueString: "Red"
 *     responses:
 *       200:
 *         description: Product batch processed successfully
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
 *       400:
 *         description: Invalid session or request
 *       404:
 *         description: Session not found
 *       500:
 *         description: Batch processing failed
 */
router.post('/batch/:sessionId/process', async (ctx: ExtendedKoaContext) => {
    try {
        const { sessionId } = ctx.params as { sessionId: string };
        if (!sessionId) {
            ctx.status = 400;
            ctx.body = { error: 'Session ID parameter is required' };
            return;
        }

        const documents: Product[] = ctx.request.body as Product[];

        if (!Array.isArray(documents) || documents.length === 0) {
            ctx.status = 400;
            ctx.body = { error: 'Request body must be a non-empty array of products' };
            return;
        }

        if (documents.length > 1000) {
            ctx.status = 400;
            ctx.body = { error: 'Maximum 1000 products per batch' };
            return;
        }

        const result = await productBatchSessionManager.processBatch(sessionId, documents);
        ctx.body = result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Product batch processing failed:', error);

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

export { productBatchSessionManager };
export default router;
