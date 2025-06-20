import { Client } from '@elastic/elasticsearch';
import { ClusterHealth, ElasticsearchException } from '../types';

/**
 * Interface for Elasticsearch client provider
 */
export interface IElasticClientProvider {
  client: Client;
  isConnectedAsync(): Promise<boolean>;
  getClusterHealthAsync(): Promise<ClusterHealth>;
}

/**
 * Singleton provider for Elasticsearch client
 */
export class ElasticClientProvider implements IElasticClientProvider {
  private static _instance: ElasticClientProvider;
  private readonly _client: Client;

  private constructor() {
    console.log(process.env.ELASTICSEARCH_URL || 'Using default Elasticsearch URL: http://localhost:9200');
    this._client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        apiKey: process.env.ELASTICSEARCH_API_KEY || 'VHlUamE1Y0I0d19DaDVpeERNQVA6SGY3dHZpdjRnU1NRdXhKRE84eklwQQ==',
        // username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        // password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Gets the singleton instance
   */
  public static get instance(): ElasticClientProvider {
    if (!ElasticClientProvider._instance) {
      ElasticClientProvider._instance = new ElasticClientProvider();
    }
    return ElasticClientProvider._instance;
  }

  /**
   * Gets the Elasticsearch client
   */
  public get client(): Client {
    return this._client;
  }

  /**
   * Checks if the client is connected to Elasticsearch
   */
  public async isConnectedAsync(): Promise<boolean> {
    try {
      const response = await this._client.ping();
      return response;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets cluster health information
   */
  public async getClusterHealthAsync(): Promise<ClusterHealth> {
    try {
      const response = await this._client.cluster.health();
      return {
        clusterName: response.cluster_name,
        status: response.status,
        numberOfNodes: response.number_of_nodes
      };
    } catch (error) {
      throw new ElasticsearchException('Failed to get cluster health', error as Error);
    }
  }
}