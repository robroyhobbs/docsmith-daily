#!/bin/bash
#
# DocSmith Automation - Linux Setup Script
# Run this on a fresh Linux machine (Ubuntu/Debian) to set up the automation
#

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  DocSmith Automation - Linux Setup"
echo "═══════════════════════════════════════════════════════════════"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="${INSTALL_DIR:-$HOME/automation}"
DOCSMITH_REPO="https://github.com/robroyhobbs/docsmith-daily.git"
HUB_REPO="https://github.com/robroyhobbs/content-automation.git"
NODE_VERSION="20"

echo ""
echo "Install directory: $INSTALL_DIR"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Warning: Running as root. Consider running as a regular user.${NC}"
fi

# Step 1: Install system dependencies
echo -e "\n${GREEN}[1/7] Installing system dependencies...${NC}"
if command -v apt-get &> /dev/null; then
  sudo apt-get update
  sudo apt-get install -y curl git build-essential
elif command -v yum &> /dev/null; then
  sudo yum install -y curl git gcc-c++ make
elif command -v dnf &> /dev/null; then
  sudo dnf install -y curl git gcc-c++ make
else
  echo -e "${RED}Unsupported package manager. Install curl, git, and build tools manually.${NC}"
  exit 1
fi

# Step 2: Install Node.js via nvm
echo -e "\n${GREEN}[2/7] Installing Node.js v${NODE_VERSION}...${NC}"
if ! command -v node &> /dev/null; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install $NODE_VERSION
  nvm use $NODE_VERSION
  nvm alias default $NODE_VERSION
else
  echo "Node.js already installed: $(node --version)"
fi

# Step 3: Install Claude CLI
echo -e "\n${GREEN}[3/7] Installing Claude CLI...${NC}"
if ! command -v claude &> /dev/null; then
  npm install -g @anthropic-ai/claude-code
  echo ""
  echo -e "${YELLOW}IMPORTANT: You need to authenticate Claude CLI.${NC}"
  echo "Run 'claude' and follow the prompts to log in."
  echo ""
else
  echo "Claude CLI already installed: $(claude --version 2>/dev/null || echo 'installed')"
fi

# Step 4: Create directory structure
echo -e "\n${GREEN}[4/7] Creating directory structure...${NC}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Step 5: Clone repositories
echo -e "\n${GREEN}[5/7] Cloning repositories...${NC}"
if [ ! -d "docsmith-daily" ]; then
  git clone "$DOCSMITH_REPO" docsmith-daily
else
  echo "docsmith-daily already exists, pulling latest..."
  cd docsmith-daily && git pull && cd ..
fi

if [ ! -d "content-automation" ]; then
  git clone "$HUB_REPO" content-automation 2>/dev/null || echo "content-automation repo not available yet"
else
  echo "content-automation already exists, pulling latest..."
  cd content-automation && git pull && cd ..
fi

# Step 6: Install npm dependencies
echo -e "\n${GREEN}[6/7] Installing npm dependencies...${NC}"
cd "$INSTALL_DIR/docsmith-daily"
npm install

if [ -d "$INSTALL_DIR/content-automation" ]; then
  cd "$INSTALL_DIR/content-automation"
  npm install
fi

# Step 7: Set up cron jobs
echo -e "\n${GREEN}[7/7] Setting up cron jobs...${NC}"

# Create a wrapper script for cron (handles PATH issues)
cat > "$INSTALL_DIR/run-docsmith.sh" << 'WRAPPER'
#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:$PATH"

cd "$HOME/automation/docsmith-daily"
node src/index.mjs >> logs/cron.log 2>&1
WRAPPER
chmod +x "$INSTALL_DIR/run-docsmith.sh"

# Create cron entry (9 AM daily)
CRON_JOB="0 9 * * * $INSTALL_DIR/run-docsmith.sh"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "run-docsmith.sh"; then
  echo "Cron job already exists"
else
  # Add to crontab
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "Added cron job: $CRON_JOB"
fi

# Create log rotation config
echo -e "\n${GREEN}Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/docsmith > /dev/null << LOGROTATE
$INSTALL_DIR/docsmith-daily/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}
LOGROTATE

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  1. Authenticate Claude CLI:"
echo "     claude"
echo ""
echo "  2. Test the automation:"
echo "     cd $INSTALL_DIR/docsmith-daily"
echo "     node src/index.mjs"
echo ""
echo "  3. Check cron is set up:"
echo "     crontab -l"
echo ""
echo "  4. Monitor logs:"
echo "     tail -f $INSTALL_DIR/docsmith-daily/logs/automation.log"
echo ""
echo "Automation will run daily at 9:00 AM"
echo ""
