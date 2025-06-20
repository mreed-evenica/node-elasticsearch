// import * as readline from 'readline';
// import * as fs from 'fs/promises';
// import * as path from 'path';
// import { ElasticClientProvider } from '../core/client/elasticClientProvider';
// import { AliasManager } from '../core/management/aliasManager';
// import { ProductIndexMapper } from '../product/mapping/productIndexMapper';
// import { ProductIndexer } from '../product/indexing/productIndexer';
// import { Product } from '../product/models/product';
// import { ElasticsearchException } from '../core/types';

// /**
//  * Console application for testing Elasticsearch indexing and searching
//  */
// class Program {
//   private static readonly PRODUCTS_FILE_PATH = path.join(process.cwd(), 'products.json');
//   private static readonly INDEX_ALIAS = 'products';

//   // Services
//   private static clientProvider = ElasticClientProvider.instance;
//   private static aliasManager = new AliasManager(Program.clientProvider);
//   private static indexMapper = new ProductIndexMapper(Program.clientProvider, Program.aliasManager);
//   private static indexer = new ProductIndexer(Program.clientProvider, Program.aliasManager);
  
//   // State
//   private static products: Product[] | null = null;
//   private static currentIndexName: string = '';
  
//   private static rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   /**
//    * Main entry point
//    */
//   public static async main(): Promise<void> {
//     try {
//       Program.displayHeader('Elasticsearch Product Indexer');

//       let exit = false;
//       while (!exit) {
//         Program.displayMenu();
//         const choice = await Program.question('Enter your choice (1-6): ');

//         switch (choice) {
//           case '1':
//             await Program.checkConnectionAsync();
//             break;
//           case '2':
//             await Program.createIndexWithMappingsAsync();
//             break;
//           case '3':
//             await Program.loadAndIndexProductsAsync();
//             break;
//           case '4':
//             await Program.testSearchAsync();
//             break;
//           case '5':
//             await Program.updateAliasAsync();
//             break;
//           case '6':
//             exit = true;
//             break;
//           default:
//             console.log('Invalid choice. Please try again.');
//             break;
//         }

//         if (!exit) {
//           await Program.question('\nPress any key to continue...');
//           console.clear();
//           Program.displayHeader('Elasticsearch Product Indexer');
//         }
//       }

//       console.log('\nThank you for using the Elasticsearch Product Indexer!');
//     } catch (error) {
//       if (error instanceof ElasticsearchException) {
//         console.log(`\n❌ Elasticsearch error: ${error.message}`);
//         console.log(`Status Code: ${error.statusCode}`);
//         console.log(`Index: ${error.indexName}`);
//       } else {
//         console.log(`\n❌ Error: ${(error as Error).message}`);
//         console.log((error as Error).stack);
//       }
//     } finally {
//       Program.rl.close();
//     }
//   }

//   private static displayHeader(title: string): void {
//     console.log(title);
//     console.log('='.repeat(title.length));
//     console.log();
//   }

//   private static displayMenu(): void {
//     console.log('Menu Options:');
//     console.log('1. Check Connection and Cluster Health');
//     console.log('2. Create New Index with Mappings');
//     console.log('3. Load and Index Products');
//     console.log('4. Test Search Functionality');
//     console.log('5. Update/Swap Alias');
//     console.log('6. Exit');
//     console.log();
//   }

//   private static async question(prompt: string): Promise<string> {
//     return new Promise((resolve) => {
//       Program.rl.question(prompt, resolve);
//     });
//   }

//   private static async checkConnectionAsync(): Promise<void> {
//     console.log('\nChecking connection to Elasticsearch...');

//     if (await Program.clientProvider.isConnectedAsync()) {
//       console.log('✓ Successfully connected to Elasticsearch');

//       // Get cluster health
//       const health = await Program.clientProvider.getClusterHealthAsync();
//       console.log(`Cluster: ${health.clusterName}, Status: ${health.status}, Nodes: ${health.numberOfNodes}`);

//       // Get current indices for the alias if it exists
//       if (await Program.aliasManager.aliasExistsAsync(Program.INDEX_ALIAS)) {
//         const indices = await Program.aliasManager.getIndicesForAliasAsync(Program.INDEX_ALIAS);
//         console.log(`Current indices for alias '${Program.INDEX_ALIAS}': ${indices.join(', ')}`);
//       } else {
//         console.log(`Alias '${Program.INDEX_ALIAS}' does not exist yet.`);
//       }
//     } else {
//       console.log('❌ Failed to connect to Elasticsearch');
//     }
//   }

