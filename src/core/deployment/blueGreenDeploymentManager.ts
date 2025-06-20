import { IElasticClientProvider } from '../client/elasticClientProvider';
import { IAliasManager } from '../management/aliasManager';
import { IIndexHealthChecker } from './indexHealthChecker';
import { DeploymentState, DeploymentStrategy } from './deploymentTypes';

export interface IBlueGreenDeploymentManager<T> {
  deployNewIndex(alias: string, documents: T[], strategy?: DeploymentStrategy): Promise<DeploymentState>;
  swapAlias(alias: string, targetColor: 'blue' | 'green'): Promise<void>;
  rollback(alias: string): Promise<void>;
  getDeploymentStatus(alias: string): Promise<DeploymentState>;
  cleanupOldIndex(alias: string): Promise<void>;
}

export class BlueGreenDeploymentManager<T extends { id: any }> implements IBlueGreenDeploymentManager<T> {
  private readonly clientProvider: IElasticClientProvider;
  private readonly aliasManager: IAliasManager;
  private readonly healthChecker: IIndexHealthChecker;

  constructor(
    clientProvider: IElasticClientProvider,
    aliasManager: IAliasManager,
    healthChecker: IIndexHealthChecker
  ) {
    this.clientProvider = clientProvider;
    this.aliasManager = aliasManager;
    this.healthChecker = healthChecker;
  }

