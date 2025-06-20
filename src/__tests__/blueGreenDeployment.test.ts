import { ElasticClientProvider } from '../core/client/elasticClientProvider';
import { AliasManager } from '../core/management/aliasManager';
import { ProductIndexMapper } from '../product/mapping/productIndexMapper';
import { BlueGreenProductIndexer } from '../product/indexing/productIndexer';
import { BlueGreenDeploymentManager } from '../core/deployment/blueGreenDeploymentManager';
import { IndexHealthChecker } from '../core/deployment/indexHealthChecker';
import { Product } from '../product/models/product';
import { DeploymentStrategy } from '../core/deployment/deploymentTypes';

describe('Blue/Green Deployment System', () => {
  let clientProvider: ElasticClientProvider;
  let aliasManager: AliasManager;
  let indexMapper: ProductIndexMapper;
  let blueGreenIndexer: BlueGreenProductIndexer;
  let deploymentManager: BlueGreenDeploymentManager<Product & { id: any }>;
  let healthChecker: IndexHealthChecker;
  let testAlias: string;

  beforeAll(async () => {
    clientProvider = ElasticClientProvider.instance;
    aliasManager = new AliasManager(clientProvider);
    indexMapper = new ProductIndexMapper(clientProvider, aliasManager);
    healthChecker = new IndexHealthChecker(clientProvider);
    blueGreenIndexer = new BlueGreenProductIndexer(clientProvider, aliasManager, indexMapper);
    deploymentManager = new BlueGreenDeploymentManager(clientProvider, aliasManager, healthChecker);
  });

  beforeEach(() => {
    testAlias = `test-products-${Date.now()}`;
  });

  afterEach(async () => {
    // Cleanup test indices
    try {
      const client = clientProvider.client;
      await client.indices.delete({ 
        index: `${testAlias}*`, 
        ignore_unavailable: true 
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('IndexHealthChecker', () => {
    test('should validate index health correctly', async () => {
      // Create a test index
      const testIndex = `${testAlias}-health-test`;
      await indexMapper.createIndexAsync(testIndex);

      const isHealthy = await healthChecker.validateIndexHealth(testIndex);
      expect(isHealthy).toBe(true);

      // Clean up
      await clientProvider.client.indices.delete({ index: testIndex });
    }, 30000);

    test('should return false for non-existent index', async () => {
      const isHealthy = await healthChecker.validateIndexHealth('non-existent-index');
      expect(isHealthy).toBe(false);
    });

    test('should get index statistics', async () => {
      const testIndex = `${testAlias}-stats-test`;
      await indexMapper.createIndexAsync(testIndex);

      const stats = await healthChecker.getIndexStats(testIndex);
      expect(stats).toHaveProperty('docCount');
      expect(stats).toHaveProperty('health');
      expect(stats).toHaveProperty('storeSize');
      expect(stats.docCount).toBeGreaterThanOrEqual(0);

      // Clean up
      await clientProvider.client.indices.delete({ index: testIndex });
    }, 30000);
  });

  describe('BlueGreenDeploymentManager', () => {
    test('should deploy to blue index on first deployment', async () => {
      const testProducts = createTestProducts(3);

      const result = await deploymentManager.deployNewIndex(
        testAlias, 
        testProducts, 
        DeploymentStrategy.SAFE,
        indexMapper
      );

      expect(result.alias).toBe(testAlias);
      expect(result.stagingColor).toBe('blue');
      expect(result.stagingIndex).toContain(`${testAlias}-blue-`);
      expect(result.deploymentStatus).toBe('READY_FOR_SWAP');
    }, 60000);

    test('should auto-swap when using AUTO_SWAP strategy', async () => {
      const testProducts = createTestProducts(2);

      const result = await deploymentManager.deployNewIndex(
        testAlias,
        testProducts,
        DeploymentStrategy.AUTO_SWAP,
        indexMapper
      );

      expect(result.deploymentStatus).toBe('COMPLETED');
      expect(result.activeColor).toBe('blue');
      expect(result.activeIndex).toContain(`${testAlias}-blue-`);
    }, 60000);

    test('should switch from blue to green', async () => {
      // First deployment (blue)
      const blueProducts = createTestProducts(2, 'blue');
      await deploymentManager.deployNewIndex(testAlias, blueProducts, DeploymentStrategy.AUTO_SWAP, indexMapper);

      // Second deployment (green)
      const greenProducts = createTestProducts(3, 'green');
      const result = await deploymentManager.deployNewIndex(testAlias, greenProducts, DeploymentStrategy.SAFE, indexMapper);

      expect(result.activeColor).toBe('blue');
      expect(result.stagingColor).toBe('green');

      // Perform the swap
      await deploymentManager.swapAlias(testAlias, 'green');

      // Verify the swap
      const status = await deploymentManager.getDeploymentStatus(testAlias);
      expect(status.activeColor).toBe('green');
    }, 90000);

    test('should handle empty document deployment', async () => {
      const result = await deploymentManager.deployNewIndex(
        testAlias,
        [],
        DeploymentStrategy.SAFE,
        indexMapper
      );

      expect(result.stagingColor).toBe('blue');
      expect(result.deploymentStatus).toBe('READY_FOR_SWAP');
    }, 30000);

    test('should get deployment status correctly', async () => {
      const status = await deploymentManager.getDeploymentStatus('non-existent-alias');
      
      expect(status.alias).toBe('non-existent-alias');
      expect(status.activeColor).toBeUndefined();
      expect(status.deploymentStatus).toBe('IDLE');
    });
  });

  describe('BlueGreenProductIndexer', () => {
    test('should deploy products successfully', async () => {
      const products = createTestProducts(5);

      const result = await blueGreenIndexer.deployProducts(
        testAlias,
        products,
        DeploymentStrategy.SAFE
      );

      expect(result.alias).toBe(testAlias);
      expect(result.stagingColor).toBeDefined();
      expect(result.deploymentStatus).toBe('READY_FOR_SWAP');
    }, 60000);

    test('should deploy filtered products', async () => {
      const products = [
        ...createTestProducts(2, 'expensive', 100),
        ...createTestProducts(2, 'cheap', 10)
      ];

      const result = await blueGreenIndexer.deployFilteredProducts(
        testAlias,
        products,
        (product) => product.Price > 50,
        DeploymentStrategy.SAFE
      );

      expect(result.stagingColor).toBeDefined();
      expect(result.deploymentStatus).toBe('READY_FOR_SWAP');
    }, 60000);

    test('should perform full deployment workflow', async () => {
      const products = createTestProducts(3);

      const result = await blueGreenIndexer.fullDeploymentWorkflow(testAlias, products, {
        autoPromote: true,
        validateBeforePromote: true
      });

      expect(result.alias).toBe(testAlias);
      // With autoPromote, it should be completed
      expect(result.deploymentStatus).toBe('COMPLETED');
    }, 60000);

    test('should validate index health', async () => {
      const products = createTestProducts(2);
      const result = await blueGreenIndexer.deployProducts(testAlias, products, DeploymentStrategy.AUTO_SWAP);

      const isHealthy = await blueGreenIndexer.validateIndexHealth(result.activeIndex!);
      expect(isHealthy).toBe(true);
    }, 60000);

    test('should get index statistics', async () => {
      const products = createTestProducts(3);
      const result = await blueGreenIndexer.deployProducts(testAlias, products, DeploymentStrategy.AUTO_SWAP);

      const stats = await blueGreenIndexer.getIndexStatistics(result.activeIndex!);
      expect(stats.docCount).toBe(3);
      expect(stats.health).toMatch(/^(green|yellow)$/);
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should throw error for empty alias name', async () => {
      const products = createTestProducts(1);

      await expect(blueGreenIndexer.deployProducts('', products))
        .rejects
        .toThrow('Alias name must be specified');
    });

    test('should throw error for null products', async () => {
      await expect(blueGreenIndexer.deployProducts(testAlias, null as any))
        .rejects
        .toThrow('Products array is required');
    });

    test('should throw error when swapping to non-existent staging index', async () => {
      await expect(deploymentManager.swapAlias('non-existent', 'blue'))
        .rejects
        .toThrow('No staging index available');
    });
  });
});

function createTestProducts(count: number, prefix: string = 'test', basePrice: number = 50): (Product & { id: any })[] {
  const products: (Product & { id: any })[] = [];
  
  for (let i = 1; i <= count; i++) {
    products.push({
      id: `${prefix}-${i}`,
      RecordId: i,
      ItemId: `ITEM-${prefix}-${i}`,
      Name: `Test Product ${i} (${prefix})`,
      SearchName: `test product ${i} ${prefix}`,
      ProductNumber: `PN-${prefix}-${i}`,
      Locale: 'en-US',
      OfflineImage: `image-${prefix}-${i}.jpg`,
      BasePrice: basePrice + (i * 5),
      Price: basePrice + (i * 5),
      DefaultUnitOfMeasure: 'each',
      CategoryIds: [1, 2],
      DisplayOrderInCategories: [
      { CategoryId: 1, DisplayOrder: i },
      { CategoryId: 2, DisplayOrder: i + 10 }
      ],
      Images: {
      Items: [
        {
        Url: `https://example.com/images/${prefix}-${i}.jpg`,
        AltText: `Image for product ${i}`,
        IsSelfHosted: false,
        IsDefault: true,
        Priority: 1
        }
      ]
      },
      RetailContext: {
      ChannelId: 1,
      CatalogId: 1
      },
      Rules: {
      ProductId: i,
      HasLinkedProducts: false,
      IsBlocked: false,
      DateOfBlocking: new Date(),
      DateToActivate: new Date(),
      DateToBlock: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      PriceKeyingRequirementValue: 0,
      QuantityKeyingRequirementValue: 0,
      MustKeyInComment: false,
      CanQuantityBecomeNegative: false,
      MustScaleItem: false,
      CanPriceBeZero: false,
      IsSerialized: false,
      IsActiveInSalesProcess: true,
      DefaultUnitOfMeasure: 'each',
      ExtensionProperties: []
      },
      HasLinkedProducts: false,
      IsMasterProduct: i === 1,
      IsKit: false,
      IsRemote: false,
      ProductsRelatedToThis: [],
      ProductSchema: [`schema-${prefix}`],
      ProductProperties: [],
      CompositionInformation: {},
      DefaultProductProperties: {},
      ParentKits: [],
      LinkedProducts: [],
      ChangeTrackingInformation: {
      ModifiedDateTime: new Date(),
      ChangeActionValue: 1,
      RequestedActionValue: 1
      }
    });
  }
  
  return products;
}
