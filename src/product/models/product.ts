/**
 * Product rules configuration
 */
export interface Rules {
  ProductId: number;
  HasLinkedProducts: boolean;
  IsBlocked: boolean;
  DateOfBlocking: Date;
  DateToActivate: Date;
  DateToBlock: Date;
  PriceKeyingRequirementValue: number;
  QuantityKeyingRequirementValue: number;
  MustKeyInComment: boolean;
  CanQuantityBecomeNegative: boolean;
  MustScaleItem: boolean;
  CanPriceBeZero: boolean;
  IsSerialized: boolean;
  IsActiveInSalesProcess: boolean;
  DefaultUnitOfMeasure: string;
  ExtensionProperties: ExtensionProperty[];
}

/**
 * Change tracking information
 */
export interface ChangeTrackingInformation {
  ModifiedDateTime: Date;
  ChangeActionValue: number;
  RequestedActionValue: number;
}

/**
 * Image item
 */
export interface ImageItem {
  Url: string;
  AltText: string;
  IsSelfHosted: boolean;
  IsDefault: boolean;
  Priority: number;
}

/**
 * Image collection
 */
export interface ImageList {
  Items: ImageItem[];
}

/**
 * Retail context
 */
export interface RetailContext {
  ChannelId: number;
  CatalogId?: number;
}

/**
 * Display order in category
 */
export interface DisplayOrderInCategory {
  CategoryId: number;
  DisplayOrder: number;
}

/**
 * Product property
 */
export interface ProductProperty {
  Name: string;
  Value: any;
  DataType: string;
}

/**
 * Product property translation
 */
export interface ProductPropertyTranslation {
  PropertyName: string;
  LanguageId: string;
  DisplayName: string;
  Value: any;
}

/**
 * Extension property interface
 */
export interface ExtensionProperty {
  name: string;
  value: unknown;
  type?: string;
}

/**
 * Related product interface
 */
export interface RelatedProduct {
  id: string;
  relationshipType: string;
  quantity?: number;
}

/**
 * Product kit interface
 */
export interface ProductKit {
  id: string;
  name: string;
  components?: RelatedProduct[];
}

/**
 * Main Product model
 */
export interface Product {
  id?: string; // Optional ID field for Elasticsearch document ID
  RecordId: number;
  ItemId: string;
  Name: string;
  SearchName: string;
  ProductNumber: string;
  Locale: string;
  OfflineImage: string;
  BasePrice: number;
  Price: number;
  DefaultUnitOfMeasure: string;

  // Category information
  CategoryIds: number[];
  DisplayOrderInCategories: DisplayOrderInCategory[];

  // Image information
  Images: ImageList;

  // Retail context
  RetailContext: RetailContext;

  // Product rules
  Rules: Rules;

  // Boolean flags
  HasLinkedProducts: boolean;
  IsMasterProduct: boolean;
  IsKit: boolean;
  IsRemote: boolean;

  // Additional product information
  ProductsRelatedToThis: RelatedProduct[];
  ProductSchema: string[];
  ProductProperties: ProductPropertyTranslation[];
  CompositionInformation: Record<string, unknown>;
  DefaultProductProperties: Record<string, ProductProperty>;
  ParentKits: ProductKit[];
  LinkedProducts: RelatedProduct[];

  // Change tracking
  ChangeTrackingInformation: ChangeTrackingInformation;
}