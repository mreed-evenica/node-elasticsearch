import { IElasticClientProvider } from '../client/elasticClientProvider';
import { IAliasManager } from '../management/aliasManager';
import { ElasticsearchException, BulkResponse, IndexResponse, UpdateResponse, DeleteResponse } from '../types';

/**
 * Interface for document indexing operations
 */
export interface IDocumentIndexer<T> {
  indexDocumentsAsync(indexName: string, documents: T[], batchSize?: number, alias?: string): Promise<BulkResponse>;
  indexDocumentAsync(indexName: string, document: T, id?: string, alias?: string): Promise<IndexResponse>;
  getDocumentCountAsync(indexName: string, alias?: string): Promise<number>;
  updateDocumentAsync(indexName: string, id: string, document: T, alias?: string): Promise<UpdateResponse<T>>;
  deleteDocumentAsync(indexName: string, id: string, alias?: string): Promise<DeleteResponse>;
}

/**
 * Default implementation for document indexing
 */
export class DocumentIndexer<T> implements IDocumentIndexer<T> {
  constructor(
    private readonly clientProvider: IElasticClientProvider,
    private readonly aliasManager?: IAliasManager
  ) {}

  /**
   * Gets the Elasticsearch client
   */
  protected get client() {
    return this.clientProvider.client;
  }

  /**
   * Gets the alias manager (for use in derived classes)
   */
  protected get aliasManagerInstance(): IAliasManager | undefined {
    return this.aliasManager;
  }

  /**
   * Indexes a batch of documents
   */
  public async indexDocumentsAsync(
    indexName: string,
    documents: T[],
    batchSize = 1000,
    alias?: string
  ): Promise<BulkResponse> {
    const resolvedIndexName = await this.resolveIndexNameAsync(indexName, alias);

    if (!documents || documents.length === 0) {
      return { isValidResponse: true, errors: false, items: [] };
    }

    try {
      let lastResponse: any;

      // Process in batches
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        const body = batch.flatMap(doc => [
          { index: { _index: resolvedIndexName } },
          doc
        ]);

        const response = await this.client.bulk({ body });


        if (response.errors) {
          const failedItems = response.items.filter((item: any) => item.index?.error);
          throw new ElasticsearchException(`${failedItems.length} documents failed to index to '${resolvedIndexName}'`);
        }

        lastResponse = {
          isValidResponse: true,
          errors: response.errors,
          items: response.items
        };
      }

      return lastResponse || { isValidResponse: true, errors: false, items: [] };
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error indexing documents to '${resolvedIndexName}'`, error as Error);
    }
  }

  /**
   * Indexes a single document
   */
  public async indexDocumentAsync(
    indexName: string,
    document: T,
    id?: string,
    alias?: string
  ): Promise<IndexResponse> {
    const resolvedIndexName = await this.resolveIndexNameAsync(indexName, alias);

    if (!document) {
      throw new Error('Document is required');
    }

    try {
      const params: any = {
        index: resolvedIndexName,
        body: document
      };

      if (id) {
        params.id = id;
      }

      const response = await this.client.index(params);

      return {
        isValidResponse: true,
        id: response._id,
        index: response._index,
        result: response.result
      };
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error indexing document to '${resolvedIndexName}'`, error as Error);
    }
  }

  /**
   * Gets the document count for an index
   */
  public async getDocumentCountAsync(indexName: string, alias?: string): Promise<number> {
    const resolvedIndexName = await this.resolveIndexNameAsync(indexName, alias);

    try {
      const response = await this.client.count({
        index: resolvedIndexName
      });

      return response.count;
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error getting document count for '${resolvedIndexName}'`, error as Error);
    }
  }

  /**
   * Updates a document in the index
   */
  public async updateDocumentAsync(
    indexName: string,
    id: string,
    document: T,
    alias?: string
  ): Promise<UpdateResponse<T>> {
    const resolvedIndexName = await this.resolveIndexNameAsync(indexName, alias);

    if (!id?.trim()) {
      throw new Error('Document ID must be specified');
    }
    if (!document) {
      throw new Error('Document is required');
    }

    try {
      const response = await this.client.update({
        index: resolvedIndexName,
        id,
        body: {
          doc: document,
          doc_as_upsert: true
        }
      });


      return {
        isValidResponse: true,
        id: response._id,
        index: response._index,
        result: response.result
      };
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error updating document ${id} in '${resolvedIndexName}'`, error as Error);
    }
  }

  /**
   * Deletes a document from the index
   */
  public async deleteDocumentAsync(
    indexName: string,
    id: string,
    alias?: string
  ): Promise<DeleteResponse> {
    const resolvedIndexName = await this.resolveIndexNameAsync(indexName, alias);

    if (!id?.trim()) {
      throw new Error('Document ID must be specified');
    }

    try {
      const response = await this.client.delete({
        index: resolvedIndexName,
        id
      });


      return {
        isValidResponse: true,
        id: response._id,
        index: response._index,
        result: response.result
      };
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error deleting document ${id} from '${resolvedIndexName}'`, error as Error);
    }
  }

  /**
   * Resolves the actual index name to use
   */
  private async resolveIndexNameAsync(indexName: string, alias?: string): Promise<string> {
    // If index name is provided, use it
    if (indexName?.trim()) {
      return indexName;
    }

    // If no index name but alias is provided, look up the most recent index for that alias
    if (alias?.trim()) {
      if (!this.aliasManager) {
        throw new Error('AliasManager is required when using alias-based index resolution');
      }

      const aliasExists = await this.aliasManager.aliasExistsAsync(alias);
      if (!aliasExists) {
        throw new ElasticsearchException(`Alias '${alias}' does not exist`);
      }

      const indices = await this.aliasManager.getIndicesForAliasAsync(alias);
      if (!indices || indices.length === 0) {
        throw new ElasticsearchException(`No indices found for alias '${alias}'`);
      }

      // Find the most recent index (assuming timestamps in index names)
      return this.getMostRecentIndex(indices, alias);
    }

    // Neither index name nor alias was provided
    throw new Error('Either index name or alias must be specified');
  }

  /**
   * Gets the most recent index from a list of indices
   */
  private getMostRecentIndex(indices: string[], alias: string): string {
    if (indices.length === 1) {
      return indices[0];
    }

    // Try to find timestamped indices in format alias_yyyyMMddHHmmssfff
    const timestampPattern = new RegExp(`${alias}_(\\d{17})`);

    const timestampedIndices = indices
      .map(name => {
        const match = timestampPattern.exec(name);
        return {
          name,
          timestamp: match ? match[1] : null
        };
      })
      .filter(x => x.timestamp)
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')); // Sort by timestamp desc

    if (timestampedIndices.length > 0) {
      return timestampedIndices[0].name;
    }

    // Fallback: return the first index
    console.warn(`Warning: No timestamped indices found for alias '${alias}'. Using first available index.`);
    return indices[0];
  }
}