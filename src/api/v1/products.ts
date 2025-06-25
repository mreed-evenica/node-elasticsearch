import Router from 'koa-router';
import { ElasticClientProvider } from '../../core/client/elasticClientProvider';
import { AliasManager } from '../../core/management/aliasManager';
import { ExtendedKoaContext } from '../../core/types';
import { Product } from '../../product/models/product';
import { productQueryService } from '../../product/querying/productQuery';

/**
 * @swagger
 * tags:
 *   - name: Products
 *     description: Product search and retrieval operations
 */

const router = new Router();

// Initialize dependencies
const clientProvider = ElasticClientProvider.instance;
const aliasManager = new AliasManager(clientProvider);

/**
 * Search interfaces
 */
interface SearchByTextRequest extends SearchQueryRequest {
    alias?: string;
    limit?: number;
    offset?: number;
}

interface SearchByCriteriaRequest extends SearchQueryRequest {
    criteria: {
        [key: string]: any;
    };
    alias?: string;
    limit?: number;
    offset?: number;
    sort?: Array<{
        field: string;
        order: 'asc' | 'desc';
    }>;
    aggs?: string[];
}

interface SearchQueryRequest {
    query: string;
    fields: string[];
    highlight?: boolean;
}

interface ProductSearchResponse {
    hits: Product[];
    total: number;
    took: number;
    maxScore?: number;
    aggregations?: any;
}

/**
 * @swagger
 * /v1/products/search/text:
 *   post:
 *     summary: Search products by text query
 *     description: Perform full-text search across product fields
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Text search query
 *                 example: "laptop computer"
 *               alias:
 *                 type: string
 *                 description: Index alias to search, defaults to products
 *                 example: "products"
 *               limit:
 *                 type: integer
 *                 description: Maximum number of results, defaults to 20, max 100
 *                 example: 20
 *               offset:
 *                 type: integer
 *                 description: Number of results to skip, defaults to 0
 *                 example: 0
 *               fields:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific fields to search in, defaults to all
 *                 example: ["Name", "ProductNumber", "DefaultProductProperties.ValueString"]
 *               highlight:
 *                 type: boolean
 *                 description: Whether to highlight search terms in results, defaults to true
 *                 example: true
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hits:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 total:
 *                   type: integer
 *                   description: Total number of matching documents
 *                 took:
 *                   type: integer
 *                   description: Time taken for search in milliseconds
 *                 maxScore:
 *                   type: number
 *                   description: Maximum relevance score
 *       400:
 *         description: Invalid search request
 *       500:
 *         description: Search failed
 */
