#!/bin/bash
# filepath: /home/mreed/projects/e4dynamics-elasticsearch/run_generator.sh

echo "Starting product generation..."
echo "This will create a file with 500,000 products based on the template."
echo "Estimated file size: ~2-3 GB"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python3 is required but not installed."
    exit 1
fi

# Check if template file exists
if [ ! -f "products.json" ]; then
    echo "Template file 'products.json' not found in current directory."
    exit 1
fi

# Run the batch generator (more memory efficient)
echo "Running batch generator..."
python3 generate_products_batch.py

echo ""
echo "Generation complete!"
echo "Output file: products_500k.json"

# Show file size
if [ -f "products_500k.json" ]; then
    echo "File size: $(du -h products_500k.json | cut -f1)"
    echo "Number of lines: $(wc -l < products_500k.json)"
fi