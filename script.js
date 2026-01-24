const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const highScoreEl = document.getElementById("highScore");
const charSelectUI = document.getElementById("char-select");
const charItems = document.querySelectorAll(".char-item");

const gaugeBar = document.getElementById("gauge-bar");
const gaugeText = document.getElementById("gauge-text");
const ultButton = document.getElementById("ult-button");

canvas.width = 400;
canvas.height = 600;

let lastDisplayedScore = -1;
let lastDisplayedLevel = -1;
let lastDisplayedEnergy = -1;

let score, level, gameActive, isReady, isGameOver, pipes, stars, bird;
let selectedAnimal = "chick";
let charIndex = 0;
let deathTime = 0;
let highScore = localStorage.getItem("pixelDash_highScore") || 0;

let energy = 0;
let ultActive = false;
let ultTimer = 0;
let ultTotalStartTime = 0;
let commonInvincibility = 0;

// 궁극기 사운드 루프용 변수
let ultAudioInterval = null;

highScoreEl.innerText = highScore;
let audioCtx = null;

function resizeCanvas() {
  const windowRatio = window.innerWidth / window.innerHeight;
  const gameRatio = 400 / 600;
  if (windowRatio < gameRatio) {
    canvas.style.width = "100vw";
    canvas.style.height = "auto";
  } else {
    canvas.style.width = "auto";
    canvas.style.height = "100vh";
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function initAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playSound(type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === "jump") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  } else if (type === "hit") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  } else if (type === "star") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      1600,
      audioCtx.currentTime + 0.1,
    );
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  } else if (type === "gem") {
    // 파란 별 전용 사운드
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      2400,
      audioCtx.currentTime + 0.15,
    );
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  } else if (type === "ult_loop") {
    // 궁극기 사용 중 배경음
    osc.type = "square";

    // 주파수를 아주 넓은 범위에서 무작위로 설정 (요란함의 핵심)
    const randomFreq = 400 + Math.random() * 1200;
    osc.frequency.setValueAtTime(randomFreq, audioCtx.currentTime);

    // 소리가 아주 빠르게 위아래로 요동치게 함
    osc.frequency.exponentialRampToValueAtTime(
      randomFreq / 2,
      audioCtx.currentTime + 0.04,
    );

    gain.gain.setValueAtTime(0.07, audioCtx.currentTime); // 볼륨은 적당히 조절
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
  }

  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

// 궁극기 사운드 루프 시작
function startUltSound() {
  if (ultAudioInterval) clearInterval(ultAudioInterval);
  // 0.15초 -> 0.05초로 변경 (초당 20번의 사운드 발생)
  ultAudioInterval = setInterval(() => {
    if (ultActive) playSound("ult_loop");
    else stopUltSound();
  }, 50);
}

// 궁극기 사운드 루프 정지
function stopUltSound() {
  if (ultAudioInterval) {
    clearInterval(ultAudioInterval);
    ultAudioInterval = null;
  }
}

