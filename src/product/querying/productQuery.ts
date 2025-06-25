import {
    AggregationsAggregationContainer,
    QueryDslQueryContainer,
    SearchHighlight,
    SearchRequest,
    Sort
} from '@elastic/elasticsearch/lib/api/types';
import { ElasticClientProvider } from '../../core/client/elasticClientProvider';
import { AliasManager } from '../../core/management/aliasManager';
import { Product } from '../models/product';

/**
 * Product query service for building and executing Elasticsearch queries
 */
export class ProductQueryService {
    private client = ElasticClientProvider.instance.client;
    private aliasManager = new AliasManager(ElasticClientProvider.instance);

    /**
     * Build a full-text search query
     */
    buildTextSearchQuery(
        query: string,
        fields?: string[],
        fuzziness: string = 'AUTO'
    ): QueryDslQueryContainer {
        return {
            multi_match: {
                query: query.trim(),
                fields: fields ?? [],
                type: 'best_fields' as const,
                fuzziness
            }
        };
    }

    /**
     * Build criteria-based search filters
     */
    buildCriteriaFilters(criteria: Record<string, any>): QueryDslQueryContainer[] {
        return Object.entries(criteria).map(([field, value]) => {
            return this.buildFieldFilter(field, value);
        });
    }

    /**
     * Build a filter for a specific field and value
     */
    private buildFieldFilter(field: string, value: any): QueryDslQueryContainer {
        if (value === null || value === undefined) {
            return {
                bool: {
                    must_not: {
                        exists: { field }
                    }
                }
            };
        }

        if (typeof value === 'string' && value.includes('*')) {
            return {
                wildcard: {
                    [field]: value
                }
            };
        }

        if (typeof value === 'object' && value.hasOwnProperty('range')) {
            return {
                range: {
                    [field]: value.range
                }
            };
        }

        if (Array.isArray(value)) {
            return {
                terms: {
                    [field]: value
                }
            };
        }

        return {
            term: {
                [field]: value
            }
        };
    }

    /**
     * Build search highlight configuration
     */
    buildHighlight(enabled: boolean = false): SearchHighlight | undefined {
        if (!enabled) return undefined;

        return {
            fields: {
                '*': {
                    pre_tags: ['<em>'],
                    post_tags: ['</em>']
                }
            }
        };
    }

    /**
     * Build sort configuration
     */
    buildSort(sortOptions?: Array<{ field: string; order: 'asc' | 'desc' }>): Sort | undefined {
        if (!sortOptions || sortOptions.length === 0) return undefined;

        return sortOptions.map(sortItem => ({
            [sortItem.field]: { order: sortItem.order }
        }));
    }

    /**
     * Build aggregations for specified fields
     */
    buildAggregations(aggFields?: string[]): Record<string, AggregationsAggregationContainer> | undefined {
        if (!aggFields || aggFields.length === 0) return undefined;

        const aggregations: Record<string, AggregationsAggregationContainer> = {};

        aggFields.forEach(field => {
            aggregations[field] = this.buildFieldAggregation(field);
        });

        return aggregations;
    }

    /**
     * Build aggregation for a specific field (focused on DefaultProductProperties)
     */
    private buildFieldAggregation(field: string): AggregationsAggregationContainer {
        const subAgg: AggregationsAggregationContainer = {
            top_hits: {
                size: 1,
                _source: {
                    includes: [
                        `DefaultProductProperties.${field}.Translation`,
                        `DefaultProductProperties.${field}.KeyName`,
                        `DefaultProductProperties.${field}.FriendlyName`
                    ]
                }
            }
        };

        const agg: AggregationsAggregationContainer = {
            terms: {
                field: `DefaultProductProperties.${field}.KeyName`,
                size: 50 // Limit number of buckets
            },
            aggs: {
                [`${field}_details`]: subAgg
            }
        };

        return agg;
    }

    /**
     * Build complete text search request
     */
    buildTextSearchRequest(
        query: string,
        options: {
            fields?: string[];
            limit?: number;
            offset?: number;
            highlight?: boolean;
            fuzziness?: string;
        }
    ): SearchRequest {
        const {
            fields,
            limit = 20,
            offset = 0,
            highlight = false,
            fuzziness = 'AUTO'
        } = options;

        const searchRequest: SearchRequest = {
            query: this.buildTextSearchQuery(query, fields, fuzziness),
            size: limit,
            from: offset
        };

        const highlightConfig = this.buildHighlight(highlight);
        if (highlightConfig) {
            searchRequest.highlight = highlightConfig;
        }

        return searchRequest;
    }

    /**
     * Build complete criteria search request
     */
    buildCriteriaSearchRequest(
        criteria: Record<string, any>,
        options: {
            limit?: number;
            offset?: number;
            sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
            aggs?: string[];
        }
    ): SearchRequest {
        const {
            limit = 20,
            offset = 0,
            sort,
            aggs
        } = options;

        const filters = this.buildCriteriaFilters(criteria);

        const searchRequest: SearchRequest = {
            query: {
                bool: {
                    must: filters
                }
            },
            size: limit,
            from: offset
        };

        const sortConfig = this.buildSort(sort);
        if (sortConfig) {
            searchRequest.sort = sortConfig;
        }

        const aggsConfig = this.buildAggregations(aggs);
        if (aggsConfig) {
            searchRequest.aggs = aggsConfig;
        }

        return searchRequest;
    }

