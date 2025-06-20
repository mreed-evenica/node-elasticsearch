import { DocumentIndexer } from '../../core/indexing/documentIndexer';
import { IElasticClientProvider } from '../../core/client/elasticClientProvider';
import { IAliasManager } from '../../core/management/aliasManager';
import { Product } from '../models/product';
import { BlueGreenDeploymentManager } from '../../core/deployment/blueGreenDeploymentManager';
import { IndexHealthChecker } from '../../core/deployment/indexHealthChecker';
import { DeploymentStrategy, DeploymentState } from '../../core/deployment/deploymentTypes';
import { ProductIndexMapper } from '../mapping/productIndexMapper';

/**
 * Product-specific indexer with additional functionality
 */
export class ProductIndexer extends DocumentIndexer<Product> {
  constructor(clientProvider: IElasticClientProvider, aliasManager?: IAliasManager) {
    super(clientProvider, aliasManager);
  }

  /**
   * Indexes products with optional enrichment
   */
  public async indexProductsAsync(
    indexName: string,
    products: Product[],
    enrichProductAction?: (product: Product) => void
  ): Promise<void> {
    if (!indexName?.trim()) {
      throw new Error('Index name must be specified');
    }
    if (!products) {
      throw new Error('Products array is required');
    }

    // Make a copy to avoid modifying the input collection
    const productsToIndex = [...products];

    // Enrich products if needed
    if (enrichProductAction) {
      productsToIndex.forEach(enrichProductAction);
    }

    // Index the products
    await this.indexDocumentsAsync(indexName, productsToIndex);
  }

  /**
   * Indexes products that match specific criteria
   */
  public async indexFilteredProductsAsync(
    indexName: string,
    products: Product[],
    filterPredicate: (product: Product) => boolean
  ): Promise<number> {
    if (!filterPredicate) {
      throw new Error('Filter predicate is required');
    }

    const filteredProducts = products.filter(filterPredicate);

    if (filteredProducts.length > 0) {
      await this.indexDocumentsAsync(indexName, filteredProducts);
    }

    return filteredProducts.length;
  }

  /**
   * Updates a product by its ID
   */
  public async updateProductAsync(indexName: string, productId: number, product: Product): Promise<void> {
    await this.updateDocumentAsync(indexName, productId.toString(), product);
  }

  /**
   * Deletes a product by its ID
   */
  public async deleteProductAsync(indexName: string, productId: number): Promise<void> {
    await this.deleteDocumentAsync(indexName, productId.toString());
  }
}

/**
 * Blue/Green Product Indexer for zero-downtime deployments
 */
export class BlueGreenProductIndexer extends ProductIndexer {
  private readonly deploymentManager: BlueGreenDeploymentManager<Product & { id: any }>;
  private readonly indexMapper: ProductIndexMapper;
  private readonly healthChecker: IndexHealthChecker;
  
  constructor(
    clientProvider: IElasticClientProvider, 
    aliasManager: IAliasManager,
    indexMapper: ProductIndexMapper
  ) {
    super(clientProvider, aliasManager);
    
    this.healthChecker = new IndexHealthChecker(clientProvider);
    this.deploymentManager = new BlueGreenDeploymentManager<Product & { id: any }>(
      clientProvider,
      aliasManager,
      this.healthChecker
    );
    this.indexMapper = indexMapper;
  }

