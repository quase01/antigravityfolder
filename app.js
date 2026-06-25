import { QUESTIONS, CREATURES } from './database.js';
import { sound } from './sound.js';
import { particleEngine } from './particles.js';

// DOM Element Selectors
const screens = {
  menu: document.getElementById('menu-screen'),
  incubation: document.getElementById('incubation-screen'),
  hatch: document.getElementById('hatch-screen'),
  bestiary: document.getElementById('bestiary-screen'),
};

const buttons = {
  start: document.getElementById('start-btn'),
  back: document.getElementById('back-btn'),
  restart: document.getElementById('restart-btn'),
  share: document.getElementById('share-btn'),
  soundToggle: document.getElementById('sound-btn'),
  bestiaryToggle: document.getElementById('bestiary-btn'),
  closeBestiary: document.getElementById('close-bestiary-btn'),
  resetBestiary: document.getElementById('reset-bestiary-btn'),
  closeInspector: document.getElementById('close-inspector-btn'),
};

const qTitleEl = document.getElementById('q-title');
const qTextEl = document.getElementById('q-text');
const choicesBox = document.getElementById('choices-box');
const indicatorsContainer = document.getElementById('indicators-container');
const gameEggContainer = document.getElementById('game-egg-container');
const particleCanvas = document.getElementById('particle-canvas');

// Hatch Reveal Elements
const hatchEl = {
  emoji: document.getElementById('h-emoji'),
  name: document.getElementById('h-name'),
  rarity: document.getElementById('h-rarity'),
  element: document.getElementById('h-element'),
  lore: document.getElementById('h-lore'),
};

// Bestiary Modal Inspector
const inspectorModal = document.getElementById('inspector-modal');
const insEl = {
  emoji: document.getElementById('ins-emoji'),
  name: document.getElementById('ins-name'),
  rarity: document.getElementById('ins-rarity'),
  element: document.getElementById('ins-element'),
  lore: document.getElementById('ins-lore'),
};

// State Variables
let currentStep = 0;
let selections = [];
let unlockedPaths = [];
let currentThemeColor = '#f1c40f'; // Default gold glow

// Init
window.addEventListener('DOMContentLoaded', () => {
  // Setup Particles
  particleEngine.init(particleCanvas);
  
  // Load Sound Settings
  syncSoundIcons();
  
  // Load Bestiary Data
  loadBestiary();

  // Button Click Listeners
  buttons.start.addEventListener('click', startIncubation);
  buttons.back.addEventListener('click', handleBack);
  buttons.restart.addEventListener('click', () => {
    sound.playClick();
    startIncubation();
  });
  buttons.soundToggle.addEventListener('click', toggleMute);
  buttons.bestiaryToggle.addEventListener('click', () => showScreen(screens.bestiary));
  buttons.closeBestiary.addEventListener('click', () => showScreen(screens.menu));
  buttons.resetBestiary.addEventListener('click', resetBestiary);
  buttons.closeInspector.addEventListener('click', () => {
    sound.playClick();
    document.querySelector('#inspector-modal .inspector-card').classList.remove('active');
    inspectorModal.classList.remove('active');
  });
  buttons.share.addEventListener('click', shareCreature);

  document.getElementById('close-inspector-btn').addEventListener('click', () => {
    sound.playClick();
    document.querySelector('#inspector-modal .inspector-card').classList.remove('active');
    inspectorModal.classList.remove('active');
  });

  // Egg interaction (easter egg wiggle)
  gameEggContainer.addEventListener('click', () => {
    if (screens.incubation.classList.contains('active') && selections.length < 5) {
      wiggleEgg();
      sound.playWiggle();
      const rect = gameEggContainer.getBoundingClientRect();
      particleEngine.triggerBurst(rect.left + rect.width/2, rect.top + rect.height/2, currentThemeColor);
    }
  });
});

// Screen Transitions
function showScreen(targetScreen) {
  sound.playClick();
  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });
  targetScreen.classList.add('active');
}

// Incubation Controller
function startIncubation() {
  currentStep = 0;
  selections = [];
  currentThemeColor = '#f1c40f';
  updateThemeColors(currentThemeColor, 'rgba(241, 196, 15, 0.3)');
  
  // Reset Egg CSS Classes
  gameEggContainer.style.display = 'block';
  gameEggContainer.className = 'egg-container id-egg-container';
  
  // Hide choices controls initially if necessary, then show
  choicesBox.style.pointerEvents = 'all';
  choicesBox.style.opacity = '1';
  buttons.back.style.display = 'inline-flex';
  indicatorsContainer.style.opacity = '1';
  
  renderQuestion();
  
  // Swap Screen
  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });
  screens.incubation.classList.add('active');
}

