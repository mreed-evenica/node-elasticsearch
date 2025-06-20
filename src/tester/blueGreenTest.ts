import { ElasticClientProvider } from '../core/client/elasticClientProvider';
import { AliasManager } from '../core/management/aliasManager';
import { ProductIndexMapper } from '../product/mapping/productIndexMapper';
import { BlueGreenProductIndexer } from '../product/indexing/productIndexer';
import { Product } from '../product/models/product';
import { DeploymentStrategy } from '../core/deployment/deploymentTypes';

/**
 * Blue/Green Deployment Test Program
 * Demonstrates zero-downtime deployment capabilities
 */
class BlueGreenTestProgram {
  private readonly clientProvider: ElasticClientProvider;
  private readonly aliasManager: AliasManager;
  private readonly indexMapper: ProductIndexMapper;
  private readonly blueGreenIndexer: BlueGreenProductIndexer;
  private readonly testAlias = 'products-test';

  constructor() {
    this.clientProvider = ElasticClientProvider.instance;
    this.aliasManager = new AliasManager(this.clientProvider);
    this.indexMapper = new ProductIndexMapper(this.clientProvider, this.aliasManager);
    this.blueGreenIndexer = new BlueGreenProductIndexer(
      this.clientProvider,
      this.aliasManager,
      this.indexMapper
    );
  }

