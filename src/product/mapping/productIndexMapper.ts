import { IndexMapperBase } from '../../core/mapping/indexMapperBase';
import { IElasticClientProvider } from '../../core/client/elasticClientProvider';
import { IAliasManager } from '../../core/management/aliasManager';
import { Product } from '../models/product';
import MappingHelpers from '../../core/mapping/mappingHelpers';
import { MappingDynamicMapping, MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

/**
 * Product-specific index mapper
 */
export class ProductIndexMapper extends IndexMapperBase<Product> {
  constructor(clientProvider: IElasticClientProvider, aliasManager: IAliasManager) {
    super(clientProvider, aliasManager);
  }

  /**
   * Configures mappings for Product documents
   */
  protected configureMappings(): MappingTypeMapping {
    return {
      dynamic_templates: this.generateDynamicTemplate(),
      properties: {
        // Basic product information
        defaultUnitOfMeasure: MappingHelpers.keywordField(),
        name: MappingHelpers.textWithKeyword(),
        recordId: MappingHelpers.numberField('long'),
        itemId: MappingHelpers.keywordField(),
        locale: MappingHelpers.keywordField(),
        productNumber: MappingHelpers.keywordField(),
        offlineImage: MappingHelpers.disabledField(),

        rules: this.generateProductRulesMapping(),


        // Boolean flags
        hasLinkedProducts: MappingHelpers.booleanField(),
        isMasterProduct: MappingHelpers.booleanField(),
        isKit: MappingHelpers.booleanField(),
        isRemote: MappingHelpers.booleanField(),

        // Objects that aren't indexed
        changeTrackingInformation: { enabled: false },
        parentKits: { enabled: false },
        linkedProducts: { enabled: false },

        // Searchable fields
        searchName: MappingHelpers.textWithKeyword(),

        // Price fields
        basePrice: MappingHelpers.numberField('double'),
        price: MappingHelpers.numberField('double'),

          // Category information
        categoryIds: MappingHelpers.numberField('long'),
        displayOrderInCategories: {
          type: 'nested',
          properties: {
            categoryId: MappingHelpers.numberField('long'),
            displayOrder: MappingHelpers.numberField('integer')
          }
        },

         // Image information - fix the nested structure
        images: {
          type: 'object',
          properties: {
            items: {
              type: 'nested',
              properties: {
                url: MappingHelpers.keywordField(),
                altText: MappingHelpers.textField(),
                isSelfHosted: MappingHelpers.booleanField(),
                isDefault: MappingHelpers.booleanField(),
                priority: MappingHelpers.numberField('integer')
              }
            }
          }
        },

        // Product schema and properties
        productSchema: MappingHelpers.keywordField(),
        productProperties: {
          type: 'nested',
          properties: {
            propertyName: MappingHelpers.keywordField(),
            languageId: MappingHelpers.keywordField(),
            displayName: MappingHelpers.textField(),
            value: MappingHelpers.textField()
          }
        },
        defaultProductProperties: MappingHelpers.disabledField(),
        compositionInformation: MappingHelpers.disabledField(),
        productsRelatedToThis: MappingHelpers.disabledField()
      }
    };
  }

   /**
   * Generates mapping for product rules
   */
  private generateProductRulesMapping() {
    return {
      type: 'object' as const,
      properties: {
        productId: MappingHelpers.numberField('long'),
        hasLinkedProducts: MappingHelpers.booleanField(),
        isBlocked: MappingHelpers.booleanField(),
        dateOfBlocking: MappingHelpers.dateField(),
        dateToActivate: MappingHelpers.dateField(),
        dateToBlock: MappingHelpers.dateField(),
        priceKeyingRequirementValue: MappingHelpers.numberField('integer'),
        quantityKeyingRequirementValue: MappingHelpers.numberField('integer'),
        mustKeyInComment: MappingHelpers.booleanField(),
        canQuantityBecomeNegative: MappingHelpers.booleanField(),
        mustScaleItem: MappingHelpers.booleanField(),
        canPriceBeZero: MappingHelpers.booleanField(),
        isSerialized: MappingHelpers.booleanField(),
        isActiveInSalesProcess: MappingHelpers.booleanField(),
        defaultUnitOfMeasure: MappingHelpers.keywordField(),
        extensionProperties: MappingHelpers.disabledField()
      }
    };
  }

  private generateDynamicTemplate(): NonNullable<MappingTypeMapping['dynamic_templates']> { 
    return [
      {
      defaultProductProperties_template: {
        match: 'defaultProductProperties.*',
        mapping: { 
        type: 'object',
        properties: { 
          propertyTypeValue: MappingHelpers.numberField('long'),
          keyName: MappingHelpers.keywordField(),
          friendlyName: MappingHelpers.textWithKeyword(),
          recordId: MappingHelpers.numberField('long'),
          isDimensionProperty: MappingHelpers.booleanField(),
          attributeValueId: MappingHelpers.numberField('long'),
          swatchImageUrl: MappingHelpers.keywordField(),
          swatchColorHexCode: MappingHelpers.keywordField(),
          valueString: MappingHelpers.textField(),
          unitText: MappingHelpers.textField(),
          groupId: MappingHelpers.numberField('long'),
          groupTypeValue: MappingHelpers.numberField('integer'),
          groupName: MappingHelpers.textField(),
          language: MappingHelpers.keywordField(),
          translation: MappingHelpers.keywordField(),
          extensionProperties: MappingHelpers.disabledField(),
          isReference: MappingHelpers.booleanField(),
          productId: MappingHelpers.numberField('long'),
          categoryId: MappingHelpers.numberField('long'),
          catalogId: MappingHelpers.numberField('long'),
          distance: MappingHelpers.numberField('integer'),
          source: MappingHelpers.numberField('integer'),
          dateTimeOffsetValue: MappingHelpers.dateField()
        }
        }
      }
      }
    ];
  }
}