function renderQuestion() {
  const currentQ = QUESTIONS[currentStep];
  qTitleEl.textContent = `Stage ${currentStep + 1}: ${currentQ.title}`;
  qTextEl.textContent = currentQ.text;
  
  choicesBox.innerHTML = '';
  currentQ.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'choice-card';
    btn.innerHTML = `
      <span class="choice-label">${opt.label}</span>
      <span class="choice-desc">${opt.desc}</span>
    `;
    btn.addEventListener('click', (e) => handleChoice(opt.value, e));
    choicesBox.appendChild(btn);
  });

  // Render Dots
  const dots = indicatorsContainer.querySelectorAll('.dot');
  dots.forEach((dot, idx) => {
    dot.className = 'dot';
    if (idx === currentStep) {
      dot.classList.add('active');
    } else if (idx < currentStep) {
      dot.classList.add('passed');
    }
  });

  // Render Back button visibility
  if (currentStep === 0) {
    buttons.back.style.visibility = 'hidden';
  } else {
    buttons.back.style.visibility = 'visible';
  }
}

function handleChoice(val, event) {
  // Spark effect at mouse click location
  particleEngine.triggerBurst(event.clientX, event.clientY, currentThemeColor);
  
  selections.push(val);
  sound.playWiggle();
  wiggleEgg();
  
  // Apply cracking visual progression
  gameEggContainer.className = `egg-container id-egg-container stage-${selections.length}`;
  
  // Dynamic color shift based on progress choices
  updateThemeBasedOnSelections();

  if (selections.length < 5) {
    currentStep++;
    setTimeout(renderQuestion, 350);
  } else {
    // Hatching sequence
    triggerHatchingFlow();
  }
}

function handleBack() {
  if (selections.length > 0) {
    sound.playClick();
    selections.pop();
    currentStep--;
    gameEggContainer.className = `egg-container id-egg-container stage-${selections.length}`;
    updateThemeBasedOnSelections();
    renderQuestion();
  }
}

function wiggleEgg() {
  gameEggContainer.classList.add('wiggle');
  setTimeout(() => {
    gameEggContainer.classList.remove('wiggle');
  }, 400);
}

function updateThemeBasedOnSelections() {
  // Let the choices shift colors: 
  // Cold (1st choice = 1) turns it cyan, warm (1st choice = 0) turns it orange-red.
  // Celestial vs Void shifts it purple or gold.
  let color = '#f1c40f';
  let glow = 'rgba(241, 196, 15, 0.3)';
  
  if (selections.length > 0) {
    if (selections[0] === 0) {
      color = '#e67e22'; // Warm
      glow = 'rgba(230, 126, 34, 0.4)';
    } else {
      color = '#3498db'; // Cool
      glow = 'rgba(52, 152, 219, 0.4)';
    }
  }
  if (selections.length > 1) {
    if (selections[1] === 1) {
      // Shroud in Shadow (Void theme)
      color = '#9b59b6'; // Dark Purple
      glow = 'rgba(155, 89, 182, 0.4)';
    } else if (selections[0] === 0) {
      color = '#f1c40f'; // Sunlight Warmth
      glow = 'rgba(241, 196, 15, 0.4)';
    } else {
      color = '#1abc9c'; // Aurora Ice
      glow = 'rgba(26, 188, 156, 0.4)';
    }
  }
  
  currentThemeColor = color;
  updateThemeColors(color, glow);
}

function updateThemeColors(color, glow) {
  document.documentElement.style.setProperty('--theme-color', color);
  document.documentElement.style.setProperty('--theme-glow', glow);
}

// The Cinematic Hatching Animation sequence
function triggerHatchingFlow() {
  choicesBox.style.pointerEvents = 'none';
  choicesBox.style.opacity = '0.2';
  buttons.back.style.visibility = 'hidden';
  indicatorsContainer.style.opacity = '0.2';
  
  // 1. Core lights up
  gameEggContainer.classList.add('hatching-core');
  
  setTimeout(() => {
    // 2. Start shaking violently
    gameEggContainer.classList.add('hatch-shake');
    // Rapid wiggles / sound build up
    let rumbleInterval = setInterval(() => {
      sound.playWiggle();
    }, 250);

    setTimeout(() => {
      clearInterval(rumbleInterval);
      
      // Crack explosion sounds right before pop
      sound.playCrack();
      setTimeout(() => {
        sound.playCrack();
      }, 150);

      setTimeout(() => {
        // 3. EXPLOSION FLASH
        const rect = gameEggContainer.getBoundingClientRect();
        const eggX = rect.left + rect.width / 2;
        const eggY = rect.top + rect.height / 2;
        
        sound.playHatch();
        particleEngine.triggerHatch(eggX, eggY, currentThemeColor);
        
        // Hide egg
        gameEggContainer.style.display = 'none';
        
        // Reveal animal
        revealHatchedCreature();
      }, 500);

    }, 1500);

  }, 600);
}

