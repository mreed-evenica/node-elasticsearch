import * as fs from 'fs/promises';
import * as path from 'path';
import { Product } from '../product/models/product';


/**
 * Service for loading and managing product data
 */
export class ProductDataService {
  private static readonly PRODUCTS_FILE_PATH = path.join(process.cwd(), 'products.json');
  private cachedProducts: Product[] | null = null;

  /**
   * Loads products from JSON file
   */
  public async loadProductsAsync(): Promise<Product[]> {
    if (this.cachedProducts) {
      return this.cachedProducts;
    }

    try {
      const fileExists = await fs.access(ProductDataService.PRODUCTS_FILE_PATH)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        throw new Error(`Products file not found at ${ProductDataService.PRODUCTS_FILE_PATH}`);
      }

      const json = await fs.readFile(ProductDataService.PRODUCTS_FILE_PATH, 'utf-8');
      const loadedProducts = JSON.parse(json) as Product[];

      if (!loadedProducts || loadedProducts.length === 0) {
        console.warn('Warning: No products found in the file or the file format is incorrect.');
        return [];
      }

      this.cachedProducts = loadedProducts;
      return loadedProducts;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse products JSON file: ${error.message}`);
      }
      throw new Error(`Error reading products from file: ${(error as Error).message}`);
    }
  }

  /**
   * Clears the cached products
   */
  public clearCache(): void {
    this.cachedProducts = null;
  }
}