  async deployNewIndex(
    alias: string, 
    documents: T[], 
    strategy: DeploymentStrategy = DeploymentStrategy.SAFE,
    indexMapper?: any
  ): Promise<DeploymentState> {
    const client = this.clientProvider.client;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
      // Determine current and target colors
      const currentState = await this.getDeploymentStatus(alias);
      const targetColor = this.getNextColor(currentState.activeColor);
      const newIndexName = `${alias}-${targetColor}-${timestamp}`;

      console.log(`Starting deployment: ${alias} -> ${newIndexName}`);

      // Create new index with mapping
      if (indexMapper) {
        await indexMapper.createIndexAsync(newIndexName);
      } else {
        await client.indices.create({ index: newIndexName });
      }

      // Index documents in batches
      if (documents.length > 0) {
        await this.indexDocuments(documents, newIndexName);
      }

      // Wait for index to be ready
      await this.healthChecker.waitForIndexReady(newIndexName, {
        timeout: 300000, // 5 minutes
        expectedDocCount: documents.length
      });

      // Validate index health
      const isHealthy = await this.healthChecker.validateIndexHealth(newIndexName);
      if (!isHealthy) {
        throw new Error(`Index ${newIndexName} failed health validation`);
      }

      const newState: DeploymentState = {
        alias,
        activeColor: currentState.activeColor,
        activeIndex: currentState.activeIndex,
        stagingColor: targetColor,
        stagingIndex: newIndexName,
        deploymentStatus: 'READY_FOR_SWAP',
        lastDeployment: new Date(),
        strategy
      };

      if (strategy === DeploymentStrategy.AUTO_SWAP) {
        await this.swapAlias(alias, targetColor);
        newState.activeColor = targetColor;
        newState.activeIndex = newIndexName;
        newState.stagingColor = undefined;
        newState.stagingIndex = undefined;
        newState.deploymentStatus = 'COMPLETED';
      }

      return newState;

    } catch (error) {
      console.error(`Deployment failed for ${alias}:`, error);
      throw error;
    }
  }

  async swapAlias(alias: string, targetColor: 'blue' | 'green'): Promise<void> {
    const client = this.clientProvider.client;
    
    try {
      const currentState = await this.getDeploymentStatus(alias);
      
      if (!currentState.stagingIndex) {
        throw new Error(`No staging index available for alias ${alias}`);
      }

      if (currentState.stagingColor !== targetColor) {
        throw new Error(`Target color ${targetColor} does not match staging color ${currentState.stagingColor}`);
      }

      // Perform atomic alias swap
      const actions = [];

      // Remove alias from current index (if exists)
      if (currentState.activeIndex) {
        actions.push({
          remove: {
            index: currentState.activeIndex,
            alias: alias
          }
        });
      }

      // Add alias to new index
      actions.push({
        add: {
          index: currentState.stagingIndex,
          alias: alias
        }
      });

      await client.indices.updateAliases({
        body: { actions }
      });

      console.log(`Successfully swapped alias ${alias} to ${currentState.stagingIndex}`);

    } catch (error) {
      console.error(`Failed to swap alias ${alias}:`, error);
      throw error;
    }
  }

  async rollback(alias: string): Promise<void> {
    const currentState = await this.getDeploymentStatus(alias);
    
    if (!currentState.activeIndex) {
      throw new Error(`No active index to rollback to for alias ${alias}`);
    }

    // Find the previous index
    const previousIndexPattern = `${alias}-${this.getNextColor(currentState.activeColor)}-*`;
    const client = this.clientProvider.client;
    
    const response = await client.indices.get({
      index: previousIndexPattern,
      ignore_unavailable: true
    });

    const indices = Object.keys(response || {});
    if (indices.length === 0) {
      throw new Error(`No previous index found for rollback of alias ${alias}`);
    }

    // Get the most recent previous index
    const previousIndex = indices.sort().reverse()[0];

    // Swap back to previous index
    await client.indices.updateAliases({
      body: {
        actions: [
          {
            remove: {
              index: currentState.activeIndex,
              alias: alias
            }
          },
          {
            add: {
              index: previousIndex,
              alias: alias
            }
          }
        ]
      }
    });

    console.log(`Successfully rolled back alias ${alias} to ${previousIndex}`);
  }

  async getDeploymentStatus(alias: string): Promise<DeploymentState> {
    const client = this.clientProvider.client;
    
    try {
      // Get current alias
      const aliasResponse = await client.indices.getAlias({
        name: alias,
        ignore_unavailable: true
      });

      let activeIndex: string | undefined;
      let activeColor: 'blue' | 'green' | undefined;

      if (aliasResponse && Object.keys(aliasResponse).length > 0) {
        activeIndex = Object.keys(aliasResponse)[0];
        activeColor = this.extractColorFromIndex(activeIndex);
      }

      // Look for staging indices
      const stagingPattern = `${alias}-*`;
      const indicesResponse = await client.indices.get({
        index: stagingPattern,
        ignore_unavailable: true
      });

      let stagingIndex: string | undefined;
      let stagingColor: 'blue' | 'green' | undefined;

      if (indicesResponse) {
        const allIndices = Object.keys(indicesResponse);
        const stagingIndices = allIndices.filter(idx => idx !== activeIndex);
        
        if (stagingIndices.length > 0) {
          stagingIndex = stagingIndices.sort().reverse()[0]; // Get most recent
          stagingColor = this.extractColorFromIndex(stagingIndex);
        }
      }

      return {
        alias,
        activeColor,
        activeIndex,
        stagingColor,
        stagingIndex,
        deploymentStatus: stagingIndex ? 'READY_FOR_SWAP' : 'IDLE',
        lastDeployment: new Date(),
        strategy: DeploymentStrategy.SAFE
      };

    } catch (error) {
      console.error(`Failed to get deployment status for ${alias}:`, error);
      throw error;
    }
  }

  async cleanupOldIndex(alias: string): Promise<void> {
    const client = this.clientProvider.client;
    const currentState = await this.getDeploymentStatus(alias);

    if (!currentState.activeIndex) {
      return;
    }

    const oldColor = this.getNextColor(currentState.activeColor);
    const oldIndexPattern = `${alias}-${oldColor}-*`;

    try {
      const response = await client.indices.get({
        index: oldIndexPattern,
        ignore_unavailable: true
      });

      const indicesToDelete = Object.keys(response || {})
        .filter(idx => idx !== currentState.activeIndex);

      for (const index of indicesToDelete) {
        await client.indices.delete({ index });
        console.log(`Deleted old index: ${index}`);
      }

    } catch (error) {
      console.error(`Failed to cleanup old indices for ${alias}:`, error);
      throw error;
    }
  }

  private async indexDocuments(documents: T[], indexName: string): Promise<void> {
    const client = this.clientProvider.client;
    const batchSize = 100;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const body = batch.flatMap(doc => [
        { index: { _index: indexName, _id: doc.id } },
        doc
      ]);

      const response = await client.bulk({ body, refresh: true });

      if (response.errors) {
        const erroredDocuments = response.items.filter((item: any) => {
          const operation = Object.keys(item)[0];
          return item[operation].error;
        });
        
        console.error(`Bulk indexing errors for batch ${i}-${i + batch.length}:`, erroredDocuments);
      }
    }

    console.log(`Successfully indexed ${documents.length} documents to ${indexName}`);
  }

  private getNextColor(currentColor?: 'blue' | 'green'): 'blue' | 'green' {
    return currentColor === 'blue' ? 'green' : 'blue';
  }

  private extractColorFromIndex(indexName: string): 'blue' | 'green' | undefined {
    if (indexName.includes('-blue-')) return 'blue';
    if (indexName.includes('-green-')) return 'green';
    return undefined;
  }
}
