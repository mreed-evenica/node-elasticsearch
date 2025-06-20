import { Context } from 'koa';

/**
 * Elasticsearch exception with additional context
 */
export class ElasticsearchException extends Error {
  public statusCode?: number;
  public indexName?: string;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ElasticsearchException';
    if (cause) {
      this.stack = cause.stack;
    }
  }
}

/**
 * Cluster health response
 */
export interface ClusterHealth {
  clusterName: string;
  status: string;
  numberOfNodes: number;
}

/**
 * Search response wrapper
 */
export interface SearchResponse<T> {
  total: number;
  hits: Array<{
    source: T;
    score?: number;
  }>;
}

/**
 * Bulk operation response
 */
export interface BulkResponse {
  isValidResponse: boolean;
  errors: boolean;
  items: BulkOperationItem[];
}

/**
 * Index response
 */
export interface IndexResponse {
  isValidResponse: boolean;
  id?: string;
  index?: string;
  result?: string;
}

/**
 * Update response
 */
export interface UpdateResponse<T> {
  isValidResponse: boolean;
  id?: string;
  index?: string;
  result?: string;
}

/**
 * Delete response
 */
export interface DeleteResponse {
  isValidResponse: boolean;
  id?: string;
  index?: string;
  result?: string;
}

/**
 * Elasticsearch bulk operation item
 */
export interface BulkOperationItem {
  index?: {
    _index: string;
    _id: string;
    error?: {
      type: string;
      reason: string;
      status?: number;
    };
    status?: number;
  };
  create?: {
    _index: string;
    _id: string;
    error?: {
      type: string;
      reason: string;
      status?: number;
    };
    status?: number;
  };
  update?: {
    _index: string;
    _id: string;
    error?: {
      type: string;
      reason: string;
      status?: number;
    };
    status?: number;
  };
  delete?: {
    _index: string;
    _id: string;
    error?: {
      type: string;
      reason: string;
      status?: number;
    };
    status?: number;
  };
}

/**
 * Elasticsearch bulk response
 */
export interface ElasticsearchBulkResponse {
  took: number;
  errors: boolean;
  items: BulkOperationItem[];
}

/**
 * Batch processing error
 */
export interface BatchError {
  document?: unknown;
  error: string | {
    type: string;
    reason: string;
    status?: number;
  };
  index?: number;
  batchNumber?: number;
  timestamp?: Date;
  phase?: string;
}

/**
 * Extended Koa Context for type safety
 */
export interface ExtendedKoaContext extends Context {
  params: {
    alias?: string;
    sessionId?: string;
  };
  query: {
    strategy?: string;
    estimatedTotal?: string;
    targetIndex?: string;
  };
  request: Context['request'] & {
    body?: unknown;
  };
}