router.post('/search/text', async (ctx: ExtendedKoaContext) => {
    try {
        const {
            query,
            alias = 'products',
            limit = 20,
            offset = 0,
            fields,
            highlight = true
        }: SearchByTextRequest = ctx.request.body as SearchByTextRequest;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            ctx.status = 400;
            ctx.body = { error: 'Query parameter is required and must be a non-empty string' };
            return;
        }

        if (limit > 100) {
            ctx.status = 400;
            ctx.body = { error: 'Limit cannot exceed 100' };
            return;
        }

        const searchResponse = await productQueryService.executeTextSearch(alias, query, {
            fields,
            limit,
            offset,
            highlight
        });

        ctx.body = searchResponse;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Text search failed:', JSON.stringify(error, null, 2));
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/search/criteria:
 *   post:
 *     summary: Search products by specific criteria
 *     description: Perform structured search using specific field criteria
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - criteria
 *             properties:
 *               criteria:
 *                 type: object
 *                 description: Search criteria with field-value pairs
 *                 example:
 *                   RecordId: 12345
 *                   "Rules.IsActiveInSalesProcess": true
 *                   "DefaultProductProperties.KeyName": "Color"
 *               alias:
 *                 type: string
 *                 description: Index alias to search, defaults to products
 *                 example: "products"
 *               limit:
 *                 type: integer
 *                 description: Maximum number of results, defaults to 20, max 100
 *                 example: 20
 *               offset:
 *                 type: integer
 *                 description: Number of results to skip, defaults to 0
 *                 example: 0
 *               sort:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                     order:
 *                       type: string
 *                       enum: [asc, desc]
 *                 description: Sort criteria
 *                 example:
 *                   - field: "RecordId"
 *                     order: "desc"
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hits:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 total:
 *                   type: integer
 *                 took:
 *                   type: integer
 *                 maxScore:
 *                   type: number
 *       400:
 *         description: Invalid search criteria
 *       500:
 *         description: Search failed
 */
router.post('/search/criteria', async (ctx: ExtendedKoaContext) => {
    try {
        const {
            criteria,
            alias = 'products',
            limit = 20,
            offset = 0,
            sort,
            aggs
        }: SearchByCriteriaRequest = ctx.request.body as SearchByCriteriaRequest;

        if (!criteria || typeof criteria !== 'object' || Object.keys(criteria).length === 0) {
            ctx.status = 400;
            ctx.body = { error: 'Criteria parameter is required and must be a non-empty object' };
            return;
        }

        if (limit > 100) {
            ctx.status = 400;
            ctx.body = { error: 'Limit cannot exceed 100' };
            return;
        }

        const searchResponse = await productQueryService.executeCriteriaSearch(alias, criteria, {
            limit,
            offset,
            sort,
            aggs
        });

        ctx.body = searchResponse;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Criteria search failed:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     description: Retrieve a specific product by its ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID or RecordId
 *         example: "12345"
 *       - in: query
 *         name: alias
 *         schema:
 *           type: string
 *           default: products
 *         description: Index alias to search
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       500:
 *         description: Retrieval failed
 */
router.get('/:productId', async (ctx: ExtendedKoaContext) => {
    try {
        const { productId } = ctx.params as { productId: string };
        const { alias = 'products' } = ctx.query as { alias?: string };

        if (!productId) {
            ctx.status = 400;
            ctx.body = { error: 'Product ID parameter is required' };
            return;
        }

        const product = await productQueryService.getProductById(alias, productId);

        if (!product) {
            ctx.status = 404;
            ctx.body = { error: `Product with ID '${productId}' not found` };
            return;
        }

        ctx.body = product;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Product retrieval failed:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /api/v1/products/{alias}/promote:
 *   post:
 *     summary: Promote staging index to active
 *     description: Switch traffic from active to staging index for a product alias
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The product alias to promote
 *         example: products
 *       - in: query
 *         name: targetIndex
 *         required: true
 *         schema:
 *           type: string
 *         description: The index to promote to active
 *         example: products_green_20231201120000
 *     responses:
 *       200:
 *         description: Promotion completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 alias:
 *                   type: string
 *                 newActiveIndex:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Promotion failed
 */
router.post('/:alias/promote', async (ctx: ExtendedKoaContext) => {
    try {
        const { alias } = ctx.params as { alias: string };
        if (!alias) {
            ctx.status = 400;
            ctx.body = { error: 'Alias parameter is required' };
            return;
        }

        const { targetIndex } = ctx.query as { targetIndex?: string };

        if (!targetIndex) {
            ctx.status = 400;
            ctx.body = { error: 'targetIndex query parameter is required' };
            return;
        }

        // Verify the target index exists
        const client = clientProvider.client;
        const indexExists = await client.indices.exists({ index: targetIndex });

        if (!indexExists) {
            ctx.status = 400;
            ctx.body = { error: `Target index '${targetIndex}' does not exist` };
            return;
        }

        // Swap the alias
        await aliasManager.swapAliasAsync(alias, targetIndex, false);

        ctx.body = {
            success: true,
            alias,
            newActiveIndex: targetIndex,
            message: `Successfully promoted ${targetIndex} to active for alias ${alias}`
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Product promotion failed:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

/**
 * @swagger
 * /v1/products/{alias}/schema:
 *   get:
 *     summary: Get Elasticsearch mapping schema for alias
 *     description: Retrieve the Elasticsearch mapping (schema) for a given alias
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: The alias to get the schema for
 *         example: products
 *     responses:
 *       200:
 *         description: Schema retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alias:
 *                   type: string
 *                   description: The alias name
 *                 indices:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Indices associated with the alias
 *                 mappings:
 *                   type: object
 *                   description: The Elasticsearch mapping for the alias
 *       404:
 *         description: Alias not found
 *       500:
 *         description: Schema retrieval failed
 */
router.get('/:alias/schema', async (ctx: ExtendedKoaContext) => {
    try {
        const { alias } = ctx.params as { alias: string };

        if (!alias) {
            ctx.status = 400;
            ctx.body = { error: 'Alias parameter is required' };
            return;
        }

        const schema = await productQueryService.getAliasSchema(alias);
        ctx.body = schema;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Schema retrieval failed:', error);
        ctx.status = 500;
        ctx.body = { error: errorMessage };
    }
});

export default router;
