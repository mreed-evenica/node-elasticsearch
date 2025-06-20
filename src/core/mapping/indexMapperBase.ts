import { IndicesCreateRequest, MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { IElasticClientProvider } from '../client/elasticClientProvider';
import { IAliasManager } from '../management/aliasManager';
import { ElasticsearchException } from '../types';

/**
 * Interface for index mappers
 */
export interface IIndexMapper<T> {
  createIndexAsync(indexName: string, alias?: string): Promise<string>;
  deleteIndexAsync(indexName: string): Promise<boolean>;
  indexExistsAsync(indexName: string): Promise<boolean>;
  createIndexWithAliasAsync(indexAlias: string, deleteOldIndex?: boolean): Promise<string>;
}

/**
 * Base class for index mappers
 */
export abstract class IndexMapperBase<T> implements IIndexMapper<T> {
  protected readonly clientProvider: IElasticClientProvider;
  protected readonly aliasManager: IAliasManager;

  constructor(clientProvider: IElasticClientProvider, aliasManager: IAliasManager) {
    if (!clientProvider) {
      throw new Error('clientProvider is required');
    }
    if (!aliasManager) {
      throw new Error('aliasManager is required');
    }
    
    this.clientProvider = clientProvider;
    this.aliasManager = aliasManager;
  }

  /**
   * Gets the Elasticsearch client
   */
  protected get client() {
    return this.clientProvider.client;
  }

  /**
   * Creates a new index with appropriate mappings
   */
  public async createIndexAsync(indexName: string, alias?: string): Promise<string> {
    if (!indexName?.trim()) {
      throw new Error('Index name must be specified');
    }

    try {
      // Check if index already exists
      const indexExists = await this.indexExistsAsync(indexName);
      if (indexExists) {
        throw new ElasticsearchException(`Index '${indexName}' already exists`);
      }

      const mappings: MappingTypeMapping = this.configureMappings();

      // Prepare the request for indices.create
      const createRequest: IndicesCreateRequest = {
        index: indexName,
        mappings
      };

      // Add alias if specified
      if (alias?.trim()) {
        createRequest.aliases = {
          [alias]: {}
        };
      }

      const response = await this.client.indices.create(createRequest);

      if (!response.acknowledged) {
        throw new ElasticsearchException(`Failed to create index '${indexName}'`);
      }

      return indexName;
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error creating index '${indexName}'`, error as Error);
    }
  }

  /**
   * Deletes an index
   */
  public async deleteIndexAsync(indexName: string): Promise<boolean> {
    if (!indexName?.trim()) {
      throw new Error('Index name must be specified');
    }

    try {
      const response = await this.client.indices.delete({
        index: indexName
      });
      return response.acknowledged;
    } catch (error) {
      throw new ElasticsearchException(`Error deleting index '${indexName}'`, error as Error);
    }
  }

  /**
   * Checks if an index exists
   */
  public async indexExistsAsync(indexName: string): Promise<boolean> {
    if (!indexName?.trim()) {
      throw new Error('Index name must be specified');
    }

    try {
      const response = await this.client.indices.exists({
        index: indexName
      });
      return response;
    } catch (error) {
      throw new ElasticsearchException(`Error checking if index '${indexName}' exists`, error as Error);
    }
  }

  /**
   * Creates a new index with timestamp suffix for later alias management
   * This creates only the index without managing aliases, so data can be added first
   */
  public async createIndexWithAliasAsync(indexAlias: string, deleteOldIndex = false): Promise<string> {
    if (!indexAlias?.trim()) {
      throw new Error('Index alias must be specified');
    }

    try {
      // Generate a new timestamped index name
      const newIndexName = this.generateTimestampedIndexName(indexAlias);
      const warmingAlias = `${indexAlias}_warming`;
      // Create the new index without directly attaching the alias
      await this.createIndexAsync(newIndexName, warmingAlias);

      // Return the new index name for data population
      return newIndexName;
    } catch (error) {
      if (error instanceof ElasticsearchException) {
        throw error;
      }
      throw new ElasticsearchException(`Error creating index for alias '${indexAlias}'`, error as Error);
    }
  }

  /**
   * Configures the index mappings - must be implemented by derived classes
   */
  protected abstract configureMappings(): MappingTypeMapping;

  /**
   * Generates a timestamped index name
   */
  protected generateTimestampedIndexName(baseName: string): string {
    const timestamp = new Date().toISOString()
      .replace(/[-:T.]/g, '')
      .substring(0, 17); // yyyyMMddHHmmssfff format
    return `${baseName.toLowerCase()}_${timestamp}`;
  }
}