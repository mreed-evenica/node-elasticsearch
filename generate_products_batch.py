import json
import random
from typing import Dict, List, Any
import os

def generate_products_in_batches(template_file: str, output_file: str, total_count: int = 500000, batch_size: int = 10000):
    """Generate products in batches to manage memory efficiently."""
    
    # Load templates once
    with open(template_file, 'r', encoding='utf-8') as f:
        templates = json.load(f)
    
    print(f"Loaded {len(templates)} template products")
    print(f"Generating {total_count} products in batches of {batch_size}...")
    
    variations = {
        'colors': ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Gray', 'Pink', 'Purple', 'Orange'],
        'materials': ['Cotton', 'Leather', 'Wool', 'Silk', 'Denim', 'Polyester', 'Linen', 'Cashmere'],
        'styles': ['Classic', 'Modern', 'Vintage', 'Contemporary', 'Traditional', 'Minimalist']
    }
    
    existing_ids = set()
    start_id = 68719500000
    
    # Create output file and write opening bracket
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('[\n')
        
        batches_written = 0
        for batch_start in range(0, total_count, batch_size):
            batch_end = min(batch_start + batch_size, total_count)
            current_batch_size = batch_end - batch_start
            
            print(f"Processing batch {batches_written + 1}: items {batch_start + 1} to {batch_end}")
            
            batch_products = []
            for i in range(current_batch_size):
                global_index = batch_start + i
                
                # Generate unique RecordId
                record_id = start_id + global_index
                while record_id in existing_ids:
                    record_id += 1
                existing_ids.add(record_id)
                
                # Select random template and create variations
                template = random.choice(templates)
                product = json.loads(json.dumps(template))  # Deep copy
                
                # Update identifiers
                product['RecordId'] = record_id
                item_id = f"{90000 + (global_index % 10000):05d}"
                product['ItemId'] = item_id
                product['ProductNumber'] = item_id
                
                # Add variations
                color = random.choice(variations['colors'])
                material = random.choice(variations['materials'])
                
                if 'ProductName' in product:
                    product['ProductName'] = f"{color} {material} {product['ProductName']}"
                    product['SearchName'] = f"{color} {material}"[:20]
                
                # Update Rules ProductId
                if 'Rules' in product and 'ProductId' in product['Rules']:
                    product['Rules']['ProductId'] = record_id
                
                # Generate random prices
                base_price = random.uniform(10.0, 500.0)
                product['BasePrice'] = round(base_price, 2)
                product['Price'] = round(base_price * random.uniform(0.9, 1.3), 2)
                product['AdjustedPrice'] = round(product['Price'] * random.uniform(0.95, 1.05), 2)
                
                batch_products.append(product)
            
            # Write batch to file
            for i, product in enumerate(batch_products):
                json.dump(product, f, indent=2, separators=(',', ': '))
                
                # Add comma unless it's the last product overall
                if batch_start + i < total_count - 1:
                    f.write(',\n')
                else:
                    f.write('\n')
            
            batches_written += 1
            print(f"Completed batch {batches_written}")
        
        f.write(']\n')
    
    print(f"Successfully generated {total_count} products in {output_file}")

if __name__ == "__main__":
    template_file = "products.json"
    output_file = "products_500k.json"
    
    generate_products_in_batches(template_file, output_file, 500000, 10000)
