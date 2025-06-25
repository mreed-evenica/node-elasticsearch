#!/usr/bin/env node

import fs from 'fs';

/**
 * Generate test product data for batch processing
 */
function generateTestProducts(count: number): Record<string, any>[] {
    const products: Record<string, any>[] = [];

    for (let i = 1; i <= count; i++) {
        products.push({
            id: `prod_${i.toString().padStart(6, '0')}`,
            RecordId: i,
            name: `Test Product ${i}`,
            price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
            description: `This is a test product #${i} for batch processing validation`,
            category: ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports'][i % 5],
            inStock: Math.random() > 0.1, // 90% in stock
            weight: Math.round((Math.random() * 10 + 0.1) * 100) / 100,
            dimensions: {
                length: Math.round((Math.random() * 100 + 1) * 10) / 10,
                width: Math.round((Math.random() * 100 + 1) * 10) / 10,
                height: Math.round((Math.random() * 100 + 1) * 10) / 10
            },
            tags: [`tag_${i % 10}`, `category_${i % 5}`, `type_${i % 3}`],
            rules: {
                isActiveInSalesProcess: Math.random() > 0.05, // 95% active
                canPriceBeZero: Math.random() > 0.8, // 20% can be zero
                mustScaleItem: Math.random() > 0.7, // 30% must scale
                isSerialized: Math.random() > 0.9 // 10% serialized
            },
            metadata: {
                createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date().toISOString(),
                version: Math.floor(Math.random() * 5) + 1
            }
        });
    }

    return products;
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🏭 Test Data Generator

Usage: node generate-test-data.js [count] [filename]

Arguments:
  count     Number of products to generate (default: 1000)
  filename  Output filename (default: test-products.json)

Examples:
  node generate-test-data.js 1000 test-products.json
  node generate-test-data.js 500000 products_500k.json
  npm run generate-test-data 10000 large-test.json
    `);
        process.exit(0);
    }

    const count = parseInt(args[0]) || 1000;
    const filename = args[1] || 'test-products.json';

    console.log(`🏭 Generating ${count} test products...`);

    const startTime = Date.now();
    const products = generateTestProducts(count);
    const generationTime = Date.now() - startTime;

    console.log(`📝 Writing to ${filename}...`);

    const writeStartTime = Date.now();
    fs.writeFileSync(filename, JSON.stringify(products, null, 2));
    const writeTime = Date.now() - writeStartTime;

    const stats = fs.statSync(filename);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✅ Generated ${count} products in ${generationTime}ms`);
    console.log(`💾 Written to ${filename} (${fileSizeMB} MB) in ${writeTime}ms`);
    console.log(`📊 Average: ${(generationTime / count).toFixed(2)}ms per product`);

    console.log(`\n🚀 To process this file, run:`);
    console.log(`npm run batch-processor -- --file ${filename} --estimated ${count}`);
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
}
