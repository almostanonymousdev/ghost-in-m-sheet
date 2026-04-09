#!/bin/bash

# Setup script for Ghost in M'Sheet
# This script downloads and sets up Tweego and SugarCube if needed

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
TWEEGO_VERSION="2.1.1"
TWEEGO_DIR="tweego-${TWEEGO_VERSION}-linux-x64"
TWEEGO_URL="https://github.com/tmedwards/tweego/releases/download/v${TWEEGO_VERSION}/tweego-${TWEEGO_VERSION}-linux-x64.zip"
TWEEGO_PATH="${SCRIPT_DIR}/${TWEEGO_DIR}/tweego"

SUGARCUBE_VERSION="2.37.3"
SUGARCUBE_URL="https://github.com/tmedwards/sugarcube-2/releases/download/v${SUGARCUBE_VERSION}/sugarcube-${SUGARCUBE_VERSION}-for-twine-2.1-local.zip"
SUGARCUBE_PATH="${SCRIPT_DIR}/${TWEEGO_DIR}/storyformats"
SUGARCUBE_INSTALLED_PATH="${SUGARCUBE_PATH}/sugarcube-2"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Ghost in M'Sheet...${NC}"

# Check if Tweego already exists
if [ -f "$TWEEGO_PATH" ]; then
    echo -e "${GREEN}Tweego already installed at $TWEEGO_PATH${NC}"
    echo -e "${YELLOW}Skipping download...${NC}"
else
    echo -e "${YELLOW}Tweego not found. Downloading...${NC}"
    
    # Download Tweego
    if command -v curl >/dev/null 2>&1; then
        curl -L "$TWEEGO_URL" -o "tweego.zip"
    elif command -v wget >/dev/null 2>&1; then
        wget "$TWEEGO_URL" -O "tweego.zip"
    else
        echo -e "${RED}Error: Neither curl nor wget found. Please install one of them.${NC}"
        exit 1
    fi
    
    # Extract Tweego
    echo -e "${YELLOW}Extracting Tweego...${NC}"
    unzip -o tweego.zip -d "${SCRIPT_DIR}/${TWEEGO_DIR}"
    chmod +x "$TWEEGO_PATH"
    # Clean up
    rm tweego.zip
    
    echo -e "${GREEN}Tweego installed successfully!${NC}"
fi

if [ -d "$SUGARCUBE_INSTALLED_PATH" ]; then
    echo -e "${GREEN}SugarCube already installed at $SUGARCUBE_INSTALLED_PATH${NC}"
    echo -e "${YELLOW}Skipping download...${NC}"
else
    echo -e "${YELLOW}SugarCube not found. Downloading...${NC}"

    # Download SugarCube
    if command -v curl >/dev/null 2>&1; then
        curl -L "$SUGARCUBE_URL" -o "sugarcube.zip"
    elif command -v wget >/dev/null 2>&1; then
        wget "$SUGARCUBE_URL" -O "sugarcube.zip"
    else
        echo -e "${RED}Error: Neither curl nor wget found. Please install one of them.${NC}"
        exit 1
    fi

    # Extract SugarCube
    echo -e "${YELLOW}Extracting SugarCube...${NC}"
    unzip -o sugarcube.zip -d "${SUGARCUBE_PATH}"
    rm sugarcube.zip

    echo -e "${GREEN}SugarCube ${SUGARCUBE_VERSION} installed successfully!${NC}"
fi


# Make scripts executable
chmod +x build.sh start.sh .githooks/pre-commit

# Configure git to use the repo's hooks
git config core.hooksPath .githooks
echo -e "${GREEN}Git hooks configured.${NC}"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}You can now run ./build.sh to build the story.${NC}"