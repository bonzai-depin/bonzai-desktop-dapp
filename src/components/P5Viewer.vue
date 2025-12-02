<template>
  <div ref="p5Container" class="p5-container">
    <!-- Game UI Overlay - HUD elements only -->
    <div class="game-ui-overlay" v-show="!hideUI">
      <!-- Score and Stats -->
      <div class="game-hud">
        <div class="hud-item score">
          <span class="material-symbols-outlined">stars</span>
          <span>Score: {{ gameState.score }}</span>
        </div>
        <div class="hud-item lives" v-show="gameState.lives !== null">
          <span class="material-symbols-outlined">favorite</span>
          <span>{{ gameState.lives }}</span>
        </div>
        <div class="hud-item level" v-show="gameState.level > 1">
          <span class="material-symbols-outlined">trending_up</span>
          <span>Level {{ gameState.level }}</span>
        </div>
      </div>

      <!-- Performance Stats -->
      <div class="perf-stats">
        <div class="stat">
          <span class="material-symbols-outlined">speed</span>
          <span>{{ fps }} FPS</span>
        </div>
      </div>
    </div>

    <!-- Game State Screens - ALWAYS VISIBLE regardless of hideUI -->
    <div class="game-screens-overlay">
      <!-- Start Screen -->
      <div class="game-screen start-screen" v-show="gameState.state === 'menu' && !enableControls">
        <div class="screen-content">
          <h1 class="game-title">{{ gameState.title || "Game Ready" }}</h1>
          <p class="game-instructions" v-show="gameState.instructions">
            {{ gameState.instructions }}
          </p>
          <div class="controls-hint" v-show="gameState.controls">
            <h3>Controls:</h3>
            <ul>
              <li v-for="(desc, key) in gameState.controls" :key="key">
                <kbd>{{ key }}</kbd>
                - {{ desc }}
              </li>
            </ul>
          </div>
          <button class="game-button primary" @click="startGame">
            <span class="material-symbols-outlined">play_arrow</span>
            Start Game
          </button>
        </div>
      </div>

      <!-- Theater Mode Start Prompt (when in theater but game not started) -->
      <div class="theater-start-prompt" v-show="enableControls && gameState.state === 'menu'">
        <div class="prompt-content theater-prompt">
          <h2>🎮 Ready to Play!</h2>
          <p>{{ gameState.title || "Game Loaded" }}</p>
          <button class="game-button primary large" @click="startGame">
            <span class="material-symbols-outlined">play_arrow</span>
            START GAME
          </button>
          <small>Game should auto-start, but click if needed</small>
        </div>
      </div>

      <!-- Pause Screen -->
      <div
        class="game-screen pause-screen"
        v-show="gameState.state === 'paused'"
      >
        <div class="screen-content">
          <h1>⏸️ Paused</h1>
          <button class="game-button primary" @click="resumeGame">
            <span class="material-symbols-outlined">play_arrow</span>
            Resume
          </button>
          <button class="game-button secondary" @click="restartGame">
            <span class="material-symbols-outlined">restart_alt</span>
            Restart
          </button>
        </div>
      </div>

      <!-- Game Over Screen -->
      <div
        class="game-screen gameover-screen"
        v-show="gameState.state === 'gameover'"
      >
        <div class="screen-content">
          <h1>🎮 Game Over</h1>
          <div class="final-score">
            <span class="material-symbols-outlined">stars</span>
            Final Score: {{ gameState.score }}
          </div>
          <p class="game-message" v-show="gameState.gameOverMessage">
            {{ gameState.gameOverMessage }}
          </p>
          <button class="game-button primary" @click="restartGame">
            <span class="material-symbols-outlined">restart_alt</span>
            Play Again
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import p5 from "p5";