//   private static async createIndexWithMappingsAsync(): Promise<void> {
//     console.log('\nCreating new index with product mappings...');

//     const prefix = await Program.question('Enter index name prefix (default is "products"): ') || Program.INDEX_ALIAS;
    
//     // Generate a timestamped index name
//     Program.currentIndexName = `${prefix}_${new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 17)}`;

//     // Create the index with mappings
//     await Program.indexMapper.createIndexAsync(Program.currentIndexName, Program.INDEX_ALIAS);

//     console.log(`✓ Created index: ${Program.currentIndexName}`);
//   }

//   private static async loadAndIndexProductsAsync(): Promise<void> {
//     console.log('\nLoading and indexing products...');

//     // Load products if not already loaded
//     if (!Program.products) {
//       Program.products = await Program.loadProductsAsync();
//       console.log(`Loaded ${Program.products.length} products from file`);
//     }

//     const batchSizeInput = await Program.question('Enter batch size for indexing (default is 100): ');
//     const batchSize = parseInt(batchSizeInput) || 100;

//     // Index the products
//     await Program.indexer.indexDocumentsAsync(Program.currentIndexName, Program.products, batchSize, Program.INDEX_ALIAS);

//     // Wait for indexing to complete
//     console.log('Waiting for indexing to complete...');
//     await new Promise(resolve => setTimeout(resolve, 1000));

//     console.log(`✓ Indexed ${Program.products.length} products to index '${Program.currentIndexName}'`);

//     // Verify document count
//     const count = await Program.indexer.getDocumentCountAsync(Program.currentIndexName);
//     console.log(`Document count in index: ${count}`);
//   }

//   private static async testSearchAsync(): Promise<void> {
//     console.log('\nTesting search functionality...');

//     console.log('Search options:');
//     console.log('1. Basic search by keyword');
//     console.log('2. Search by name');
//     console.log('3. Search by category ID');
//     console.log('4. Search by price range');
//     console.log('5. Get product counts by category');

//     const searchType = await Program.question('\nSelect search type (1-5): ');

//     switch (searchType) {
//       case '1':
//         await Program.performBasicSearchAsync();
//         break;
//       case '2':
//         await Program.performNameSearchAsync();
//         break;
//       case '3':
//         await Program.performCategorySearchAsync();
//         break;
//       case '4':
//         await Program.performPriceRangeSearchAsync();
//         break;
//       case '5':
//         await Program.performCategoryCountAsync();
//         break;
//       default:
//         console.log('Invalid choice. Using basic search.');
//         await Program.performBasicSearchAsync();
//         break;
//     }
//   }

//   private static async performBasicSearchAsync(): Promise<void> {
//     const query = await Program.question('Enter search query: ') || 'test';
//     const field = await Program.question('Enter field to search (default is "name"): ') || 'name';

//     const searchResponse = await Program.tester.testSearchAsync<Product>(Program.INDEX_ALIAS, query, field);
//     console.log(`\nSearch for '${query}' in field '${field}' returned ${searchResponse.total} results`);

//     Program.displaySearchResults(searchResponse);
//   }

//   private static async performNameSearchAsync(): Promise<void> {
//     const nameQuery = await Program.question('Enter product name to search: ') || 'product';

//     const searchResponse = await Program.tester.searchByNameAsync(Program.INDEX_ALIAS, nameQuery);
//     console.log(`\nSearch for products with name containing '${nameQuery}' returned ${searchResponse.total} results`);

//     Program.displaySearchResults(searchResponse);
//   }

//   private static async performCategorySearchAsync(): Promise<void> {
//     const categoryIdInput = await Program.question('Enter category ID to search: ');
//     const categoryId = parseInt(categoryIdInput) || 1;

//     const searchResponse = await Program.tester.searchByCategoryAsync(Program.INDEX_ALIAS, categoryId);
//     console.log(`\nSearch for products in category ${categoryId} returned ${searchResponse.total} results`);

//     Program.displaySearchResults(searchResponse);
//   }

//   private static async performPriceRangeSearchAsync(): Promise<void> {
//     const minPriceInput = await Program.question('Enter minimum price: ');
//     const minPrice = parseFloat(minPriceInput) || 0;

//     const maxPriceInput = await Program.question('Enter maximum price: ');
//     const maxPrice = parseFloat(maxPriceInput) || 1000;