    /**
     * Execute text search
     */
    async executeTextSearch(
        alias: string,
        query: string,
        options: {
            fields?: string[];
            limit?: number;
            offset?: number;
            highlight?: boolean;
            fuzziness?: string;
        }
    ): Promise<{
        hits: (Product & { _id: string; _score?: number; _highlight?: any })[];
        total: number;
        took: number;
        maxScore?: number;
    }> {
        // Validate alias exists
        const aliasExists = await this.aliasManager.aliasExistsAsync(alias);
        if (!aliasExists) {
            throw new Error(`Alias '${alias}' does not exist`);
        }

        const searchRequest = this.buildTextSearchRequest(query, options);

        const response = await this.client.search<Product>({
            index: alias,
            body: searchRequest
        });

        return {
            hits: response.hits.hits.map((hit) => ({
                ...hit._source!,
                _id: hit._id!,
                _score: hit._score || undefined,
                _highlight: hit.highlight
            })),
            total: typeof response.hits.total === 'object'
                ? response.hits.total?.value || 0
                : response.hits.total || 0,
            took: response.took || 0,
            maxScore: response.hits.max_score || undefined
        };
    }

    /**
     * Execute criteria search
     */
    async executeCriteriaSearch(
        alias: string,
        criteria: Record<string, any>,
        options: {
            limit?: number;
            offset?: number;
            sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
            aggs?: string[];
        }
    ): Promise<{
        hits: (Product & { _id: string; _score?: number })[];
        total: number;
        took: number;
        maxScore?: number;
        aggregations?: any;
    }> {
        // Validate alias exists
        const aliasExists = await this.aliasManager.aliasExistsAsync(alias);
        if (!aliasExists) {
            throw new Error(`Alias '${alias}' does not exist`);
        }

        const searchRequest = this.buildCriteriaSearchRequest(criteria, options);

        const response = await this.client.search<Product>({
            index: alias,
            body: searchRequest
        });

        return {
            hits: response.hits.hits.map((hit) => ({
                ...hit._source!,
                _id: hit._id!,
                _score: hit._score || undefined
            })),
            total: typeof response.hits.total === 'object'
                ? response.hits.total?.value || 0
                : response.hits.total || 0,
            took: response.took || 0,
            maxScore: response.hits.max_score || undefined,
            aggregations: response.aggregations
        };
    }

    /**
     * Get product by ID (document ID or RecordId)
     */
    async getProductById(
        alias: string,
        productId: string
    ): Promise<(Product & { _id: string }) | null> {
        // Validate alias exists
        const aliasExists = await this.aliasManager.aliasExistsAsync(alias);
        if (!aliasExists) {
            throw new Error(`Alias '${alias}' does not exist`);
        }

        try {
            // Try to get by document ID first
            const response = await this.client.get<Product>({
                index: alias,
                id: productId
            });

            return {
                ...response._source!,
                _id: response._id!
            };
        } catch (getError: any) {
            if (getError.statusCode === 404) {
                // If not found by ID, try searching by RecordId
                const searchResponse = await this.client.search<Product>({
                    index: alias,
                    body: {
                        query: {
                            term: {
                                RecordId: isNaN(Number(productId)) ? productId : Number(productId)
                            }
                        },
                        size: 1
                    }
                });

                if (searchResponse.hits.total === 0 ||
                    (typeof searchResponse.hits.total === 'object' && searchResponse.hits.total.value === 0)) {
                    return null;
                }

                const hit = searchResponse.hits.hits[0];
                return {
                    ...hit._source!,
                    _id: hit._id!
                };
            } else {
                throw getError;
            }
        }
    }

    /**
     * Get schema/mapping for an alias
     */
    async getAliasSchema(alias: string): Promise<{
        alias: string;
        indices: string[];
        mappings: any;
    }> {
        // Validate alias exists
        const aliasExists = await this.aliasManager.aliasExistsAsync(alias);
        if (!aliasExists) {
            throw new Error(`Alias '${alias}' does not exist`);
        }

        // Get indices associated with the alias
        const aliasResponse = await this.client.indices.getAlias({ name: alias });
        const indices = Object.keys(aliasResponse);

        if (indices.length === 0) {
            throw new Error(`No indices found for alias '${alias}'`);
        }

        // Get mapping from the first index (they should all have the same mapping for the same alias)
        const mappingResponse = await this.client.indices.getMapping({ index: indices[0] });
        const indexMapping = mappingResponse[indices[0]];

        return {
            alias,
            indices,
            mappings: indexMapping?.mappings || {}
        };
    }
}

// Export singleton instance
export const productQueryService = new ProductQueryService();