export default {
  name: "P5Viewer",
  props: {
    enableControls: {
      type: Boolean,
      default: false,
    },
    hideUI: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      p5Instance: null,
      animationActive: true,
      fps: 0,
      lastFrameTime: 0,
      frameCount: 0,
      isFullscreen: false,
      input: {
        keys: {},
        mouse: { x: 0, y: 0, pressed: false },
      },
      gameState: {
        state: "menu",
        score: 0,
        lives: 3,
        level: 1,
        title: "",
        instructions: "",
        controls: null,
        gameOverMessage: "",
      },
    };
  },
  watch: {
    enableControls(newVal, oldVal) {
      console.log("🎮 [P5Viewer] enableControls changed:", oldVal, "→", newVal);
      
      // Auto-start game when entering theater mode
      if (newVal === true && this.gameState.state === "menu") {
        console.log("🎮 [P5Viewer] Entering theater mode - AUTO-STARTING GAME");
        setTimeout(() => {
          this.startGame();
          console.log("🎮 [P5Viewer] Game started from theater mode change");
        }, 100);
      }
    }
  },
  async mounted() {
    await this.$nextTick();
    this.initP5();
    this.setupFullscreenDetection();
  },
  beforeUnmount() {
    this.cleanup();
  },
  methods: {
    setupFullscreenDetection() {
      const checkFullscreen = () => {
        this.isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement
        );
      };

      document.addEventListener('fullscreenchange', checkFullscreen);
      document.addEventListener('webkitfullscreenchange', checkFullscreen);
      document.addEventListener('mozfullscreenchange', checkFullscreen);
    },

    initP5() {
      const sketch = (p) => {
        p.setup = () => {
          const container = this.$refs.p5Container;
          const width = container.clientWidth || 800;
          const height = container.clientHeight || 600;
          p.createCanvas(width, height);
          p.frameRate(60);
          p.pixelDensity(2);
        };

        p.draw = () => {
          // Background gradient
          const c1 = p.color(20, 24, 40);
          const c2 = p.color(40, 20, 60);
          for (let y = 0; y < p.height; y++) {
            const inter = p.map(y, 0, p.height, 0, 1);
            const c = p.lerpColor(c1, c2, inter);
            p.stroke(c);
            p.line(0, y, p.width, y);
          }
          
          p.noStroke();
          p.fill(255, 255, 255, 100);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(24);
          p.text("Ready for 2D generation", p.width / 2, p.height / 2);

          this.frameCount++;
          const now = performance.now();
          if (now >= this.lastFrameTime + 1000) {
            this.fps = Math.round(
              (this.frameCount * 1000) / (now - this.lastFrameTime)
            );
            this.frameCount = 0;
            this.lastFrameTime = now;
          }
        };

        p.windowResized = () => {
          const container = this.$refs.p5Container;
          if (container) {
            p.resizeCanvas(container.clientWidth, container.clientHeight);
          }
        };

        // Only capture input when controls are enabled AND in fullscreen
        p.keyPressed = () => {
          if (!this.enableControls || !this.isFullscreen) return;
          this.input.keys[p.key] = true;
          this.input.keys[p.keyCode] = true;

          if (p.key === "Escape" && this.gameState.state === "playing") {
            this.pauseGame();
          }
        };

        p.keyReleased = () => {
          if (!this.enableControls || !this.isFullscreen) return;
          this.input.keys[p.key] = false;
          this.input.keys[p.keyCode] = false;
        };

        p.mousePressed = () => {
          if (!this.enableControls || !this.isFullscreen) return;
          this.input.mouse.pressed = true;
        };

        p.mouseReleased = () => {
          if (!this.enableControls || !this.isFullscreen) return;
          this.input.mouse.pressed = false;
        };

        p.mouseMoved = () => {
          if (!this.enableControls || !this.isFullscreen) return;
          this.input.mouse.x = p.mouseX;
          this.input.mouse.y = p.mouseY;
        };
      };

      this.p5Instance = new p5(sketch, this.$refs.p5Container);
    },

    async applyModuleCode(code, mode = "replace") {
      try {
        if (!code || typeof code !== "string") {
          throw new Error("Invalid code: Code must be a non-empty string");
        }

        const blob = new Blob([code], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);

        let mod;
        try {
          mod = await import(/* @vite-ignore */ url);
        } catch (importError) {
          URL.revokeObjectURL(url);
          throw new Error(`Module import failed: ${importError.message}`);
        }

        URL.revokeObjectURL(url);

        const generate = mod?.default;
        if (typeof generate !== "function") {
          throw new Error("Module must export a default function");
        }

        if (mode === "replace" && this.p5Instance) {
          this.p5Instance.remove();
          this.p5Instance = null;
        }

        const sketch = (p) => {
          let generatedSetup, generatedDraw;
          let Matter = null;

          // Try to load Matter.js if available
          try {
            if (window.Matter) {
              Matter = window.Matter;
            }
          } catch (e) {
            console.log("Matter.js not available");
          }

          try {
            const result = generate(p, {
              gameState: this.gameState,
              isFullscreen: () => this.isFullscreen,
              Matter: Matter,
              setGameInfo: (info) => {
                if (info.title) this.gameState.title = info.title;
                if (info.instructions)
                  this.gameState.instructions = info.instructions;
                if (info.controls) this.gameState.controls = info.controls;
              },
              setScore: (score) => {
                this.gameState.score = score;
              },
              addScore: (points) => {
                this.gameState.score += points;
              },
              setLives: (lives) => {
                this.gameState.lives = lives;
              },
              setLevel: (level) => {
                this.gameState.level = level;
              },
              gameOver: (message = "") => {
                this.endGame(message);
              },
            });

            if (typeof result === "object") {
              generatedSetup = result.setup;
              generatedDraw = result.draw;
            } else if (typeof result === "function") {
              generatedDraw = result;
            }
          } catch (err) {
            console.error("Generation function error:", err);
          }

          p.setup = () => {
            const container = this.$refs.p5Container;
            const width = container?.clientWidth || 800;
            const height = container?.clientHeight || 600;
            p.createCanvas(width, height);
            p.frameRate(60);
            p.pixelDensity(2);

            if (generatedSetup) {
              try {
                generatedSetup();
              } catch (err) {
                console.error("Setup error:", err);
              }
            }
          };

          p.draw = () => {
            this.frameCount++;
            const now = performance.now();
            if (now >= this.lastFrameTime + 1000) {
              this.fps = Math.round(
                (this.frameCount * 1000) / (now - this.lastFrameTime)
              );
              this.frameCount = 0;
              this.lastFrameTime = now;
            }

            // Only draw game when playing AND controls enabled
            if (this.gameState.state === "playing" && this.enableControls && generatedDraw) {
              try {
                generatedDraw();
              } catch (err) {
                console.error("Draw error:", err);
                p.background(100, 0, 0);
                p.fill(255);
                p.textAlign(p.CENTER, p.CENTER);
                p.text("Error in draw loop", p.width / 2, p.height / 2);
              }
            } else if (this.gameState.state !== "playing") {
              // Show static background when not playing
              const c1 = p.color(20, 24, 40);
              const c2 = p.color(40, 20, 60);
              for (let y = 0; y < p.height; y++) {
                const inter = p.map(y, 0, p.height, 0, 1);
                const c = p.lerpColor(c1, c2, inter);
                p.stroke(c);
                p.line(0, y, p.width, y);
              }
            }
          };

          p.windowResized = () => {
            const container = this.$refs.p5Container;
            if (container) {
              p.resizeCanvas(container.clientWidth, container.clientHeight);
            }
          };

          // Input handling - always track state, but only process if enabled
          p.keyPressed = () => {
            // Always track key state
            this.input.keys[p.key] = true;
            this.input.keys[p.keyCode] = true;

            // Only handle game logic if controls enabled
            if (this.enableControls) {
              if (p.key === "Escape" && this.gameState.state === "playing") {
                this.pauseGame();
              }
            }
          };

          p.keyReleased = () => {
            // Always track key state
            this.input.keys[p.key] = false;
            this.input.keys[p.keyCode] = false;
          };

          p.mousePressed = () => {
            if (this.enableControls) {
              this.input.mouse.pressed = true;
            }
          };

          p.mouseReleased = () => {
            if (this.enableControls) {
              this.input.mouse.pressed = false;
            }
          };

          p.mouseMoved = () => {
            if (this.enableControls) {
              this.input.mouse.x = p.mouseX;
              this.input.mouse.y = p.mouseY;
            }
          };
        };

        this.p5Instance = new p5(sketch, this.$refs.p5Container);
        
        // Auto-start game when new scene is loaded in theater mode
        if (this.enableControls && this.gameState.state === "menu") {
          setTimeout(() => {
            this.startGame();
          }, 100);
        }
        
        this.$emit?.("generation-success", { mode });
      } catch (err) {
        console.error("Failed to apply P5 module:", err);
        const errorMessage = `❌ P5.js Error: ${err.message}`;
        this.$emit?.("generation-error", { error: err, message: errorMessage });
        throw new Error(errorMessage);
      }
    },

    startGame() {
      this.gameState.state = "playing";
      this.gameState.score = 0;
      this.$emit("game-started");
    },

    pauseGame() {
      if (this.gameState.state === "playing") {
        this.gameState.state = "paused";
        this.$emit("game-paused");
      }
    },

    resumeGame() {
      if (this.gameState.state === "paused") {
        this.gameState.state = "playing";
        this.$emit("game-resumed");
      }
    },

    restartGame() {
      this.gameState.state = "menu";
      this.gameState.score = 0;
      this.gameState.lives = 3;
      this.gameState.level = 1;
      this.gameState.gameOverMessage = "";
      this.clear();
      this.$emit("game-restarted");
      setTimeout(() => {
        this.startGame();
      }, 100);
    },

    endGame(message = "") {
      this.gameState.state = "gameover";
      this.gameState.gameOverMessage = message;
      this.$emit("game-ended", { score: this.gameState.score });
    },

    clear() {
      if (this.p5Instance) {
        this.p5Instance.remove();
        this.p5Instance = null;
      }
      this.gameState = {
        state: "menu",
        score: 0,
        lives: 3,
        level: 1,
        title: "",
        instructions: "",
        controls: null,
        gameOverMessage: "",
      };
      this.initP5();
    },

    cleanup() {
      if (this.p5Instance) {
        this.p5Instance.remove();
        this.p5Instance = null;
      }
    },
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

