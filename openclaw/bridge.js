#!/usr/bin/env node
/**
 * BonzAI-OpenClaw Bridge Health Check Utility
 *
 * NOTE: The bridge server functionality has been integrated directly into the
 * Electron main process (src/main.js). This file now serves as documentation
 * and a simple health-check utility.
 *
 * The OpenClaw gateway should send webhooks directly to:
 *   http://localhost:3002/webhook
 *
 * This uses the same generation pipeline as the desktop app:
 * - LLM: node-llama-cpp in Electron main process
 * - Image: Flask server on port 65000
 * - Audio: Flask server on port 65000
 *
 * No separate server process needed - just start the BonzAI desktop app!
 */

const ELECTRON_API_PORT = process.env.OPENCLAW_API_PORT || 3002;
const FLASK_PORT = process.env.BONZAI_SERVER_PORT || 65000;

async function checkHealth() {
  try {
    // Check Electron OpenClaw API
    const electronRes = await fetch(`http://localhost:${ELECTRON_API_PORT}/health`);
    const electronHealth = await electronRes.json();

    // Check Flask server
    let flaskHealth = null;
    try {
      const flaskRes = await fetch(`http://localhost:${FLASK_PORT}/`);
      flaskHealth = await flaskRes.json();
    } catch (e) {
      flaskHealth = { error: e.message };
    }

    return { electron: electronHealth, flask: flaskHealth };
  } catch (error) {
    return { error: error.message };
  }
}

async function listCompanions() {
  try {
    const res = await fetch(`http://localhost:${ELECTRON_API_PORT}/companions`);
    return await res.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function listScenarios() {
  try {
    const res = await fetch(`http://localhost:${ELECTRON_API_PORT}/scenarios`);
    return await res.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function testChat(message) {
  try {
    const res = await fetch(`http://localhost:${ELECTRON_API_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'test',
        channelId: 'test-channel',
        message: message,
        userId: 'test-user',
      }),
    });
    return await res.json();
  } catch (error) {
    return { error: error.message };
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'health';

  console.log('BonzAI-OpenClaw Integration');
  console.log('===========================');
  console.log(`Electron API: http://localhost:${ELECTRON_API_PORT}`);
  console.log(`Flask Server: http://localhost:${FLASK_PORT}`);
  console.log('');

  switch (command) {
    case 'health':
      console.log('Checking health...');
      const health = await checkHealth();
      if (health.error) {
        console.log('\nStatus: NOT READY');
        console.log(`Error: ${health.error}`);
        console.log('\nMake sure the BonzAI desktop app is running first:');
        console.log('  cd /path/to/bonzai-desktop-dapp && npm run start');
      } else {
        console.log('\nStatus: READY');
        console.log(`LLM Loaded: ${health.electron?.llmLoaded || false}`);
        console.log(`Model: ${health.electron?.modelName || 'none'}`);
        console.log(`Companions: ${health.electron?.companions || 0}`);
        console.log(`Scenarios: ${health.electron?.scenarios || 0}`);
        console.log(`Flask: ${health.flask?.error ? 'error' : 'ok'}`);
      }
      break;

    case 'companions':
      console.log('Listing companions...');
      const companions = await listCompanions();
      if (companions.error) {
        console.log(`Error: ${companions.error}`);
      } else {
        console.log(`\nFound ${companions.length} companion(s):`);
        companions.forEach((c) => {
          console.log(`  - ${c.name} (${c.id}): ${c.description?.substring(0, 60)}...`);
        });
      }
      break;

    case 'scenarios':
      console.log('Listing scenarios...');
      const scenarios = await listScenarios();
      if (scenarios.error) {
        console.log(`Error: ${scenarios.error}`);
      } else {
        console.log(`\nFound ${scenarios.length} scenario(s):`);
        scenarios.forEach((s) => {
          console.log(`  - ${s.name} (${s.id}): ${s.description?.substring(0, 60)}...`);
        });
      }
      break;

    case 'chat':
      const message = args.slice(1).join(' ') || 'Hello!';
      console.log(`Sending: "${message}"`);
      const response = await testChat(message);
      if (response.error) {
        console.log(`Error: ${response.error}`);
      } else {
        console.log(`\nCompanion: ${response.companion?.name || 'unknown'}`);
        console.log(`Response: ${response.text}`);
        if (response.audioPath) console.log(`Audio: ${response.audioPath}`);
        if (response.imageBase64) console.log(`Image: [generated]`);
      }
      break;

    case 'config':
      console.log('\nOpenClaw Gateway Configuration:');
      console.log('--------------------------------');
      console.log(`webhook_url: http://localhost:${ELECTRON_API_PORT}/webhook`);
      console.log('');
      console.log('Example OpenClaw config.yaml:');
      console.log('  bonzai:');
      console.log(`    webhook_url: http://localhost:${ELECTRON_API_PORT}/webhook`);
      console.log('    enabled: true');
      break;

    default:
      console.log('Usage: node bridge.js [command]');
      console.log('');
      console.log('Commands:');
      console.log('  health      - Check if BonzAI is running (default)');
      console.log('  companions  - List available companions');
      console.log('  scenarios   - List available scenarios');
      console.log('  chat <msg>  - Send a test message');
      console.log('  config      - Show OpenClaw gateway configuration');
  }
}

main().catch(console.error);