//     const searchResponse = await Program.tester.searchByPriceRangeAsync(Program.INDEX_ALIAS, minPrice, maxPrice);
//     console.log(`\nSearch for products with price between $${minPrice} and $${maxPrice} returned ${searchResponse.total} results`);

//     Program.displaySearchResults(searchResponse);
//   }

//   private static async performCategoryCountAsync(): Promise<void> {
//     const categoryCounts = await Program.tester.getProductCountsByCategoryAsync(Program.INDEX_ALIAS);
//     console.log(`\nFound ${Object.keys(categoryCounts).length} categories with products:`);

//     Object.entries(categoryCounts).forEach(([categoryId, count]) => {
//       console.log(`- Category ID ${categoryId}: ${count} products`);
//     });
//   }

//   private static displaySearchResults(searchResponse: any): void {
//     const maxResults = Math.min(searchResponse.hits.length, 5);
//     if (maxResults > 0) {
//       console.log('\nTop results:');
//       for (let i = 0; i < maxResults; i++) {
//         const hit = searchResponse.hits[i];
//         const product = hit.source as Product;
//         console.log(`${i + 1}. ${product.name} (ID: ${product.recordId}, Price: $${product.price})`);
//       }
//     } else {
//       console.log('No results found.');
//     }
//   }

//   private static async updateAliasAsync(): Promise<void> {
//     if (!Program.currentIndexName) {
//       console.log('\n❌ Please create an index first using option 2.');
//       return;
//     }

//     console.log('\nUpdating alias...');

//     // Show current status
//     const aliasExists = await Program.aliasManager.aliasExistsAsync(Program.INDEX_ALIAS);
//     if (aliasExists) {
//       const currentIndices = await Program.aliasManager.getIndicesForAliasAsync(Program.INDEX_ALIAS);
//       console.log(`Current indices for alias '${Program.INDEX_ALIAS}': ${currentIndices.join(', ')}`);
//     } else {
//       console.log(`Alias '${Program.INDEX_ALIAS}' does not exist yet. It will be created.`);
//     }

//     // Confirm action
//     const confirm = await Program.question(`Are you sure you want to update the alias '${Program.INDEX_ALIAS}' to point to '${Program.currentIndexName}'? (y/n): `);
//     if (confirm.toLowerCase() !== 'y') {
//       console.log('Operation cancelled.');
//       return;
//     }

//     // Ask if old indices should be deleted
//     const deleteResponse = await Program.question('Delete old indices after updating alias? (y/n, default is n): ');
//     let deleteOld = deleteResponse.toLowerCase() === 'y';

//     if (deleteOld && aliasExists) {
//       console.log('⚠️ WARNING: All old indices will be deleted!');
//       const confirmDelete = await Program.question('Type "CONFIRM" to proceed with deletion: ');
//       if (confirmDelete !== 'CONFIRM') {
//         console.log('Deletion cancelled. Continuing without deleting old indices.');
//         deleteOld = false;
//       }
//     }

//     // Swap the alias
//     console.log('Updating alias...');
//     const success = await Program.aliasManager.swapAliasAsync(Program.INDEX_ALIAS, Program.currentIndexName, deleteOld);

//     if (success) {
//       console.log(`✓ Swapped alias '${Program.INDEX_ALIAS}' to point to '${Program.currentIndexName}'`);
//       if (deleteOld && aliasExists) {
//         console.log('Old indices have been deleted.');
//       }
//     } else {
//       console.log(`❌ Failed to update alias '${Program.INDEX_ALIAS}'`);
//     }
//   }

//   private static async loadProductsAsync(): Promise<Product[]> {
//     try {
//       const fileExists = await fs.access(Program.PRODUCTS_FILE_PATH).then(() => true).catch(() => false);
//       if (!fileExists) {
//         throw new Error(`Products file not found at ${Program.PRODUCTS_FILE_PATH}. Please ensure the file exists in the application directory.`);
//       }

//       const json = await fs.readFile(Program.PRODUCTS_FILE_PATH, 'utf-8');
//       const loadedProducts = JSON.parse(json) as Product[];

//       if (!loadedProducts || loadedProducts.length === 0) {
//         console.log('Warning: No products found in the file or the file format is incorrect.');
//         return [];
//       }

//       return loadedProducts;
//     } catch (error) {
//       if (error instanceof SyntaxError) {
//         throw new Error(`Failed to parse products JSON file: ${error.message}`);
//       }
//       throw new Error(`Error reading products from file: ${(error as Error).message}`);
//     }
//   }
// }

// // Run the program
// if (require.main === module) {
//   Program.main().catch(console.error);
// }