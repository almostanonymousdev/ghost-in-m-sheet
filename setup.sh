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

# Check for Git
echo -e "${GREEN}Checking for Git...${NC}"
if command -v git >/dev/null 2>&1; then
    echo -e "${GREEN}Git found.${NC}"
else
    echo -e "${YELLOW}Git not found. Attempting to install...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y git
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm git
    elif command -v brew >/dev/null 2>&1; then
        brew install git
    else
        echo -e "${RED}Error: Git is required but not installed, and no supported package manager was found.${NC}"
        echo -e "${RED}Please install Git manually.${NC}"
        exit 1
    fi
    if ! command -v git >/dev/null 2>&1; then
        echo -e "${RED}Error: Git installation failed. Please install it manually.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Git installed successfully.${NC}"
fi

# Check for Python 3
echo -e "${GREEN}Checking for Python 3...${NC}"
if command -v python3 >/dev/null 2>&1; then
    echo -e "${GREEN}Python 3 found.${NC}"
else
    echo -e "${YELLOW}Python 3 not found. Attempting to install...${NC}"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y python3
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y python3
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm python
    elif command -v brew >/dev/null 2>&1; then
        brew install python3
    else
        echo -e "${RED}Error: Python 3 is required but not installed, and no supported package manager was found.${NC}"
        echo -e "${RED}Please install Python 3 manually.${NC}"
        exit 1
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        echo -e "${RED}Error: Python 3 installation failed. Please install it manually.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Python 3 installed successfully.${NC}"
fi

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

SUGARCUBE_FORMAT_JS="${SUGARCUBE_INSTALLED_PATH}/format.js"
SUGARCUBE_NEEDS_INSTALL=true
if [ -f "$SUGARCUBE_FORMAT_JS" ]; then
    if grep -q "\"version\":\"${SUGARCUBE_VERSION}\"" "$SUGARCUBE_FORMAT_JS"; then
        echo -e "${GREEN}SugarCube ${SUGARCUBE_VERSION} already installed.${NC}"
        echo -e "${YELLOW}Skipping download...${NC}"
        SUGARCUBE_NEEDS_INSTALL=false
    else
        echo -e "${YELLOW}SugarCube found but not version ${SUGARCUBE_VERSION}. Reinstalling...${NC}"
        rm -rf "$SUGARCUBE_INSTALLED_PATH"
    fi
fi
if [ "$SUGARCUBE_NEEDS_INSTALL" = true ]; then
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

# Install npm dependencies (Playwright, etc.) if npm is available
if command -v npm >/dev/null 2>&1; then
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing npm dependencies...${NC}"
        npm install
    else
        echo -e "${GREEN}npm dependencies already installed.${NC}"
    fi
else
    echo -e "${YELLOW}npm not found — skipping JS dependency install. Install Node.js if you want to run the test suite.${NC}"
fi

# Configure git to use the repo's hooks
git config core.hooksPath .githooks
echo -e "${GREEN}Git hooks configured.${NC}"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${GREEN}You can now run ./build.sh to build the story.${NC}"
