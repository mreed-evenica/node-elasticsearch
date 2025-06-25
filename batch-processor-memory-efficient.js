#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.MemoryEfficientBatchProcessor = void 0;
var fs = require("fs");
var JSONStream = require("JSONStream");
var node_fetch_1 = require("node-fetch");
/**
 * Memory-efficient batch processor class for handling large product datasets
 */
var MemoryEfficientBatchProcessor = /** @class */ (function () {
    function MemoryEfficientBatchProcessor(config) {
        this.session = null;
        this.errors = [];
        this.stats = {
            totalProcessed: 0,
            totalFailed: 0,
            totalBatches: 0,
            startTime: new Date(),
            endTime: null
        };
        this.config = config;
    }
    /**
     * Main processing function
     */
    MemoryEfficientBatchProcessor.prototype.process = function () {
        return __awaiter(this, void 0, void 0, function () {
            var deploymentState, error_1, cancelError_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("\uD83D\uDE80 Starting memory-efficient batch processing for alias: ".concat(this.config.alias));
                        console.log("\uD83D\uDCC1 Reading from: ".concat(this.config.jsonFilePath));
                        console.log("\uD83D\uDCE6 Batch size: ".concat(this.config.batchSize));
                        console.log("\uD83D\uDD27 Strategy: ".concat(this.config.strategy));
                        console.log("\uD83C\uDF10 API Base URL: ".concat(this.config.apiBaseUrl));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 12]);
                        // Step 1: Start batch session
                        return [4 /*yield*/, this.startBatchSession()];
                    case 2:
                        // Step 1: Start batch session
                        _a.sent();
                        // Step 2: Process products in batches using streaming
                        return [4 /*yield*/, this.processProductsInBatchesStreaming()];
                    case 3:
                        // Step 2: Process products in batches using streaming
                        _a.sent();
                        return [4 /*yield*/, this.completeBatchSession()];
                    case 4:
                        deploymentState = _a.sent();
                        if (!(this.config.strategy === 'safe')) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.promoteIndex(deploymentState)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        this.stats.endTime = new Date();
                        this.printSummary();
                        return [3 /*break*/, 12];
                    case 7:
                        error_1 = _a.sent();
                        this.stats.endTime = new Date();
                        console.error('❌ Processing failed:', error_1);
                        if (!this.session) return [3 /*break*/, 11];
                        _a.label = 8;
                    case 8:
                        _a.trys.push([8, 10, , 11]);
                        return [4 /*yield*/, this.cancelBatchSession()];
                    case 9:
                        _a.sent();
                        return [3 /*break*/, 11];
                    case 10:
                        cancelError_1 = _a.sent();
                        console.error('⚠️  Failed to cancel session:', cancelError_1);
                        return [3 /*break*/, 11];
                    case 11:
                        this.printSummary();
                        process.exit(1);
                        return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start a new batch session
     */
    MemoryEfficientBatchProcessor.prototype.startBatchSession = function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, error, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log('\n📋 Starting batch session...');
                        url = "".concat(this.config.apiBaseUrl, "/api/v1/products/").concat(this.config.alias, "/batch/start?strategy=").concat(this.config.strategy).concat(this.config.estimatedTotal ? "&estimatedTotal=".concat(this.config.estimatedTotal) : '');
                        console.log("\uD83D\uDD17 Request URL: ".concat(url));
                        return [4 /*yield*/, this.makeRequest('POST', url)];
                    case 1:
                        response = _b.sent();
                        if (!!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        error = _b.sent();
                        throw new Error("Failed to start batch session: ".concat(response.status, " - ").concat(error));
                    case 3:
                        _a = this;
                        return [4 /*yield*/, response.json()];
                    case 4:
                        _a.session = (_b.sent());
                        console.log("\u2705 Session started: ".concat(this.session.sessionId));
                        console.log("\uD83C\uDFAF Target index: ".concat(this.session.targetIndex));
                        console.log("\uD83D\uDD35\uD83D\uDFE2 Target color: ".concat(this.session.targetColor));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Process products in batches using memory-efficient streaming
     */
    MemoryEfficientBatchProcessor.prototype.processProductsInBatchesStreaming = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                console.log('\n📊 Processing products using memory-efficient streaming...');
                if (!this.session) {
                    throw new Error('No active session');
                }
                // Check if file exists
                if (!fs.existsSync(this.config.jsonFilePath)) {
                    throw new Error("File not found: ".concat(this.config.jsonFilePath));
                }
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var currentBatch = [];
                        var batchNumber = 0;
                        var totalProcessed = 0;
                        var itemCount = 0;
                        var concurrentBatches = 0;
                        var maxConcurrentBatches = 3; // Limit concurrent processing to avoid overwhelming the API
                        var stream = fs.createReadStream(_this.config.jsonFilePath)
                            .pipe(JSONStream.parse('*'));
                        // Process a batch with concurrency control
                        var processBatchWithConcurrencyControl = function (batch, batchNum) { return __awaiter(_this, void 0, void 0, function () {
                            var result, progress, error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!(concurrentBatches >= maxConcurrentBatches)) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this.sleep(100)];
                                    case 1:
                                        _a.sent();
                                        return [3 /*break*/, 0];
                                    case 2:
                                        concurrentBatches++;
                                        _a.label = 3;
                                    case 3:
                                        _a.trys.push([3, 5, 6, 7]);
                                        console.log("\uD83D\uDCE6 Processing batch ".concat(batchNum, " (").concat(batch.length, " products)... [Concurrent: ").concat(concurrentBatches, "]"));
                                        return [4 /*yield*/, this.processBatch(batch, batchNum)];
                                    case 4:
                                        result = _a.sent();
                                        totalProcessed += result.successful;
                                        if (result.failed > 0) {
                                            console.warn("\u26A0\uFE0F  Batch ".concat(batchNum, ": ").concat(result.failed, " failed, ").concat(result.successful, " successful"));
                                        }
                                        else {
                                            console.log("\u2705 Batch ".concat(batchNum, ": ").concat(result.successful, " products processed successfully"));
                                        }
                                        // Show progress if estimated total is available
                                        if (this.session.estimatedTotal) {
                                            progress = (totalProcessed / this.session.estimatedTotal * 100).toFixed(1);
                                            console.log("\uD83D\uDCC8 Progress: ".concat(progress, "% (").concat(totalProcessed, "/").concat(this.session.estimatedTotal, ")"));
                                        }
                                        this.stats.totalFailed += result.failed;
                                        return [3 /*break*/, 7];
                                    case 5:
                                        error_2 = _a.sent();
                                        console.error("\uD83D\uDD0D Error processing batch ".concat(batchNum, ":"), error_2);
                                        throw error_2;
                                    case 6:
                                        concurrentBatches--;
                                        return [7 /*endfinally*/];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        }); };
                        var pendingBatches = [];
                        stream.on('data', function (product) {
                            itemCount++;
                            if (itemCount <= 5) { // Log first few for debugging
                                console.log("\uD83D\uDD0D Streaming item ".concat(itemCount, ": ").concat((product === null || product === void 0 ? void 0 : product.RecordId) || (product === null || product === void 0 ? void 0 : product.ItemId) || 'unknown'));
                            }
                            if (itemCount % 1000 === 0) {
                                console.log("\uD83D\uDCCA Streamed ".concat(itemCount, " items so far..."));
                            }
                            currentBatch.push(product);
                            // When batch is full, process it
                            if (currentBatch.length >= _this.config.batchSize) {
                                batchNumber++;
                                var batchToProcess = __spreadArray([], currentBatch, true); // Create copy to avoid mutation
                                currentBatch = []; // Reset current batch
                                // Start processing this batch (but don't await here to keep stream flowing)
                                var batchPromise = processBatchWithConcurrencyControl(batchToProcess, batchNumber);
                                pendingBatches.push(batchPromise);
                                // Handle errors from batch processing
                                batchPromise["catch"](function (error) {
                                    console.error('Error in batch processing:', error);
                                    stream.destroy(error);
                                });
                            }
                        });
                        stream.on('end', function () { return __awaiter(_this, void 0, void 0, function () {
                            var finalBatchPromise, error_3;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        console.log("\uD83D\uDD0D Stream ended. Processing final batch if needed...");
                                        // Process any remaining items in the final batch
                                        if (currentBatch.length > 0) {
                                            batchNumber++;
                                            console.log("\uD83D\uDCE6 Processing final batch ".concat(batchNumber, " (").concat(currentBatch.length, " products)..."));
                                            finalBatchPromise = processBatchWithConcurrencyControl(currentBatch, batchNumber);
                                            pendingBatches.push(finalBatchPromise);
                                        }
                                        // Wait for all batch processing to complete
                                        console.log("\uD83D\uDD0D Waiting for ".concat(pendingBatches.length, " batches to complete..."));
                                        return [4 /*yield*/, Promise.all(pendingBatches)];
                                    case 1:
                                        _a.sent();
                                        this.stats.totalProcessed = totalProcessed;
                                        this.stats.totalBatches = batchNumber;
                                        console.log("\uD83D\uDD0D Completed processing ".concat(itemCount, " total items in ").concat(batchNumber, " batches"));
                                        console.log("\n\u2705 Completed processing ".concat(this.stats.totalBatches, " batches with ").concat(this.stats.totalProcessed, " products"));
                                        resolve();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        error_3 = _a.sent();
                                        console.error('Error in stream end handler:', error_3);
                                        reject(error_3);
                                        return [3 /*break*/, 3];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); });
                        stream.on('error', function (error) {
                            console.error('🔍 Stream error:', error);
                            reject(error);
                        });
                        // Monitor memory usage periodically
                        var memoryMonitor = setInterval(function () {
                            var memUsage = process.memoryUsage();
                            var memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
                            console.log("\uD83E\uDDE0 Memory usage: ".concat(memUsedMB, "MB | Processed: ").concat(itemCount, " items | Batches: ").concat(batchNumber));
                        }, 10000); // Every 10 seconds
                        stream.on('end', function () { return clearInterval(memoryMonitor); });
                        stream.on('error', function () { return clearInterval(memoryMonitor); });
                    })];
            });
        });
    };
    /**
     * Process a single batch with retry logic
     */
    MemoryEfficientBatchProcessor.prototype.processBatch = function (products, batchNumber) {
        return __awaiter(this, void 0, void 0, function () {
            var url, attempt, response, errorText, result, error_4, isLastAttempt, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.session) {
                            throw new Error('No active session');
                        }
                        url = "".concat(this.config.apiBaseUrl, "/api/v1/products/batch/").concat(this.session.sessionId, "/process");
                        attempt = 1;
                        _a.label = 1;
                    case 1:
                        if (!(attempt <= this.config.maxRetries)) return [3 /*break*/, 10];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 7, , 9]);
                        return [4 /*yield*/, this.makeRequest('POST', url, products)];
                    case 3:
                        response = _a.sent();
                        if (!!response.ok) return [3 /*break*/, 5];
                        return [4 /*yield*/, response.text()];
                    case 4:
                        errorText = _a.sent();
                        throw new Error("HTTP ".concat(response.status, ": ").concat(errorText));
                    case 5: return [4 /*yield*/, response.json()];
                    case 6:
                        result = _a.sent();
                        // Track errors if any
                        if (result.errors && result.errors.length > 0) {
                            this.errors.push({
                                type: 'batch',
                                message: "Batch ".concat(batchNumber, " had ").concat(result.errors.length, " document errors"),
                                details: result.errors,
                                timestamp: new Date(),
                                batchNumber: batchNumber
                            });
                        }
                        return [2 /*return*/, result];
                    case 7:
                        error_4 = _a.sent();
                        isLastAttempt = attempt === this.config.maxRetries;
                        errorMessage = error_4 instanceof Error ? error_4.message : 'Unknown error';
                        this.errors.push({
                            type: 'batch',
                            message: "Batch ".concat(batchNumber, " failed (attempt ").concat(attempt, "/").concat(this.config.maxRetries, "): ").concat(errorMessage),
                            details: error_4,
                            timestamp: new Date(),
                            batchNumber: batchNumber,
                            retryAttempt: attempt
                        });
                        if (isLastAttempt) {
                            throw new Error("Batch ".concat(batchNumber, " failed after ").concat(this.config.maxRetries, " attempts: ").concat(errorMessage));
                        }
                        console.warn("\u26A0\uFE0F  Batch ".concat(batchNumber, " failed (attempt ").concat(attempt, "/").concat(this.config.maxRetries, "), retrying in ").concat(this.config.retryDelay, "ms..."));
                        return [4 /*yield*/, this.sleep(this.config.retryDelay)];
                    case 8:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 9:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 10: throw new Error('Unexpected error in batch processing');
                }
            });
        });
    };
    /**
     * Complete the batch session
     */
    MemoryEfficientBatchProcessor.prototype.completeBatchSession = function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, error, deploymentState;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('\n🏁 Completing batch session...');
                        if (!this.session) {
                            throw new Error('No active session');
                        }
                        url = "".concat(this.config.apiBaseUrl, "/api/v1/products/batch/").concat(this.session.sessionId, "/complete");
                        return [4 /*yield*/, this.makeRequest('POST', url)];
                    case 1:
                        response = _a.sent();
                        if (!!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        error = _a.sent();
                        throw new Error("Failed to complete batch session: ".concat(response.status, " - ").concat(error));
                    case 3: return [4 /*yield*/, response.json()];
                    case 4:
                        deploymentState = _a.sent();
                        console.log("\u2705 Session completed successfully");
                        console.log("\uD83D\uDCCA Deployment status: ".concat(deploymentState.deploymentStatus));
                        return [2 /*return*/, deploymentState];
                }
            });
        });
    };
    /**
     * Promote the index (activate it)
     */
    MemoryEfficientBatchProcessor.prototype.promoteIndex = function (deploymentState) {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, error, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('\n🔄 Promoting index to active...');
                        if (!deploymentState.stagingIndex) {
                            throw new Error('No staging index to promote');
                        }
                        url = "".concat(this.config.apiBaseUrl, "/api/v1/products/").concat(this.config.alias, "/promote?targetIndex=").concat(deploymentState.stagingIndex);
                        return [4 /*yield*/, this.makeRequest('POST', url)];
                    case 1:
                        response = _a.sent();
                        if (!!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        error = _a.sent();
                        throw new Error("Failed to promote index: ".concat(response.status, " - ").concat(error));
                    case 3: return [4 /*yield*/, response.json()];
                    case 4:
                        result = _a.sent();
                        console.log("\u2705 Index promoted successfully: ".concat(result.newActiveIndex));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cancel the batch session
     */
    MemoryEfficientBatchProcessor.prototype.cancelBatchSession = function () {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, error, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.session) {
                            return [2 /*return*/];
                        }
                        console.log('\n❌ Cancelling batch session...');
                        url = "".concat(this.config.apiBaseUrl, "/api/v1/products/batch/").concat(this.session.sessionId, "/cancel");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.makeRequest('POST', url)];
                    case 2:
                        response = _a.sent();
                        if (!response.ok) return [3 /*break*/, 3];
                        console.log("\u2705 Session cancelled: ".concat(this.session.sessionId));
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, response.text()];
                    case 4:
                        error = _a.sent();
                        console.warn("\u26A0\uFE0F  Failed to cancel session: ".concat(response.status, " - ").concat(error));
                        _a.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_5 = _a.sent();
                        console.warn("\u26A0\uFE0F  Error cancelling session: ".concat(error_5));
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Make HTTP request with proper error handling
     */
    MemoryEfficientBatchProcessor.prototype.makeRequest = function (method, url, body) {
        return __awaiter(this, void 0, void 0, function () {
            var options;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            method: method,
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'MemoryEfficientBatchProcessor/1.0'
                            }
                        };
                        if (body) {
                            options.body = JSON.stringify(body);
                        }
                        return [4 /*yield*/, (0, node_fetch_1["default"])(url, options)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Sleep utility for retry delays
     */
    MemoryEfficientBatchProcessor.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    /**
     * Print processing summary
     */
    MemoryEfficientBatchProcessor.prototype.printSummary = function () {
        var duration = this.stats.endTime
            ? this.stats.endTime.getTime() - this.stats.startTime.getTime()
            : Date.now() - this.stats.startTime.getTime();
        var durationSeconds = (duration / 1000).toFixed(1);
        var productsPerSecond = this.stats.totalProcessed > 0
            ? (this.stats.totalProcessed / (duration / 1000)).toFixed(1)
            : '0';
        var memUsage = process.memoryUsage();
        var memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        var maxMemUsedMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        console.log('\n' + '='.repeat(60));
        console.log('📊 PROCESSING SUMMARY');
        console.log('='.repeat(60));
        console.log("\u23F1\uFE0F  Duration: ".concat(durationSeconds, "s"));
        console.log("\uD83D\uDCE6 Total batches: ".concat(this.stats.totalBatches));
        console.log("\u2705 Products processed: ".concat(this.stats.totalProcessed));
        console.log("\u274C Products failed: ".concat(this.stats.totalFailed));
        console.log("\uD83D\uDE80 Processing rate: ".concat(productsPerSecond, " products/second"));
        console.log("\uD83C\uDFAF Success rate: ".concat(this.stats.totalProcessed > 0 ? ((this.stats.totalProcessed / (this.stats.totalProcessed + this.stats.totalFailed)) * 100).toFixed(1) : '0', "%"));
        console.log("\uD83E\uDDE0 Memory used: ".concat(memUsedMB, "MB (max: ").concat(maxMemUsedMB, "MB)"));
        if (this.errors.length > 0) {
            console.log('\n❌ ERRORS ENCOUNTERED:');
            console.log('-'.repeat(40));
            var errorsByType = this.errors.reduce(function (acc, error) {
                acc[error.type] = (acc[error.type] || 0) + 1;
                return acc;
            }, {});
            Object.entries(errorsByType).forEach(function (_a) {
                var type = _a[0], count = _a[1];
                console.log("".concat(type, ": ").concat(count, " errors"));
            });
            console.log('\nFirst few errors:');
            this.errors.slice(0, 5).forEach(function (error, index) {
                console.log("".concat(index + 1, ". [").concat(error.type, "] ").concat(error.message));
                if (error.batchNumber) {
                    console.log("   Batch: ".concat(error.batchNumber));
                }
                console.log("   Time: ".concat(error.timestamp.toISOString()));
            });
            if (this.errors.length > 5) {
                console.log("   ... and ".concat(this.errors.length - 5, " more errors"));
            }
        }
        else {
            console.log('\n✅ No errors encountered!');
        }
        console.log('='.repeat(60));
    };
    return MemoryEfficientBatchProcessor;
}());
exports.MemoryEfficientBatchProcessor = MemoryEfficientBatchProcessor;
/**
 * Main function to run the script
 */
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, config, processor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = process.argv.slice(2);
                    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
                        console.log("\n\uD83D\uDE80 Memory-Efficient Product Batch Processor\n\nUsage: node batch-processor-memory-efficient.js [options]\n\nOptions:\n  --alias <string>          Elasticsearch alias name (default: products)\n  --file <path>            Path to JSON file containing products (default: products.json)\n  --api <url>              API base URL (default: http://localhost:3333)\n  --batch-size <number>    Batch size (default: 500, max: 1000)\n  --strategy <string>      Deployment strategy: safe|auto-swap (default: safe)\n  --estimated <number>     Estimated total number of products (optional)\n  --max-retries <number>   Maximum retry attempts per batch (default: 3)\n  --retry-delay <number>   Delay between retries in ms (default: 1000)\n  --help, -h              Show this help message\n\nExamples:\n  node batch-processor-memory-efficient.js --alias products --file products_500k.json --batch-size 1000\n  node batch-processor-memory-efficient.js --alias inventory --file inventory.json --strategy auto-swap --estimated 100000\n\nMemory Efficiency Features:\n  - Streams large JSON files without loading everything into memory\n  - Processes batches concurrently with controlled concurrency\n  - Monitors memory usage in real-time\n  - Optimized for handling multi-GB files\n    ");
                        process.exit(0);
                    }
                    config = {
                        alias: getArgValue(args, '--alias') || 'products',
                        jsonFilePath: getArgValue(args, '--file') || 'products.json',
                        apiBaseUrl: getArgValue(args, '--api') || 'http://localhost:3000',
                        batchSize: Math.min(parseInt(getArgValue(args, '--batch-size') || '500'), 1000),
                        strategy: getArgValue(args, '--strategy') || 'safe',
                        estimatedTotal: getArgValue(args, '--estimated') ? parseInt(getArgValue(args, '--estimated')) : undefined,
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
                    processor = new MemoryEfficientBatchProcessor(config);
                    return [4 /*yield*/, processor.process()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get command line argument value
 */
function getArgValue(args, flag) {
    var index = args.indexOf(flag);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}
// Handle unhandled promise rejections
process.on('unhandledRejection', function (reason, promise) {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Handle uncaught exceptions
process.on('uncaughtException', function (error) {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});
// Run the script
if (require.main === module) {
    main()["catch"](function (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
}
