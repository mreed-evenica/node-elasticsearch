import { IElasticClientProvider } from '../client/elasticClientProvider';
import { HealthCheckOptions } from './deploymentTypes';

export interface IIndexHealthChecker {
  validateIndexHealth(indexName: string): Promise<boolean>;
  waitForIndexReady(indexName: string, options?: HealthCheckOptions): Promise<void>;
  getIndexStats(indexName: string): Promise<IndexStats>;
}

export interface IndexStats {
  docCount: number;
  storeSize: string;
  indexingRate: number;
  searchRate: number;
  health: 'green' | 'yellow' | 'red';
}

export class IndexHealthChecker implements IIndexHealthChecker {
  private readonly clientProvider: IElasticClientProvider;

  constructor(clientProvider: IElasticClientProvider) {
    this.clientProvider = clientProvider;
  }

  async validateIndexHealth(indexName: string): Promise<boolean> {
    const client = this.clientProvider.client;

    try {
      // Check cluster health for the specific index
      const healthResponse = await client.cluster.health({
        index: indexName,
        wait_for_status: 'yellow',
        timeout: '30s'
      });

      if (healthResponse.status === 'red') {
        console.error(`Index ${indexName} has red status`);
        return false;
      }

      // Check if index exists and is ready
      const existsResponse = await client.indices.exists({ index: indexName });
      if (!existsResponse) {
        console.error(`Index ${indexName} does not exist`);
        return false;
      }

      // Check index stats
      const statsResponse = await client.indices.stats({ index: indexName });
      const stats = statsResponse.indices?.[indexName];

      if (!stats) {
        console.error(`Could not retrieve stats for index ${indexName}`);
        return false;
      }

      console.log(`Index ${indexName} health validation passed`);
      return true;

    } catch (error) {
      console.error(`Health validation failed for index ${indexName}:`, error);
      return false;
    }
  }

  async waitForIndexReady(indexName: string, options: HealthCheckOptions = {}): Promise<void> {
    const {
      timeout = 60000,
      expectedDocCount,
      checkInterval = 2000
    } = options;

    const startTime = Date.now();
    const client = this.clientProvider.client;

    while (Date.now() - startTime < timeout) {
      try {
        // Check if index exists
        const existsResponse = await client.indices.exists({ index: indexName });
        if (!existsResponse) {
          await this.sleep(checkInterval);
          continue;
        }

        // Check document count if expected
        if (expectedDocCount !== undefined) {
          const countResponse = await client.count({ index: indexName });
          const actualCount = countResponse.count;

          if (actualCount < expectedDocCount) {
            console.log(`Index ${indexName}: ${actualCount}/${expectedDocCount} documents`);
            await this.sleep(checkInterval);
            continue;
          }
        }

        // Check cluster health
        const healthResponse = await client.cluster.health({
          index: indexName,
          wait_for_status: 'yellow',
          timeout: '10s'
        });

        if (healthResponse.status !== 'red') {
          console.log(`Index ${indexName} is ready`);
          return;
        }

      } catch (error) {
        console.warn(`Health check failed for ${indexName}, retrying...`, error);
      }

      await this.sleep(checkInterval);
    }

    throw new Error(`Index ${indexName} not ready within ${timeout}ms timeout`);
  }

  async getIndexStats(indexName: string): Promise<IndexStats> {
    const client = this.clientProvider.client;

    try {
      const [statsResponse, healthResponse] = await Promise.all([
        client.indices.stats({ index: indexName }),
        client.cluster.health({ index: indexName })
      ]);

      const stats = statsResponse.indices?.[indexName];
      const health = healthResponse;

      return {
        docCount: stats?.total?.docs?.count || 0,
        storeSize: this.formatBytes(stats?.total?.store?.size_in_bytes || 0),
        indexingRate: stats?.total?.indexing?.index_current || 0,
        searchRate: stats?.total?.search?.query_current || 0,
        health: health.status as 'green' | 'yellow' | 'red'
      };

    } catch (error) {
      console.error(`Failed to get stats for index ${indexName}:`, error);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
