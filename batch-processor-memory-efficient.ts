#!/usr/bin/env node

import * as fs from 'fs';
import * as JSONStream from 'JSONStream';
import fetch, { Response } from 'node-fetch';

/**
 * Configuration interface for the batch processing script
 */
interface BatchProcessorConfig {
    alias: string;
    jsonFilePath: string;
    apiBaseUrl: string;
    batchSize: number;
    strategy: 'safe' | 'auto-swap';
    estimatedTotal?: number;
    maxRetries: number;
    retryDelay: number;
}

/**
 * Response interfaces
 */
interface BatchSession {
    sessionId: string;
    alias: string;
    targetIndex: string;
    targetColor: 'blue' | 'green';
    strategy: string;
    status: string;
    totalBatches: number;
    processedBatches: number;
    totalDocuments: number;
    processedDocuments: number;
    failedDocuments: number;
    estimatedTotal?: number;
}

interface BatchProcessResult {
    sessionId: string;
    batchNumber: number;
    successful: number;
    failed: number;
    errors: any[];
    sessionStatus: string;
    totalProcessed: number;
    totalFailed: number;
    progress?: number;
}

interface DeploymentState {
    alias: string;
    activeColor?: string;
    activeIndex?: string;
    stagingColor?: string;
    stagingIndex?: string;
    deploymentStatus: string;
    lastDeployment: Date;
    strategy: string;
}

/**
 * Error tracking
 */
interface ProcessingError {
    type: 'batch' | 'network' | 'validation' | 'completion' | 'promotion';
    message: string;
    details?: any;
    timestamp: Date;
    batchNumber?: number;
    retryAttempt?: number;
}

/**
 * Memory-efficient batch processor class for handling large product datasets
 */
class MemoryEfficientBatchProcessor {
    private config: BatchProcessorConfig;
    private session: BatchSession | null = null;
    private errors: ProcessingError[] = [];
    private stats = {
        totalProcessed: 0,
        totalFailed: 0,
        totalBatches: 0,
        startTime: new Date(),
        endTime: null as Date | null
    };

    constructor(config: BatchProcessorConfig) {
        this.config = config;
    }

    /**
     * Main processing function
     */
    async process(): Promise<void> {
        console.log(`🚀 Starting memory-efficient batch processing for alias: ${this.config.alias}`);
        console.log(`📁 Reading from: ${this.config.jsonFilePath}`);
        console.log(`📦 Batch size: ${this.config.batchSize}`);
        console.log(`🔧 Strategy: ${this.config.strategy}`);
        console.log(`🌐 API Base URL: ${this.config.apiBaseUrl}`);

        try {
            // Step 1: Start batch session
            await this.startBatchSession();

            // Step 2: Process products in batches using streaming
            await this.processProductsInBatchesStreaming();

            // Step 3: Complete the session
            const deploymentState = await this.completeBatchSession();

            // Step 4: Activate the index (promote if using safe strategy)
            if (this.config.strategy === 'safe') {
                await this.promoteIndex(deploymentState);
            }

            this.stats.endTime = new Date();
            this.printSummary();

        } catch (error) {
            this.stats.endTime = new Date();
            console.error('❌ Processing failed:', error);

            // Try to cancel the session if it exists
            if (this.session) {
                try {
                    await this.cancelBatchSession();
                } catch (cancelError) {
                    console.error('⚠️  Failed to cancel session:', cancelError);
                }
            }

            this.printSummary();
            process.exit(1);
        }
    }