  async runTests(): Promise<void> {
    console.log('🔵🟢 Starting Blue/Green Deployment Tests...\n');

    try {
      // Test 1: Initial deployment
      await this.testInitialDeployment();
      
      // Test 2: Blue to Green deployment
      await this.testBlueToGreenDeployment();
      
      // Test 3: Manual promotion
      await this.testManualPromotion();
      
      // Test 4: Rollback
      await this.testRollback();
      
      // Test 5: Auto-swap deployment
      await this.testAutoSwapDeployment();
      
      // Test 6: Health checking
      await this.testHealthChecking();
      
      // Test 7: Filtered deployment
      await this.testFilteredDeployment();
      
      // Cleanup
      await this.cleanup();
      
      console.log('✅ All Blue/Green tests completed successfully!');
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }

  private async testInitialDeployment(): Promise<void> {
    console.log('📝 Test 1: Initial Deployment (should create blue index)');
    
    const initialProducts = this.generateTestProducts('v1', 5);
    
    const result = await this.blueGreenIndexer.deployProducts(
      this.testAlias,
      initialProducts,
      DeploymentStrategy.SAFE
    );
    
    console.log(`✅ Initial deployment completed:`);
    console.log(`   - Staging Index: ${result.stagingIndex}`);
    console.log(`   - Staging Color: ${result.stagingColor}`);
    console.log(`   - Status: ${result.deploymentStatus}`);
    
    // Promote the initial deployment
    await this.blueGreenIndexer.promoteDeployment(this.testAlias, result.stagingColor!);
    console.log(`✅ Promoted ${result.stagingColor} to active\n`);
  }

  private async testBlueToGreenDeployment(): Promise<void> {
    console.log('📝 Test 2: Blue to Green Deployment');
    
    const updatedProducts = this.generateTestProducts('v2', 7);
    
    const result = await this.blueGreenIndexer.deployProducts(
      this.testAlias,
      updatedProducts,
      DeploymentStrategy.SAFE
    );
    
    console.log(`✅ Blue to Green deployment completed:`);
    console.log(`   - Active Index: ${result.activeIndex} (${result.activeColor})`);
    console.log(`   - Staging Index: ${result.stagingIndex} (${result.stagingColor})`);
    console.log(`   - Status: ${result.deploymentStatus}\n`);
  }

  private async testManualPromotion(): Promise<void> {
    console.log('📝 Test 3: Manual Promotion');
    
    const status = await this.blueGreenIndexer.getDeploymentStatus(this.testAlias);
    
    if (status.stagingIndex && status.stagingColor) {
      console.log(`🔄 Promoting ${status.stagingColor} index...`);
      await this.blueGreenIndexer.promoteDeployment(this.testAlias, status.stagingColor);
      
      const newStatus = await this.blueGreenIndexer.getDeploymentStatus(this.testAlias);
      console.log(`✅ Promotion completed:`);
      console.log(`   - New Active: ${newStatus.activeIndex} (${newStatus.activeColor})`);
      console.log(`   - Status: ${newStatus.deploymentStatus}\n`);
    } else {
      console.log('⚠️  No staging index available for promotion\n');
    }
  }

  private async testRollback(): Promise<void> {
    console.log('📝 Test 4: Rollback Test');
    
    console.log('🔄 Performing rollback...');
    await this.blueGreenIndexer.rollbackDeployment(this.testAlias);
    
    const status = await this.blueGreenIndexer.getDeploymentStatus(this.testAlias);
    console.log(`✅ Rollback completed:`);
    console.log(`   - Active Index: ${status.activeIndex} (${status.activeColor})`);
    console.log(`   - Status: ${status.deploymentStatus}\n`);
  }

  private async testAutoSwapDeployment(): Promise<void> {
    console.log('📝 Test 5: Auto-Swap Deployment');
    
    const autoSwapProducts = this.generateTestProducts('v3-auto', 4);
    
    const result = await this.blueGreenIndexer.deployProducts(
      this.testAlias,
      autoSwapProducts,
      DeploymentStrategy.AUTO_SWAP
    );
    
    console.log(`✅ Auto-swap deployment completed:`);
    console.log(`   - Active Index: ${result.activeIndex} (${result.activeColor})`);
    console.log(`   - Status: ${result.deploymentStatus}`);
    console.log(`   - Auto-promoted: Yes\n`);
  }

  private async testHealthChecking(): Promise<void> {
    console.log('📝 Test 6: Health Checking');
    
    const status = await this.blueGreenIndexer.getDeploymentStatus(this.testAlias);
    
    if (status.activeIndex) {
      const isHealthy = await this.blueGreenIndexer.validateIndexHealth(status.activeIndex);
      const stats = await this.blueGreenIndexer.getIndexStatistics(status.activeIndex);
      
      console.log(`✅ Health check results for ${status.activeIndex}:`);
      console.log(`   - Healthy: ${isHealthy}`);
      console.log(`   - Documents: ${stats.docCount}`);
      console.log(`   - Health Status: ${stats.health}`);
      console.log(`   - Store Size: ${stats.storeSize}\n`);
    }
  }

  private async testFilteredDeployment(): Promise<void> {
    console.log('📝 Test 7: Filtered Deployment');
    
    const mixedProducts = [
      ...this.generateTestProducts('expensive', 3, 100),
      ...this.generateTestProducts('cheap', 3, 10)
    ];
    
    // Deploy only expensive products (price > 50)
    const result = await this.blueGreenIndexer.deployFilteredProducts(
      this.testAlias,
      mixedProducts,
      (product) => product.Price > 50,
      DeploymentStrategy.SAFE
    );
    
    console.log(`✅ Filtered deployment completed:`);
    console.log(`   - Total products provided: ${mixedProducts.length}`);
    console.log(`   - Staging Index: ${result.stagingIndex} (${result.stagingColor})`);
    console.log(`   - Status: ${result.deploymentStatus}\n`);
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test data...');
    
    try {
      await this.blueGreenIndexer.cleanupOldIndices(this.testAlias);
      
      // Delete remaining test indices
      const client = this.clientProvider.client;
      await client.indices.delete({ 
        index: `${this.testAlias}*`, 
        ignore_unavailable: true 
      });
      
      console.log('✅ Cleanup completed\n');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', (error as Error).message, '\n');
    }
  }

  private generateTestProducts(version: string, count: number, basePrice: number = 50): Product[] {
    const products: Product[] = [];
    
    for (let i = 1; i <= count; i++) {
      products.push({
        id: `${version}-product-${i}`,
        RecordId: i,
        ItemId: `ITEM-${version}-${i}`,
        Name: `Test Product ${i} (${version})`,
        SearchName: `test product ${i} ${version}`,
        ProductNumber: `PN-${version}-${i}`,
        Locale: 'en-US',
        OfflineImage: `image-${version}-${i}.jpg`,
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
          Url: `https://example.com/images/${version}-${i}.jpg`,
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
        ProductSchema: [`schema-${version}`],
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

  async printCurrentStatus(): Promise<void> {
    console.log('📊 Current Deployment Status:');
    const status = await this.blueGreenIndexer.getDeploymentStatus(this.testAlias);
    console.log(JSON.stringify(status, null, 2));
  }
}

// Run the tests
async function main() {
  const tester = new BlueGreenTestProgram();
  await tester.runTests();
}

// Export for use in other modules
export { BlueGreenTestProgram };

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
