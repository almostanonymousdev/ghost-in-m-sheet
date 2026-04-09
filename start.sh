#!/bin/bash

# Start script for Ghost in M'Sheet
# This script builds the story and opens it in the default browser

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

OUTPUT_FILE="ghost-in-msheet.html"

# Build the story first
echo -e "${YELLOW}Building story...${NC}"
if ! ./build.sh; then
    echo -e "${RED}Error: Build failed.${NC}"
    exit 1
fi

# Open the file in the default browser
echo -e "${GREEN}Opening $OUTPUT_FILE in browser...${NC}"
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$SCRIPT_DIR/$OUTPUT_FILE"
elif command -v open >/dev/null 2>&1; then
    open "$SCRIPT_DIR/$OUTPUT_FILE"
else
    echo -e "${YELLOW}Could not detect a browser opener. Open this file manually:${NC}"
    echo -e "${YELLOW}  $SCRIPT_DIR/$OUTPUT_FILE${NC}"
fi