  /**
   * Deploy products using blue/green methodology
   */
  public async deployProducts(
    alias: string,
    products: Product[],
    strategy: DeploymentStrategy = DeploymentStrategy.SAFE,
    enrichProductAction?: (product: Product) => void
  ): Promise<DeploymentState> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }
    if (!products) {
      throw new Error('Products array is required');
    }

    // Make a copy and ensure each product has an id field
    const productsToIndex = products.map(product => ({
      ...product,
      id: product.id || product.RecordId.toString() // Use existing id or fallback to recordId
    }));

    // Enrich products if needed
    if (enrichProductAction) {
      productsToIndex.forEach(enrichProductAction);
    }

    console.log(`Starting blue/green deployment for alias: ${alias} with ${productsToIndex.length} products`);

    return await this.deploymentManager.deployNewIndex(
      alias, 
      productsToIndex, 
      strategy, 
      this.indexMapper
    );
  }

  /**
   * Deploy filtered products using blue/green methodology
   */
  public async deployFilteredProducts(
    alias: string,
    products: Product[],
    filterPredicate: (product: Product) => boolean,
    strategy: DeploymentStrategy = DeploymentStrategy.SAFE
  ): Promise<DeploymentState> {
    if (!filterPredicate) {
      throw new Error('Filter predicate is required');
    }

    const filteredProducts = products.filter(filterPredicate);
    console.log(`Deploying ${filteredProducts.length} filtered products out of ${products.length} total`);

    return await this.deployProducts(alias, filteredProducts, strategy);
  }

  /**
   * Switch traffic to the staging index (promote deployment)
   */
  public async promoteDeployment(alias: string, targetColor: 'blue' | 'green'): Promise<void> {
    console.log(`Promoting deployment for alias: ${alias} to ${targetColor}`);
    await this.deploymentManager.swapAlias(alias, targetColor);
  }

  /**
   * Rollback to the previous active index
   */
  public async rollbackDeployment(alias: string): Promise<void> {
    console.log(`Rolling back deployment for alias: ${alias}`);
    await this.deploymentManager.rollback(alias);
  }

  /**
   * Get current deployment status
   */
  public async getDeploymentStatus(alias: string): Promise<DeploymentState> {
    return await this.deploymentManager.getDeploymentStatus(alias);
  }

  /**
   * Clean up old indices to save space
   */
  public async cleanupOldIndices(alias: string): Promise<void> {
    console.log(`Cleaning up old indices for alias: ${alias}`);
    await this.deploymentManager.cleanupOldIndex(alias);
  }

  /**
   * Full deployment workflow: deploy, validate, and optionally auto-promote
   * This method now automatically handles initial setup if the alias doesn't exist
   */
  public async fullDeploymentWorkflow(
    alias: string,
    products: Product[],
    options: {
      autoPromote?: boolean;
      validateBeforePromote?: boolean;
      enrichProductAction?: (product: Product) => void;
      filterPredicate?: (product: Product) => boolean;
    } = {}
  ): Promise<DeploymentState> {
    // Use the enhanced workflow that can handle initial setup
    return await this.enhancedFullDeploymentWorkflow(alias, products, options);
  }

  /**
   * Health check for a specific index
   */
  public async validateIndexHealth(indexName: string): Promise<boolean> {
    return await this.healthChecker.validateIndexHealth(indexName);
  }

  /**
   * Get detailed index statistics
   */
  public async getIndexStatistics(indexName: string) {
    return await this.healthChecker.getIndexStats(indexName);
  }

  /**
   * Initialize blue/green deployment for a new alias
   */
  public async initializeBlueGreenDeployment(
    alias: string,
    products: Product[],
    initialColor: 'blue' | 'green' = 'blue'
  ): Promise<DeploymentState> {
    if (!alias?.trim()) {
      throw new Error('Alias name must be specified');
    }
    if (!products) {
      throw new Error('Products array is required');
    }

    const aliasManager = this.aliasManagerInstance;
    if (!aliasManager) {
      throw new Error('AliasManager is required for blue/green deployment initialization');
    }

    // Check if alias already exists
    const aliasExists = await aliasManager.aliasExistsAsync(alias);
    if (aliasExists) {
      throw new Error(`Alias '${alias}' already exists. Use the deploy endpoint for existing aliases.`);
    }

    // Create the initial index
    const timestamp = new Date().toISOString().replace(/[:.]/g, '');
    const initialIndexName = `${alias}_${initialColor}_${timestamp}`.toLowerCase();

    console.log(`Initializing blue/green deployment: creating ${initialIndexName}`);

    // Create index with mapping
    await this.indexMapper.createIndexAsync(initialIndexName);

    // Index the products
    const productsToIndex = products.map(product => ({
      ...product,
      id: product.id || product.RecordId.toString()
    }));

    await this.indexDocumentsAsync(initialIndexName, productsToIndex);

    // Create the alias pointing to the initial index
    await aliasManager.createAliasAsync(alias, initialIndexName);

    // Wait for the index to be ready
    await this.healthChecker.waitForIndexReady(initialIndexName, {
      timeout: 300000,
      expectedDocCount: productsToIndex.length
    });

    const initialState: DeploymentState = {
      alias,
      activeColor: initialColor,
      activeIndex: initialIndexName,
      stagingColor: undefined,
      stagingIndex: undefined,
      deploymentStatus: 'COMPLETED',
      lastDeployment: new Date(),
      strategy: DeploymentStrategy.SAFE
    };

    console.log(`Blue/green deployment initialized for alias '${alias}' with ${productsToIndex.length} products`);
    return initialState;
  }

  /**
   * Enhanced full deployment workflow that can handle initial setup
   */
  public async enhancedFullDeploymentWorkflow(
    alias: string,
    products: Product[],
    options: {
      autoPromote?: boolean;
      validateBeforePromote?: boolean;
      enrichProductAction?: (product: Product) => void;
      filterPredicate?: (product: Product) => boolean;
    } = {}
  ): Promise<DeploymentState> {
    const {
      autoPromote = false,
      validateBeforePromote = true,
      enrichProductAction,
      filterPredicate
    } = options;

    try {
      // Filter products if predicate provided
      let productsToIndex = products;
      if (filterPredicate) {
        productsToIndex = products.filter(filterPredicate);
        console.log(`Filtered ${productsToIndex.length} products out of ${products.length} total`);
      }

      const aliasManager = this.aliasManagerInstance;
      if (!aliasManager) {
        throw new Error('AliasManager is required for blue/green deployment');
      }

      // Check if alias exists
      const aliasExists = await aliasManager.aliasExistsAsync(alias);

      // If alias doesn't exist, initialize blue/green deployment
      if (!aliasExists) {
        console.log(`Alias '${alias}' not found. Initializing blue/green deployment.`);
        return await this.initializeBlueGreenDeployment(alias, productsToIndex, autoPromote ? 'green' : 'blue');
      }

      // Deploy to staging
      const strategy = autoPromote ? DeploymentStrategy.AUTO_SWAP : DeploymentStrategy.SAFE;
      const deploymentResult = await this.deployProducts(alias, productsToIndex, strategy, enrichProductAction);

      // If not auto-promoting and manual validation is required
      if (!autoPromote && validateBeforePromote && deploymentResult.stagingIndex) {
        console.log(`Deployment completed. Staging index: ${deploymentResult.stagingIndex}`);
        console.log(`Use promoteDeployment('${alias}', '${deploymentResult.stagingColor}') to switch traffic`);
      }

      return deploymentResult;

    } catch (error) {
      console.error(`Enhanced full deployment workflow failed for alias ${alias}:`, error);
      throw error;
    }
  }
}