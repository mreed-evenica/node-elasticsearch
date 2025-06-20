import { IElasticClientProvider } from '../client/elasticClientProvider';
import { ElasticsearchException } from '../types';

/**
 * Elasticsearch alias action types
 */
export interface AliasAction {
  add?: {
    index: string;
    alias: string;
  };
  remove?: {
    index: string;
    alias: string;
  };
}

/**
 * Interface for alias management operations
 */
export interface IAliasManager {
  aliasExistsAsync(alias: string): Promise<boolean>;
  getIndicesForAliasAsync(alias: string): Promise<string[]>;
  swapAliasAsync(alias: string, newIndexName: string, deleteOldIndices?: boolean): Promise<boolean>;
  createAliasAsync(alias: string, indexName: string): Promise<boolean>;
}

/**
 * Manages Elasticsearch aliases
 */
export class AliasManager implements IAliasManager {
  constructor(private readonly clientProvider: IElasticClientProvider) { }

  /**
   * Checks if an alias exists
   */
  public async aliasExistsAsync(alias: string): Promise<boolean> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }

    try {
      const response = await this.clientProvider.client.indices.existsAlias({
        name: alias
      });
      return response;
    } catch (error) {
      throw new ElasticsearchException(`Error checking if alias '${alias}' exists`, error as Error);
    }
  }

  /**
   * Gets all indices associated with an alias
   */
  public async getIndicesForAliasAsync(alias: string): Promise<string[]> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }

    try {
      const response = await this.clientProvider.client.indices.getAlias({
        name: alias
      });
      return Object.keys(response);
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return [];
      }
      throw new ElasticsearchException(`Error getting indices for alias '${alias}'`, error as Error);
    }
  }

  /**
   * Swaps an alias to point to a new index, optionally deleting old indices
   */
  public async swapAliasAsync(alias: string, newIndexName: string, deleteOldIndices = false): Promise<boolean> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }
    if (!newIndexName?.trim()) {
      throw new Error('New index name must be specified');
    }

    try {
      const existingIndices = await this.getIndicesForAliasAsync(alias);

      const actions: AliasAction[] = [];

      // Remove alias from existing indices
      for (const index of existingIndices) {
        if (index !== newIndexName) {
          actions.push({
            remove: {
              index: index,
              alias: alias
            }
          });
        }
      }

      // Add alias to new index
      actions.push({
        add: {
          index: newIndexName,
          alias: alias
        }
      });

      // Execute alias update
      const response = await this.clientProvider.client.indices.updateAliases({
        body: { actions }
      });
      if (!response.acknowledged) {
        throw new ElasticsearchException(`Failed to update alias '${alias}' to '${newIndexName}'`, new Error('Update not acknowledged'));
      }
      // Delete old indices if requested
      if (deleteOldIndices && existingIndices.length > 0) {
        for (const index of existingIndices) {
          if (index !== newIndexName) {
            try {
              await this.clientProvider.client.indices.delete({ index });
            } catch (deleteError) {
              console.warn(`Failed to delete old index '${index}':`, deleteError);
            }
          }
        }
      }

      return true;
    } catch (error) {
      throw new ElasticsearchException(`Error swapping alias '${alias}' to '${newIndexName}'`, error as Error);
    }
  }

  /**
   * Creates a new alias pointing to an index
   */
  public async createAliasAsync(alias: string, indexName: string): Promise<boolean> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }
    if (!indexName?.trim()) {
      throw new Error('Index name must be specified');
    }

    try {
      const response = await this.clientProvider.client.indices.updateAliases({
        body: {
          actions: [
            {
              add: {
                index: indexName,
                alias: alias
              }
            }
          ]
        }
      });

      return response.acknowledged;
    } catch (error) {
      throw new ElasticsearchException(`Error creating alias '${alias}' for index '${indexName}'`, error as Error);
    }
  }
}