function drawBird() {
  const { x, y, width: w, height: h, animal, velocity } = bird;
  let rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 8, velocity * 0.1));

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);

  const blink = Math.floor(Date.now() / 150) % 2 === 0;

  // 빨간색 무적 효과 로직 수정
  // 1. 일반적인 피격 후 무적(commonInvincibility) 상태이거나
  // 2. 병아리(chick)가 궁극기(ultActive)를 사용 중일 때 빨간색 아우라 표시
  const showRedAura =
    commonInvincibility > 0 || (ultActive && animal === "chick");

  if (showRedAura) {
    ctx.save();
    ctx.beginPath();
    const auraColor = "rgba(255, 50, 50, 0.5)";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "red";
    ctx.fillStyle = auraColor;
    if (blink) {
      ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 캐릭터 본체의 깜빡임 (투명도 조절)
  // 모든 무적 상태(공통 무적 또는 궁극기 활성화)에서 깜빡임 유지
  // if ((commonInvincibility > 0 || ultActive) && !blink) {
  // ctx.globalAlpha = 0.4;
  // }

  ctx.scale(-1, 1);
  ctx.font = `${w}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const animals = { chick: "🐤", penguin: "🐧", bird: "🕊️", dog: "🐕" };
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.strokeText(animals[animal], 0, 0);
  ctx.fillText(animals[animal], 0, 0);
  ctx.restore();
}

function drawStars() {
  ctx.save();
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  stars.forEach((s) => {
    const emoji = s.type === "blue" ? "💎" : "⭐";
    ctx.fillText(emoji, Math.round(s.x), Math.round(s.y));
  });
  ctx.restore();
}

function updateLogic() {
  if (isGameOver) return;
  if (commonInvincibility > 0) commonInvincibility--;

  let speedMultiplier = 1;
  let dashEffect = 0;

  // 궁극기 활성화 로직
  if (ultActive) {
    ultTimer--;

    if (bird.animal === "bird") {
      const dashDuration = 30;
      const elapsed = ultTotalStartTime - ultTimer;
      if (elapsed < dashDuration) {
        dashEffect = 15;
        bird.velocity = 0;
      } else if (elapsed === dashDuration) {
        commonInvincibility = 120;
      }
    }

    if (bird.animal === "dog") {
      const animDuration = 120; // 애니메이션 지속 시간 (프레임 수)
      const originalSize = 45;
      const targetSize = originalSize / 2;
      const elapsed = ultTotalStartTime - ultTimer;
      if (elapsed < animDuration) {
        const ratio = elapsed / animDuration;
        bird.width = originalSize - (originalSize - targetSize) * ratio;
        bird.height = originalSize - (originalSize - targetSize) * ratio;
      } else if (ultTimer < animDuration) {
        const ratio = (animDuration - ultTimer) / animDuration;
        bird.width = targetSize + (originalSize - targetSize) * ratio;
        bird.height = targetSize + (originalSize - targetSize) * ratio;
      } else {
        bird.width = targetSize;
        bird.height = targetSize;
      }
    }

    if (bird.animal === "penguin") speedMultiplier = 0.7;
    if (ultTimer <= 0) {
      ultActive = false;
      stopUltSound(); // 사운드 중지
      bird.width = 45;
      bird.height = 45;
    }
  }

  bird.velocity += bird.gravity;
  bird.y += bird.velocity;

  const isInvincible =
    (ultActive && (bird.animal === "chick" || bird.animal === "bird")) ||
    commonInvincibility > 0;
  if (!isInvincible) {
    if (bird.y + bird.height > canvas.height || bird.y < 0) return gameOver();
  } else {
    if (bird.y < 0) bird.y = 0;
    if (bird.y + bird.height > canvas.height)
      bird.y = canvas.height - bird.height;
  }

  const speed = (3 + level * 0.5) * speedMultiplier + dashEffect;
  const horizontalDist = Math.max(260, 500 - (level - 1) * 40);

  if (
    pipes.length === 0 ||
    pipes[pipes.length - 1].x < canvas.width - horizontalDist
  ) {
    const gap = Math.max(120, 180 - level * 10);
    const h = Math.random() * (canvas.height - gap - 150) + 75;
    pipes.push({
      x: canvas.width,
      top: h,
      bottom: canvas.height - h - gap,
      width: 65,
      passed: false,
    });
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= speed;
    if (
      !isInvincible &&
      bird.x < p.x + p.width &&
      bird.x + bird.width > p.x &&
      (bird.y < p.top || bird.y + bird.height > canvas.height - p.bottom)
    )
      return gameOver();

    if (!p.passed && bird.x > p.x + p.width) {
      score++;
      level = Math.floor(score / 10) + 1;
      p.passed = true;
      updateUI();
    }
    if (p.x + p.width < -100) pipes.splice(i, 1);
  }

  let starProb = 0.015; // 별이 나올 기본 확률
  if (ultActive && bird.animal === "dog") starProb *= 1.5;
  if (Math.random() < starProb && stars.length < 5) {
    const type = Math.random() < 0.1 ? "blue" : "yellow";
    stars.push({
      x: canvas.width + 50,
      y: 150 + Math.random() * 300,
      type: type,
    });
  }

  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    s.x -= speed;
    let dx = bird.x + bird.width / 2 - s.x;
    let dy = bird.y + bird.height / 2 - s.y;
    if (Math.sqrt(dx * dx + dy * dy) < bird.width) {
      // 보석(blue)과 별(yellow) 사운드 구분
      playSound(s.type === "blue" ? "gem" : "star");
      const gain = s.type === "blue" ? 20 : 10;
      energy = Math.min(100, energy + gain);
      stars.splice(i, 1);
      updateUI();
    } else if (s.x < -50) stars.splice(i, 1);
  }
}

function updateUI() {
  if (lastDisplayedScore !== score) {
    scoreEl.textContent = score;
    lastDisplayedScore = score;
  }
  if (lastDisplayedLevel !== level) {
    levelEl.textContent = level;
    lastDisplayedLevel = level;
  }
  if (lastDisplayedEnergy !== energy) {
    gaugeBar.style.width = energy + "%";
    gaugeText.textContent = energy >= 100 ? "MAX" : energy + "%";

    if (energy >= 100) {
      gaugeBar.classList.add("full");
      ultButton.classList.add("ready", "ult-ready-animation");
    } else {
      gaugeBar.classList.remove("full");
      ultButton.classList.remove("ready", "ult-ready-animation");
    }
    lastDisplayedEnergy = energy;
  }
}

function useUltimate() {
  if (energy < 100 || ultActive || isGameOver || !gameActive) return;
  energy = 0;
  updateUI();
  ultActive = true;
  startUltSound(); // 힘찬 배경 사운드 시작

  if (bird.animal === "bird") {
    ultTimer = 30;
  } else {
    ultTimer =
      bird.animal === "chick" ? 300 : bird.animal === "penguin" ? 420 : 600;
  }
  ultTotalStartTime = ultTimer;
}

function drawBackground() {
  ctx.save();

  // --- 배경색 결정 (깜빡임 로직) ---
  if (ultActive) {
    // 궁극기 사용 중: 요란한 사운드에 맞춰 배경도 무작위 색상으로 깜빡임
    const hue = Math.floor(Math.random() * 360);
    // 밝고 강렬한 색상으로 설정 (채도 80%, 밝기 60%)
    ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
  } else {
    // 일반 상태: 평온한 하늘색
    ctx.fillStyle = "#ade1e5";
  }

  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 빌딩 그리기
  bgAssets.buildings.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, canvas.height - b.h, b.w, b.h);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 10; i < b.w - 10; i += 20)
      for (let j = 10; j < b.h - 10; j += 30)
        ctx.fillRect(b.x + i, canvas.height - b.h + j, 8, 12);
  });

  // 구름 그리기
  bgAssets.clouds.forEach((c) => {
    const x = c[0],
      y = c[1];
    // 배경이 깜빡일 때 구름이 더 잘 보이도록 투명도 조절
    ctx.fillStyle = ultActive
      ? "rgba(255, 255, 255, 0.8)"
      : "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 15, y - 10, 18, 0, Math.PI * 2);
    ctx.arc(x + 35, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 20, y + 10, 15, 0, Math.PI * 2);
    ctx.arc(x + 5, y + 10, 15, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  if (gameActive || isGameOver) {
    pipes.forEach(drawPipe);
    updateLogic();
    drawStars();
  }
  if (bird) drawBird();
  const now = Date.now();
  if (isReady && !gameActive && !isGameOver) drawArrowUI("TAP TO START", "☝️");
  else if (isGameOver && now - deathTime > 2000)
    drawArrowUI("TAP TO RETRY", "🔄", true);
  requestAnimationFrame(draw);
}

function initGame() {
  score = 0;
  level = 1;
  energy = 0;
  lastDisplayedScore = -1;
  lastDisplayedLevel = -1;
  lastDisplayedEnergy = -1;
  gameActive = false;
  isGameOver = false;
  ultActive = false;
  commonInvincibility = 0;
  stopUltSound(); // 게임 시작 시 혹시 모를 사운드 정지
  pipes = [];
  stars = [];
  bird = {
    x: 80,
    y: 300,
    width: 45,
    height: 45,
    gravity: 0.5,
    velocity: 0,
    jump: -8,
    animal: selectedAnimal,
  };
  updateUI();
  ultButton.style.display = "flex";
}

function gameOver() {
  if (isGameOver) return;
  isGameOver = true;
  gameActive = false;
  deathTime = Date.now();
  stopUltSound(); // 게임 오버 시 사운드 정지
  playSound("hit");
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("pixelDash_highScore", highScore);
    highScoreEl.innerText = highScore;
  }
}

const handleAction = (e) => {
  if (e.type === "keydown" && e.code !== "Space") return;
  if (e.target === ultButton) return;
  if (e.cancelable) e.preventDefault();
  initAudio();
  if (isGameOver && Date.now() - deathTime > 2000) {
    initGame();
    isReady = true;
    return;
  }
  if (isReady && !gameActive) {
    gameActive = true;
    bird.velocity = bird.jump;
    playSound("jump");
  } else if (gameActive) {
    bird.velocity = bird.jump;
    playSound("jump");
  }
};

window.addEventListener("keydown", (e) => {
  if (!charSelectUI.classList.contains("hidden")) {
    if (e.key === "ArrowRight") updateCharSelection((charIndex + 1) % 4);
    if (e.key === "ArrowLeft") updateCharSelection((charIndex + 3) % 4);
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
      updateCharSelection((charIndex + 2) % 4);
    if (e.key === "Enter" || e.code === "Space") startGameFlow();
    return;
  }
  if (e.code === "Space") handleAction(e);
});

charItems.forEach((item) => {
  item.addEventListener("pointerdown", (e) => {
    updateCharSelection(parseInt(item.getAttribute("data-index")));
  });
});

canvas.addEventListener("pointerdown", handleAction, { passive: false });
ultButton.addEventListener(
  "pointerdown",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    initAudio();
    useUltimate();
  },
  { passive: false },
);

function updateCharSelection(index) {
  charIndex = index;
  charItems.forEach((item, i) => {
    item.classList.toggle("selected", i === charIndex);
    if (i === charIndex) selectedAnimal = item.dataset.animal;
  });
}

function startGameFlow() {
  initAudio();
  charSelectUI.classList.add("hidden");
  isReady = true;
  initGame();
  requestAnimationFrame(draw);
}

document.getElementById("confirmBtn").addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  startGameFlow();
});

const bgAssets = {
  clouds: [
    [70, 100],
    [220, 70],
    [350, 140],
    [130, 200],
  ],
  buildings: [
    { x: 0, w: 80, h: 150, color: "#95c6cc" },
    { x: 100, w: 60, h: 100, color: "#a5d6dc" },
    { x: 200, w: 100, h: 180, color: "#95c6cc" },
    { x: 320, w: 80, h: 120, color: "#a5d6dc" },
  ],
};

function drawPipe(p) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  const renderSingle = (x, y, w, h, isTop) => {
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(x + 5, y, 6, h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(x + w - 12, y, 8, h);
    const headX = x - 3,
      headY = isTop ? y + h - 35 : y,
      headW = w + 6;
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(headX, headY, headW, 35);
    ctx.strokeRect(headX, headY, headW, 35);
  };
  renderSingle(p.x, 0, p.width, p.top, true);
  renderSingle(p.x, canvas.height - p.bottom, p.width, p.bottom, false);
  ctx.restore();
}

function drawArrowUI(text, emoji, showGameOver = false) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "bold 20px Arial";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 70);
  ctx.font = "50px Arial";
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 + 20);
  if (showGameOver) {
    ctx.font = "bold 40px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 80);
  }
  ctx.restore();
}
drawBackground();