.p5-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #14141f;
  display: flex;
  align-items: center;
  justify-content: center;
}

.p5-container canvas {
  display: block !important;
  max-width: 100%;
  max-height: 100%;
  width: auto !important;
  height: auto !important;
  margin: 0 auto;
}

/* Use same styles as ThreeViewer for consistency */
.game-ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.game-screens-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 150;
}

/* Theater Mode Start Prompt */
.theater-start-prompt {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  pointer-events: all;
  z-index: 200;
  animation: fadeIn 0.3s ease;
}

.theater-prompt {
  animation: pulse 2s ease-in-out infinite;
  text-align: center;
}

.theater-prompt h2 {
  font-size: 64px;
  margin-bottom: 20px;
  color: #fff;
  font-family: "Fira Sans", sans-serif;
}

.theater-prompt p {
  font-size: 24px;
  margin-bottom: 30px;
  color: rgba(255, 255, 255, 0.8);
  font-family: "Fira Sans", sans-serif;
}

.theater-prompt .game-button.large {
  padding: 24px 60px;
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 20px;
}

.theater-prompt small {
  display: block;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

.game-hud {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.hud-item {
  background: rgba(0, 0, 0, 0.85);
  border: 2px solid rgba(97, 55, 142, 0.8);
  border-radius: 12px;
  padding: 12px 20px;
  font-family: "Fira Sans", "Monaco", monospace;
  backdrop-filter: blur(32px);
  box-shadow: 0 8px 32px rgba(97, 55, 142, 0.3);
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 150px;
}

.hud-item.score {
  font-size: 24px;
  font-weight: 700;
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.hud-item.lives {
  font-size: 20px;
  color: #ff6b6b;
  text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
}

.hud-item.level {
  font-size: 18px;
  color: #4ecdc4;
  text-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.hud-item .material-symbols-outlined {
  font-size: 28px;
  font-variation-settings:
    "FILL" 1,
    "wght" 400,
    "GRAD" 0,
    "opsz" 24;
}

.perf-stats {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat {
  color: #ff6ec7;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 0 0 10px rgba(255, 110, 199, 0.5);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  border-radius: 8px;
  backdrop-filter: blur(16px);
}

.stat .material-symbols-outlined {
  font-size: 18px;
  color: rgba(97, 55, 142, 1);
}

/* Fullscreen Prompt */
.fullscreen-prompt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 150;
}

.prompt-content {
  background: rgba(0, 0, 0, 0.9);
  border: 2px solid rgba(97, 55, 142, 0.8);
  border-radius: 16px;
  padding: 30px 40px;
  text-align: center;
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 60px rgba(97, 55, 142, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

.prompt-content .material-symbols-outlined {
  font-size: 64px;
  color: #ff6ec7;
  display: block;
  margin-bottom: 15px;
}

.prompt-content p {
  color: #fff;
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 10px 0;
  font-family: "Fira Sans", sans-serif;
}

.prompt-content small {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

.game-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  pointer-events: all;
  animation: fadeIn 0.3s ease;
}

.game-screen[style*="display: none"] {
  pointer-events: none !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.screen-content {
  text-align: center;
  max-width: 600px;
  padding: 40px;
  background: rgba(20, 20, 40, 0.95);
  border: 3px solid rgba(97, 55, 142, 0.8);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(97, 55, 142, 0.5);
}

.game-title {
  font-size: 48px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 20px;
  text-shadow: 0 0 20px rgba(97, 55, 142, 0.8);
  font-family: "Fira Sans", sans-serif;
}

.game-instructions {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 30px;
  line-height: 1.6;
}

.controls-hint {
  background: rgba(0, 0, 0, 0.5);
  padding: 20px;
  border-radius: 12px;
  margin: 20px 0;
  text-align: left;
}

.controls-hint h3 {
  color: #4ecdc4;
  font-size: 20px;
  margin-bottom: 15px;
  font-family: "Fira Sans", sans-serif;
}

.controls-hint ul {
  list-style: none;
  padding: 0;
}

.controls-hint li {
  color: #fff;
  font-size: 16px;
  margin: 10px 0;
  display: flex;
  align-items: center;
  gap: 15px;
}

.controls-hint kbd {
  background: rgba(97, 55, 142, 0.8);
  padding: 6px 12px;
  border-radius: 6px;
  font-family: "Monaco", monospace;
  font-weight: 600;
  min-width: 60px;
  text-align: center;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.final-score {
  font-size: 36px;
  font-weight: 700;
  color: #ffd700;
  margin: 30px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.final-score .material-symbols-outlined {
  font-size: 48px;
}

.game-message {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 30px;
}

/* Game Buttons */
.game-button {
  padding: 16px 40px;
  font-size: 18px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.15s ease;
  margin: 8px;
  font-family: "Fira Sans", sans-serif;
  pointer-events: all;
  text-transform: none;
  white-space: nowrap;
}

.game-button.primary {
  background-color: #00d1b2;
  color: #fff;
}

.game-button.primary:hover {
  background-color: #00c4a7;
  transform: scale(1.05);
}

.game-button.secondary {
  background-color: #ffdd57;
  color: rgba(0, 0, 0, 0.7);
}

.game-button.secondary:hover {
  background-color: #ffd83d;
  transform: scale(1.05);
}

.game-button.danger {
  background-color: #f14668;
  color: #fff;
}

.game-button.danger:hover {
  background-color: #ef2e55;
  transform: scale(1.05);
}

.game-button .material-symbols-outlined {
  font-size: 22px;
}
</style>