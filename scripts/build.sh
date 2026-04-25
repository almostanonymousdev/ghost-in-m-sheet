#!/bin/bash

# Build script for Ghost in M'Sheet
# This script builds the Twee/Twine story into an HTML file

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Configuration
OUTPUT_FILE="dist/ghost-in-msheet.html"
PASSAGES_DIR="passages"
TWEEGO_PATH="tweego-2.1.1-linux-x64/tweego"
mkdir -p dist

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting build process...${NC}"

# Check if Tweego exists
if [ ! -f "$TWEEGO_PATH" ]; then
    echo -e "${YELLOW}Tweego not found at $TWEEGO_PATH${NC}"
    echo -e "${YELLOW}Attempting to use system-installed tweego...${NC}"
    TWEEGO_PATH="tweego"
fi

# Verify Tweego is available
if ! command -v "$TWEEGO_PATH" >/dev/null 2>&1; then
    echo -e "${RED}Error: Tweego not found. Please install Tweego or place it in the expected location.${NC}"
    echo -e "${YELLOW}Download from: https://github.com/tmedwards/tweego${NC}"
    exit 1
fi

# Check if passages directory exists
if [ ! -d "$PASSAGES_DIR" ]; then
    echo -e "${RED}Error: Passages directory '$PASSAGES_DIR' not found${NC}"
    exit 1
fi

# Check if there are any .tw files in the passages directory
if [ -z "$(ls -A "$PASSAGES_DIR"/*.tw 2>/dev/null)" ]; then
    echo -e "${RED}Error: No .tw files found in '$PASSAGES_DIR' directory${NC}"
    exit 1
fi

# Run all passage checks before building
echo -e "${GREEN}Checking passage links and duplicates...${NC}"
if ! python3 "$REPO_ROOT/tools/check_links.py"; then
    echo -e "${RED}Error: Passage link/duplicate check failed.${NC}"
    exit 1
fi
echo -e "${GREEN}Link check passed.${NC}"

echo -e "${GREEN}Checking asset references...${NC}"
if ! python3 "$REPO_ROOT/tools/check_assets.py"; then
    echo -e "${RED}Error: Missing asset files detected.${NC}"
    exit 1
fi
echo -e "${GREEN}Asset check passed.${NC}"

echo -e "${GREEN}Checking ghost data integrity...${NC}"
if ! python3 "$REPO_ROOT/tools/check_ghosts.py"; then
    echo -e "${RED}Error: Ghost data integrity check failed.${NC}"
    exit 1
fi
echo -e "${GREEN}Ghost check passed.${NC}"

# Build the story
echo -e "${GREEN}Building story from $PASSAGES_DIR to $OUTPUT_FILE...${NC}"

if "$TWEEGO_PATH" -o "$OUTPUT_FILE" "$PASSAGES_DIR"; then
    echo -e "${GREEN}Build successful!${NC}"
    
    # Check if output file was created
    if [ -f "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE" 2>/dev/null)
        echo -e "${GREEN}Output file created: $OUTPUT_FILE (${FILE_SIZE} bytes)${NC}"
    else
        echo -e "${RED}Error: Build completed but output file was not created${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}Build process completed successfully!${NC}"