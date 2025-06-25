import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { IElasticClientProvider } from '../../core/client/elasticClientProvider';
import { IAliasManager } from '../../core/management/aliasManager';
import { IndexMapperBase } from '../../core/mapping/indexMapperBase';
import MappingHelpers from '../../core/mapping/mappingHelpers';
import { Product } from '../models/product';

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
        DefaultUnitOfMeasure: MappingHelpers.keywordField(),
        Name: MappingHelpers.disabledField(),
        RecordId: MappingHelpers.numberField('long'),
        ItemId: MappingHelpers.keywordField(),
        Locale: MappingHelpers.keywordField(),
        ProductNumber: MappingHelpers.keywordField(),
        OfflineImage: MappingHelpers.disabledField(),

        // rules: this.generateProductRulesMapping(),
        Rules: MappingHelpers.disabledField(),

        // Boolean flags
        HasLinkedProducts: MappingHelpers.booleanField(),
        IsMasterProduct: MappingHelpers.booleanField(),
        IsKit: MappingHelpers.booleanField(),
        IsRemote: MappingHelpers.booleanField(),

        // Objects that aren't indexed
        ChangeTrackingInformation: MappingHelpers.disabledField(),
        ParentKits: MappingHelpers.disabledField(),
        LinkedProducts: MappingHelpers.disabledField(),

        // Searchable fields
        SearchName: MappingHelpers.textWithKeyword(),

        // Price fields
        BasePrice: MappingHelpers.numberField('double'),
        Price: MappingHelpers.numberField('double'),

        // Category information
        CategoryIds: MappingHelpers.keywordField(),
        // Disabling displayOrderInCategories to avoid mapping explosion errors
        // DisplayOrderInCategories: {
        //   type: 'nested',
        //   properties: {
        //     CategoryId: MappingHelpers.numberField('long'),
        //     DisplayOrder: MappingHelpers.numberField('integer')
        //   }
        // },
        DisplayOrderInCategories: MappingHelpers.disabledField(),
        // Disabling images to avoid mapping explosion errors
        // Image information - fix the nested structure
        // Images: {
        //   type: 'object',
        //   properties: {
        //     Items: {
        //       type: 'nested',
        //       properties: {
        //         Url: MappingHelpers.keywordField(),
        //         AltText: MappingHelpers.textField(),
        //         IsSelfHosted: MappingHelpers.booleanField(),
        //         IsDefault: MappingHelpers.booleanField(),
        //         Priority: MappingHelpers.numberField('integer')
        //       }
        //     }
        //   }
        // },
        Images: MappingHelpers.disabledField(),
        // Product schema and properties
        ProductSchema: MappingHelpers.disabledField(),
        ProductProperties: MappingHelpers.disabledField(),
        CompositionInformation: MappingHelpers.disabledField(),
        ProductsRelatedToThis: MappingHelpers.disabledField()
      }
    };
  }

  // Dropped rules from indexing to help with mapping explosion errors
  //  /**
  //  * Generates mapping for product rules
  //  */
  // private generateProductRulesMapping() {
  //   return {
  //     type: 'object' as const,
  //     properties: {
  //       productId: MappingHelpers.numberField('long'),
  //       hasLinkedProducts: MappingHelpers.booleanField(),
  //       isBlocked: MappingHelpers.booleanField(),
  //       dateOfBlocking: MappingHelpers.dateField(),
  //       dateToActivate: MappingHelpers.dateField(),
  //       dateToBlock: MappingHelpers.dateField(),
  //       priceKeyingRequirementValue: MappingHelpers.numberField('integer'),
  //       quantityKeyingRequirementValue: MappingHelpers.numberField('integer'),
  //       mustKeyInComment: MappingHelpers.booleanField(),
  //       canQuantityBecomeNegative: MappingHelpers.booleanField(),
  //       mustScaleItem: MappingHelpers.booleanField(),
  //       canPriceBeZero: MappingHelpers.booleanField(),
  //       isSerialized: MappingHelpers.booleanField(),
  //       isActiveInSalesProcess: MappingHelpers.booleanField(),
  //       defaultUnitOfMeasure: MappingHelpers.keywordField(),
  //       extensionProperties: MappingHelpers.disabledField()
  //     }
  //   };
  // }

  private generateDynamicTemplate(): NonNullable<MappingTypeMapping['dynamic_templates']> {
    return [
      {
        // More specific pattern for nested DefaultProductProperties
        defaultProductProperties_nested: {
          match: 'DefaultProductProperties',
          match_mapping_type: 'object',
          mapping: {
            type: 'object' as const,
            properties: {
              PropertyTypeValue: MappingHelpers.numberField('long'),
              KeyName: MappingHelpers.keywordField(),
              FriendlyName: MappingHelpers.textWithKeyword(),
              RecordId: MappingHelpers.numberField('long'),
              IsDimensionProperty: MappingHelpers.booleanField(),
              AttributeValueId: MappingHelpers.numberField('long'),
              SwatchImageUrl: MappingHelpers.keywordField(),
              SwatchColorHexCode: MappingHelpers.keywordField(),
              ValueString: MappingHelpers.textField(),
              UnitText: MappingHelpers.textField(),
              GroupId: MappingHelpers.numberField('long'),
              GroupTypeValue: MappingHelpers.numberField('integer'),
              GroupName: MappingHelpers.textField(),
              Language: MappingHelpers.keywordField(),
              Translation: MappingHelpers.keywordField(),
              ExtensionProperties: MappingHelpers.disabledField(),
              IsReference: MappingHelpers.booleanField(),
              ProductId: MappingHelpers.numberField('long'),
              CategoryId: MappingHelpers.numberField('long'),
              CatalogId: MappingHelpers.numberField('long'),
              Distance: MappingHelpers.numberField('integer'),
              Source: MappingHelpers.numberField('integer'),
              DateTimeOffsetValue: MappingHelpers.dateField()
            }
          }
        }
      },
      {
        // Catch any sub-fields within DefaultProductProperties
        defaultProductProperties_subfields: {
          path_match: 'DefaultProductProperties.*',
          mapping: {
            type: 'object' as const,
            properties: {
              PropertyTypeValue: MappingHelpers.numberField('long'),
              KeyName: MappingHelpers.keywordField(),
              FriendlyName: MappingHelpers.textWithKeyword(),
              RecordId: MappingHelpers.numberField('long'),
              IsDimensionProperty: MappingHelpers.booleanField(),
              AttributeValueId: MappingHelpers.numberField('long'),
              SwatchImageUrl: MappingHelpers.keywordField(),
              SwatchColorHexCode: MappingHelpers.keywordField(),
              ValueString: MappingHelpers.textField(),
              UnitText: MappingHelpers.textField(),
              GroupId: MappingHelpers.numberField('long'),
              GroupTypeValue: MappingHelpers.numberField('integer'),
              GroupName: MappingHelpers.textField(),
              Language: MappingHelpers.keywordField(),
              Translation: MappingHelpers.keywordField(),
              ExtensionProperties: MappingHelpers.disabledField(),
              IsReference: MappingHelpers.booleanField(),
              ProductId: MappingHelpers.numberField('long'),
              CategoryId: MappingHelpers.numberField('long'),
              CatalogId: MappingHelpers.numberField('long'),
              Distance: MappingHelpers.numberField('integer'),
              Source: MappingHelpers.numberField('integer'),
              DateTimeOffsetValue: MappingHelpers.dateField()
            }
          }
        }
      }
    ];
  }
}