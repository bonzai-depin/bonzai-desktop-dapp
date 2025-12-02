#!/bin/bash
# BonzAI Production Features Migration Script
# Run from the root of bonzai-desktop-dapp

set -e

echo "🌳 BonzAI Production Features Migration"
echo "========================================"

# Check we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Error: Run this script from the bonzai-desktop-dapp root directory"
    exit 1
fi

echo ""
echo "📁 Creating new directories..."

# Create new directories
mkdir -p src/services
mkdir -p src/stores
mkdir -p src/composables

echo "   ✓ src/services/"
echo "   ✓ src/stores/"
echo "   ✓ src/composables/"

echo ""
echo "📦 Installing new dependencies..."

# Install required npm packages
npm install --save pinia ethers@5.7.2 uuid

echo "   ✓ pinia (state management)"
echo "   ✓ ethers (blockchain integration)"
echo "   ✓ uuid (unique ID generation)"

echo ""
echo "📋 Migration checklist:"
echo ""
echo "1. COPY NEW FILES to src/services/:"
echo "   - tokenGating.js"
echo "   - nftMinter.js"
echo "   - peerNetwork.js"
echo "   - zkPrivacy.js"
echo "   - agentMarketplace.js"
echo "   - index.js"
echo ""
echo "2. COPY NEW FILES to src/stores/:"
echo "   - inferenceStore.js"
echo ""
echo "3. COPY NEW FILES to src/composables/:"
echo "   - useBonzai.js"
echo ""
echo "4. COPY NEW COMPONENTS to src/components/:"
echo "   - TokenGateStatus.vue"
echo "   - NFTMintButton.vue"
echo "   - P2PInferencePanel.vue"
echo "   - ZKPrivacyToggle.vue"
echo "   - WorkflowEditor.vue"
echo "   - GenerativeAgent.vue"
echo "   - index.js"
echo ""
echo "5. REPLACE EXISTING COMPONENTS in src/components/:"
echo "   - Generative3D.vue"
echo "   - GenerativeImage.vue"
echo "   - GenerativeVideo.vue"
echo "   - GenerativeText.vue"
echo "   - GenerativeMusic.vue"
echo "   - GenerativeRobot.vue"
echo "   - SmartAgent.vue"
echo ""
echo "6. COPY SERVER MODULE to server/:"
echo "   - production_features.py"
echo ""
echo "7. UPDATE src/main.js (see main.js.example)"
echo ""
echo "8. UPDATE server/diffuser.py to import production_features"
echo ""

echo "✅ Directory structure ready for migration!"
echo ""
echo "After copying files, run: npm run dev"