function revealHatchedCreature() {
  const binaryPath = selections.join('');
  const creature = CREATURES[binaryPath];
  
  // Set UI elements
  hatchEl.emoji.textContent = creature.emoji;
  hatchEl.name.textContent = creature.name;
  hatchEl.rarity.textContent = creature.rarity;
  hatchEl.element.textContent = creature.element;
  hatchEl.lore.textContent = creature.desc;
  
  // Set rarity badge style classes using rarityKey
  hatchEl.rarity.className = `badge badge-rarity rarity-${creature.rarityKey}`;
  
  // Set dynamic container borders/shadows matching element color
  document.querySelector('#hatch-screen .hatch-card').style.borderColor = creature.color;
  updateThemeColors(creature.color, creature.glow);

  // Add to Bestiary list and localstorage
  addToBestiary(binaryPath);

  // Swap to Hatch screen
  setTimeout(() => {
    Object.values(screens).forEach(screen => {
      screen.classList.remove('active');
    });
    screens.hatch.classList.add('active');
  }, 400);
}

// Bestiary/Log Management
function loadBestiary() {
  const data = localStorage.getItem('mystic_hatchery_unlocked');
  if (data) {
    try {
      unlockedPaths = JSON.parse(data);
    } catch(e) {
      unlockedPaths = [];
    }
  } else {
    unlockedPaths = [];
  }
  
  updateBestiaryStats();
  renderBestiaryGrid();
}

function saveBestiary() {
  localStorage.setItem('mystic_hatchery_unlocked', JSON.stringify(unlockedPaths));
}

function addToBestiary(path) {
  if (!unlockedPaths.includes(path)) {
    unlockedPaths.push(path);
    saveBestiary();
    updateBestiaryStats();
    renderBestiaryGrid();
  }
}

function updateBestiaryStats() {
  const total = Object.keys(CREATURES).length;
  const count = unlockedPaths.length;
  const statsString = `도감 달성률: ${count}/${total}`;
  
  document.getElementById('bestiary-count-nav').textContent = `${count}/${total}`;
  document.getElementById('bestiary-stats-count').textContent = statsString;
}

function renderBestiaryGrid() {
  const container = document.getElementById('bestiary-grid-container');
  container.innerHTML = '';
  
  // Sort binary paths in numerical order so layout is structured consistently
  const sortedPaths = Object.keys(CREATURES).sort();
  
  sortedPaths.forEach(path => {
    const creature = CREATURES[path];
    const isUnlocked = unlockedPaths.includes(path);
    
    const card = document.createElement('div');
    card.className = `grid-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    
    if (isUnlocked) {
      card.innerHTML = `
        <span class="item-emoji" style="text-shadow: 0 0 10px ${creature.glow};">${creature.emoji}</span>
        <span class="item-name">${creature.name}</span>
      `;
      card.style.borderColor = creature.color;
      card.addEventListener('click', () => openInspector(creature));
    } else {
      card.innerHTML = `
        <span class="item-emoji">❓</span>
        <span class="item-name">???</span>
      `;
    }
    
    container.appendChild(card);
  });
}

function openInspector(creature) {
  sound.playClick();
  
  insEl.emoji.textContent = creature.emoji;
  insEl.name.textContent = creature.name;
  insEl.rarity.textContent = creature.rarity;
  insEl.element.textContent = creature.element;
  insEl.lore.textContent = creature.desc;
  
  // Set rarity badge style classes using rarityKey
  insEl.rarity.className = `badge badge-rarity rarity-${creature.rarityKey}`;
  
  const card = document.querySelector('#inspector-modal .inspector-card');
  card.style.borderColor = creature.color;
  card.classList.add('active');
  
  inspectorModal.classList.add('active');
}

function resetBestiary() {
  sound.playClick();
  const conf = confirm("부화 기록지를 초기화하시겠습니까? 지금까지 발견한 모든 생명체 기록이 사라집니다.");
  if (conf) {
    unlockedPaths = [];
    saveBestiary();
    updateBestiaryStats();
    renderBestiaryGrid();
  }
}

// Sound Management
function toggleMute() {
  const muted = sound.toggleMute();
  syncSoundIcons();
}

function syncSoundIcons() {
  const muted = sound.getMuted();
  const iconOn = document.getElementById('sound-icon-on');
  const iconOff = document.getElementById('sound-icon-off');
  
  if (muted) {
    iconOn.style.display = 'none';
    iconOff.style.display = 'block';
  } else {
    iconOn.style.display = 'block';
    iconOff.style.display = 'none';
  }
}

// Sharing Mechanism
function shareCreature() {
  sound.playClick();
  const binaryPath = selections.join('');
  const creature = CREATURES[binaryPath];
  
  const text = `✨ 미스틱 해처리에서 [${creature.rarity}]인 ${creature.name}(${creature.emoji} / ${creature.element})을 부화시켰습니다! ✨\n여러분도 32가지 신비로운 동물들을 모두 찾아보세요!`;
  
  navigator.clipboard.writeText(text).then(() => {
    const originalText = buttons.share.textContent;
    buttons.share.textContent = "복사 완료!";
    buttons.share.style.borderColor = "var(--accent-teal)";
    setTimeout(() => {
      buttons.share.textContent = originalText;
      buttons.share.style.borderColor = "";
    }, 2000);
  }).catch(() => {
    alert("공유 내용:\n\n" + text);
  });
}
