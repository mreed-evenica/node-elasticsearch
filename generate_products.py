import json
import random
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any

def load_template_products(filepath: str) -> List[Dict[str, Any]]:
    """Load the template products from the JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_unique_record_id(existing_ids: set, start_id: int = 68719500000) -> int:
    """Generate a unique RecordId that doesn't exist in the set."""
    while start_id in existing_ids:
        start_id += 1
    existing_ids.add(start_id)
    return start_id

def generate_product_variations() -> Dict[str, List[str]]:
    """Generate lists of variations for different product attributes."""
    return {
        'colors': ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'White', 'Gray', 'Pink', 'Purple', 'Orange', 'Brown', 'Navy', 'Maroon', 'Teal', 'Beige'],
        'materials': ['Cotton', 'Leather', 'Wool', 'Silk', 'Denim', 'Polyester', 'Linen', 'Cashmere', 'Suede', 'Canvas', 'Nylon', 'Spandex'],
        'sizes': ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '7', '8', '9', '10', '11', '12'],
        'styles': ['Classic', 'Modern', 'Vintage', 'Contemporary', 'Traditional', 'Minimalist', 'Elegant', 'Casual', 'Formal', 'Sporty'],
        'brands': ['Premium', 'Elite', 'Signature', 'Classic', 'Modern', 'Vintage', 'Designer', 'Luxury', 'Contemporary', 'Traditional'],
        'product_types': {
            'bags': ['Handbag', 'Shoulder Bag', 'Crossbody Bag', 'Tote Bag', 'Clutch', 'Backpack', 'Satchel', 'Wallet'],
            'clothing': ['Shirt', 'Sweater', 'Jacket', 'Coat', 'Dress', 'Pants', 'Skirt', 'Blouse', 'Cardigan'],
            'shoes': ['Sneakers', 'Boots', 'Sandals', 'Loafers', 'Heels', 'Flats', 'Athletic Shoes', 'Dress Shoes'],
            'jewelry': ['Necklace', 'Bracelet', 'Ring', 'Earrings', 'Pendant', 'Watch', 'Cufflinks'],
            'accessories': ['Scarf', 'Gloves', 'Hat', 'Belt', 'Sunglasses', 'Tie', 'Bow Tie']
        }
    }

def create_product_from_template(template: Dict[str, Any], record_id: int, item_id: str, variations: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new product based on a template with variations."""
    product = json.loads(json.dumps(template))  # Deep copy
    
    # Update core identifiers
    product['RecordId'] = record_id
    product['ItemId'] = item_id
    product['ProductNumber'] = item_id
    
    # Generate variations based on product type
    color = random.choice(variations['colors'])
    material = random.choice(variations['materials'])
    style = random.choice(variations['styles'])
    brand = random.choice(variations['brands'])
    
    # Update product name and description with variations
    if 'ProductName' in product:
        base_name = product['ProductName']
        # Add variations to make it unique
        product['ProductName'] = f"{color} {material} {base_name}"
        product['SearchName'] = f"{color} {material} {base_name}"[:20]
    
    if 'Description' in product:
        product['Description'] = f"Premium {color.lower()} {material.lower()} {product['Description'].lower()}"
    
    # Update Rules section
    if 'Rules' in product:
        product['Rules']['ProductId'] = record_id
        
    # Generate random prices
    base_price = random.uniform(10.0, 500.0)
    product['BasePrice'] = round(base_price, 2)
    product['Price'] = round(base_price * random.uniform(0.9, 1.3), 2)
    product['AdjustedPrice'] = round(product['Price'] * random.uniform(0.95, 1.05), 2)
    
    # Update timestamps
    random_date = datetime.now() - timedelta(days=random.randint(1, 365))
    date_str = random_date.strftime('%Y-%m-%dT%H:%M:%S+00:00')
    
    if 'ChangeTrackingInformation' in product:
        product['ChangeTrackingInformation']['ModifiedDateTime'] = date_str
    
    # Update default properties with random dates
    if 'DefaultProductProperties' in product:
        for prop_name, prop_value in product['DefaultProductProperties'].items():
            if isinstance(prop_value, dict) and 'DateTimeOffsetValue' in prop_value:
                if prop_value['DateTimeOffsetValue'] and prop_value['DateTimeOffsetValue'] != "1900-01-01T00:00:00+00:00":
                    product['DefaultProductProperties'][prop_name]['DateTimeOffsetValue'] = date_str
    
    return product

def generate_products(template_file: str, output_file: str, target_count: int = 500000):
    """Generate the specified number of products and save to file."""
    print(f"Loading template products from {template_file}...")
    templates = load_template_products(template_file)
    
    print(f"Loaded {len(templates)} template products")
    print(f"Generating {target_count} products...")
    
    variations = generate_product_variations()
    existing_ids = set()
    products = []
    
    # Extract existing RecordIds from templates
    for template in templates:
        if 'RecordId' in template:
            existing_ids.add(template['RecordId'])
    
    start_id = 68719500000  # Start from a high number to avoid conflicts
    
    for i in range(target_count):
        if i % 10000 == 0:
            print(f"Generated {i} products...")
        
        # Select a random template
        template = random.choice(templates)
        
        # Generate unique identifiers
        record_id = generate_unique_record_id(existing_ids, start_id + i)
        item_id = f"{90000 + (i % 10000):05d}"  # Generate item IDs like 90000-99999, cycling
        
        # Create product with variations
        product = create_product_from_template(template, record_id, item_id, variations)
        products.append(product)
    
    print(f"Writing {len(products)} products to {output_file}...")
    
    # Write products to file in chunks to handle memory efficiently
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('[\n')
        for i, product in enumerate(products):
            json.dump(product, f, indent=2)
            if i < len(products) - 1:
                f.write(',\n')
            else:
                f.write('\n')
        f.write(']\n')
    
    print(f"Successfully generated {len(products)} products in {output_file}")
    
    # Print some statistics
    unique_record_ids = set(p['RecordId'] for p in products)
    print(f"Unique RecordIds: {len(unique_record_ids)}")
    print(f"Sample RecordIds: {sorted(list(unique_record_ids))[:5]}...{sorted(list(unique_record_ids))[-5:]}")

if __name__ == "__main__":
    template_file = "products.json"
    output_file = "products_500k.json"
    
    generate_products(template_file, output_file, 500000)