    /**
     * Start a new batch session
     */
    private async startBatchSession(): Promise<void> {
        console.log('\n📋 Starting batch session...');

        const url = `${this.config.apiBaseUrl}/api/v1/products/${this.config.alias}/batch/start?strategy=${this.config.strategy}${this.config.estimatedTotal ? `&estimatedTotal=${this.config.estimatedTotal}` : ''}`;
        console.log(`🔗 Request URL: ${url}`);

        const response = await this.makeRequest('POST', url);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to start batch session: ${response.status} - ${error}`);
        }

        this.session = await response.json() as BatchSession;
        console.log(`✅ Session started: ${this.session.sessionId}`);
        console.log(`🎯 Target index: ${this.session.targetIndex}`);
        console.log(`🔵🟢 Target color: ${this.session.targetColor}`);
    }

    /**
     * Process products in batches using memory-efficient streaming
     */
    private async processProductsInBatchesStreaming(): Promise<void> {
        console.log('\n📊 Processing products using memory-efficient streaming...');

        if (!this.session) {
            throw new Error('No active session');
        }

        // Check if file exists
        if (!fs.existsSync(this.config.jsonFilePath)) {
            throw new Error(`File not found: ${this.config.jsonFilePath}`);
        }

        return new Promise<void>((resolve, reject) => {
            let currentBatch: any[] = [];
            let batchNumber = 0;
            let totalProcessed = 0;
            let itemCount = 0;
            let concurrentBatches = 0;
            const maxConcurrentBatches = 3; // Limit concurrent processing to avoid overwhelming the API

            const stream = fs.createReadStream(this.config.jsonFilePath)
                .pipe(JSONStream.parse('*'));

            // Process a batch with concurrency control
            const processBatchWithConcurrencyControl = async (batch: any[], batchNum: number): Promise<void> => {
                // Wait if we have too many concurrent batches
                while (concurrentBatches >= maxConcurrentBatches) {
                    await this.sleep(100);
                }

                concurrentBatches++;
                try {
                    console.log(`📦 Processing batch ${batchNum} (${batch.length} products)... [Concurrent: ${concurrentBatches}]`);

                    const result = await this.processBatch(batch, batchNum);
                    totalProcessed += result.successful;

                    if (result.failed > 0) {
                        console.warn(`⚠️  Batch ${batchNum}: ${result.failed} failed, ${result.successful} successful`);
                    } else {
                        console.log(`✅ Batch ${batchNum}: ${result.successful} products processed successfully`);
                    }

                    // Show progress if estimated total is available
                    if (this.session!.estimatedTotal) {
                        const progress = (totalProcessed / this.session!.estimatedTotal * 100).toFixed(1);
                        console.log(`📈 Progress: ${progress}% (${totalProcessed}/${this.session!.estimatedTotal})`);
                    }

                    this.stats.totalFailed += result.failed;

                } catch (error) {
                    console.error(`🔍 Error processing batch ${batchNum}:`, error);
                    throw error;
                } finally {
                    concurrentBatches--;
                }
            };

            const pendingBatches: Promise<void>[] = [];

            stream.on('data', (product: any) => {
                itemCount++;

                if (itemCount <= 5) { // Log first few for debugging
                    console.log(`🔍 Streaming item ${itemCount}: ${product?.RecordId || product?.ItemId || 'unknown'}`);
                }

                if (itemCount % 1000 === 0) {
                    console.log(`📊 Streamed ${itemCount} items so far...`);
                }

                currentBatch.push(product);

                // When batch is full, process it
                if (currentBatch.length >= this.config.batchSize) {
                    batchNumber++;
                    const batchToProcess = [...currentBatch]; // Create copy to avoid mutation
                    currentBatch = []; // Reset current batch

                    // Start processing this batch (but don't await here to keep stream flowing)
                    const batchPromise = processBatchWithConcurrencyControl(batchToProcess, batchNumber);
                    pendingBatches.push(batchPromise);

                    // Handle errors from batch processing
                    batchPromise.catch(error => {
                        console.error('Error in batch processing:', error);
                        stream.destroy(error);
                    });
                }
            });

            stream.on('end', async () => {
                try {
                    console.log(`🔍 Stream ended. Processing final batch if needed...`);

                    // Process any remaining items in the final batch
                    if (currentBatch.length > 0) {
                        batchNumber++;
                        console.log(`📦 Processing final batch ${batchNumber} (${currentBatch.length} products)...`);

                        const finalBatchPromise = processBatchWithConcurrencyControl(currentBatch, batchNumber);
                        pendingBatches.push(finalBatchPromise);
                    }

                    // Wait for all batch processing to complete
                    console.log(`🔍 Waiting for ${pendingBatches.length} batches to complete...`);
                    await Promise.all(pendingBatches);

                    this.stats.totalProcessed = totalProcessed;
                    this.stats.totalBatches = batchNumber;

                    console.log(`🔍 Completed processing ${itemCount} total items in ${batchNumber} batches`);
                    console.log(`\n✅ Completed processing ${this.stats.totalBatches} batches with ${this.stats.totalProcessed} products`);
                    resolve();

                } catch (error) {
                    console.error('Error in stream end handler:', error);
                    reject(error);
                }
            });

            stream.on('error', (error) => {
                console.error('🔍 Stream error:', error);
                reject(error);
            });

            // Monitor memory usage periodically
            const memoryMonitor = setInterval(() => {
                const memUsage = process.memoryUsage();
                const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
                console.log(`🧠 Memory usage: ${memUsedMB}MB | Processed: ${itemCount} items | Batches: ${batchNumber}`);
            }, 10000); // Every 10 seconds

            stream.on('end', () => clearInterval(memoryMonitor));
            stream.on('error', () => clearInterval(memoryMonitor));
        });
    }

    /**
     * Process a single batch with retry logic
     */
    private async processBatch(products: any[], batchNumber: number): Promise<BatchProcessResult> {
        if (!this.session) {
            throw new Error('No active session');
        }

        const url = `${this.config.apiBaseUrl}/api/v1/products/batch/${this.session.sessionId}/process`;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await this.makeRequest('POST', url, products);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const result = await response.json() as BatchProcessResult;

                // Track errors if any
                if (result.errors && result.errors.length > 0) {
                    this.errors.push({
                        type: 'batch',
                        message: `Batch ${batchNumber} had ${result.errors.length} document errors`,
                        details: result.errors,
                        timestamp: new Date(),
                        batchNumber
                    });
                }

                return result;

            } catch (error) {
                const isLastAttempt = attempt === this.config.maxRetries;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';

                this.errors.push({
                    type: 'batch',
                    message: `Batch ${batchNumber} failed (attempt ${attempt}/${this.config.maxRetries}): ${errorMessage}`,
                    details: error,
                    timestamp: new Date(),
                    batchNumber,
                    retryAttempt: attempt
                });

                if (isLastAttempt) {
                    throw new Error(`Batch ${batchNumber} failed after ${this.config.maxRetries} attempts: ${errorMessage}`);
                }

                console.warn(`⚠️  Batch ${batchNumber} failed (attempt ${attempt}/${this.config.maxRetries}), retrying in ${this.config.retryDelay}ms...`);
                await this.sleep(this.config.retryDelay);
            }
        }

        throw new Error('Unexpected error in batch processing');
    }

    /**
     * Complete the batch session
     */
    private async completeBatchSession(): Promise<DeploymentState> {
        console.log('\n🏁 Completing batch session...');

        if (!this.session) {
            throw new Error('No active session');
        }

        const url = `${this.config.apiBaseUrl}/api/v1/products/batch/${this.session.sessionId}/complete`;

        const response = await this.makeRequest('POST', url);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to complete batch session: ${response.status} - ${error}`);
        }

        const deploymentState = await response.json() as DeploymentState;
        console.log(`✅ Session completed successfully`);
        console.log(`📊 Deployment status: ${deploymentState.deploymentStatus}`);

        return deploymentState;
    }

    /**
     * Promote the index (activate it)
     */
    private async promoteIndex(deploymentState: DeploymentState): Promise<void> {
        console.log('\n🔄 Promoting index to active...');

        if (!deploymentState.stagingIndex) {
            throw new Error('No staging index to promote');
        }

        const url = `${this.config.apiBaseUrl}/api/v1/products/${this.config.alias}/promote?targetIndex=${deploymentState.stagingIndex}`;

        const response = await this.makeRequest('POST', url);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to promote index: ${response.status} - ${error}`);
        }

        const result = await response.json() as { success: boolean; alias: string; newActiveIndex: string; message: string };
        console.log(`✅ Index promoted successfully: ${result.newActiveIndex}`);
    }

    /**
     * Cancel the batch session
     */
    private async cancelBatchSession(): Promise<void> {
        if (!this.session) {
            return;
        }

        console.log('\n❌ Cancelling batch session...');

        const url = `${this.config.apiBaseUrl}/api/v1/products/batch/${this.session.sessionId}/cancel`;

        try {
            const response = await this.makeRequest('POST', url);

            if (response.ok) {
                console.log(`✅ Session cancelled: ${this.session.sessionId}`);
            } else {
                const error = await response.text();
                console.warn(`⚠️  Failed to cancel session: ${response.status} - ${error}`);
            }
        } catch (error) {
            console.warn(`⚠️  Error cancelling session: ${error}`);
        }
    }

    /**
     * Make HTTP request with proper error handling
     */
    private async makeRequest(method: string, url: string, body?: any): Promise<Response> {
        const options: any = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MemoryEfficientBatchProcessor/1.0'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        return await fetch(url, options);
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Print processing summary
     */
    private printSummary(): void {
        const duration = this.stats.endTime
            ? this.stats.endTime.getTime() - this.stats.startTime.getTime()
            : Date.now() - this.stats.startTime.getTime();

        const durationSeconds = (duration / 1000).toFixed(1);
        const productsPerSecond = this.stats.totalProcessed > 0
            ? (this.stats.totalProcessed / (duration / 1000)).toFixed(1)
            : '0';

        const memUsage = process.memoryUsage();
        const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const maxMemUsedMB = Math.round(memUsage.heapTotal / 1024 / 1024);

        console.log('\n' + '='.repeat(60));
        console.log('📊 PROCESSING SUMMARY');
        console.log('='.repeat(60));
        console.log(`⏱️  Duration: ${durationSeconds}s`);
        console.log(`📦 Total batches: ${this.stats.totalBatches}`);
        console.log(`✅ Products processed: ${this.stats.totalProcessed}`);
        console.log(`❌ Products failed: ${this.stats.totalFailed}`);
        console.log(`🚀 Processing rate: ${productsPerSecond} products/second`);
        console.log(`🎯 Success rate: ${this.stats.totalProcessed > 0 ? ((this.stats.totalProcessed / (this.stats.totalProcessed + this.stats.totalFailed)) * 100).toFixed(1) : '0'}%`);
        console.log(`🧠 Memory used: ${memUsedMB}MB (max: ${maxMemUsedMB}MB)`);

        if (this.errors.length > 0) {
            console.log('\n❌ ERRORS ENCOUNTERED:');
            console.log('-'.repeat(40));

            const errorsByType = this.errors.reduce((acc, error) => {
                acc[error.type] = (acc[error.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            Object.entries(errorsByType).forEach(([type, count]) => {
                console.log(`${type}: ${count} errors`);
            });

            console.log('\nFirst few errors:');
            this.errors.slice(0, 5).forEach((error, index) => {
                console.log(`${index + 1}. [${error.type}] ${error.message}`);
                if (error.batchNumber) {
                    console.log(`   Batch: ${error.batchNumber}`);
                }
                console.log(`   Time: ${error.timestamp.toISOString()}`);
            });

            if (this.errors.length > 5) {
                console.log(`   ... and ${this.errors.length - 5} more errors`);
            }
        } else {
            console.log('\n✅ No errors encountered!');
        }

        console.log('='.repeat(60));
    }
}

/**
 * Main function to run the script
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
🚀 Memory-Efficient Product Batch Processor

Usage: node batch-processor-memory-efficient.js [options]

Options:
  --alias <string>          Elasticsearch alias name (default: products)
  --file <path>            Path to JSON file containing products (default: products.json)
  --api <url>              API base URL (default: http://localhost:3333)
  --batch-size <number>    Batch size (default: 500, max: 1000)
  --strategy <string>      Deployment strategy: safe|auto-swap (default: safe)
  --estimated <number>     Estimated total number of products (optional)
  --max-retries <number>   Maximum retry attempts per batch (default: 3)
  --retry-delay <number>   Delay between retries in ms (default: 1000)
  --help, -h              Show this help message

Examples:
  node batch-processor-memory-efficient.js --alias products --file products_500k.json --batch-size 1000
  node batch-processor-memory-efficient.js --alias inventory --file inventory.json --strategy auto-swap --estimated 100000

Memory Efficiency Features:
  - Streams large JSON files without loading everything into memory
  - Processes batches concurrently with controlled concurrency
  - Monitors memory usage in real-time
  - Optimized for handling multi-GB files
    `);
        process.exit(0);
    }

    // Parse arguments
    const config: BatchProcessorConfig = {
        alias: getArgValue(args, '--alias') || 'products',
        jsonFilePath: getArgValue(args, '--file') || 'products.json',
        apiBaseUrl: getArgValue(args, '--api') || 'http://localhost:3000',
        batchSize: Math.min(parseInt(getArgValue(args, '--batch-size') || '500'), 1000),
        strategy: (getArgValue(args, '--strategy') as 'safe' | 'auto-swap') || 'safe',
        estimatedTotal: getArgValue(args, '--estimated') ? parseInt(getArgValue(args, '--estimated')!) : undefined,
        maxRetries: parseInt(getArgValue(args, '--max-retries') || '3'),
        retryDelay: parseInt(getArgValue(args, '--retry-delay') || '1000')
    };

    // Validate configuration
    if (!['safe', 'auto-swap'].includes(config.strategy)) {
        console.error('❌ Invalid strategy. Must be "safe" or "auto-swap"');
        process.exit(1);
    }

    if (config.batchSize <= 0 || config.batchSize > 1000) {
        console.error('❌ Invalid batch size. Must be between 1 and 1000');
        process.exit(1);
    }

    // Create and run processor
    const processor = new MemoryEfficientBatchProcessor(config);
    await processor.process();
}

/**
 * Get command line argument value
 */
function getArgValue(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
}

export { BatchProcessorConfig, MemoryEfficientBatchProcessor };
