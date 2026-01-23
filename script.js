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

let score, level, gameActive, isReady, isGameOver, pipes, stars, bird;
let selectedAnimal = "chick";
let charIndex = 0;
let deathTime = 0;
let highScore = localStorage.getItem("pixelDash_highScore") || 0;

// 궁극기 시스템 변수
let energy = 0;
let ultActive = false;
let ultTimer = 0;
let ultTotalStartTime = 0;
let commonInvincibility = 0;

highScoreEl.innerText = highScore;

let audioCtx = null;

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
  }
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

function drawBird() {
  const { x, y, width: w, height: h, animal, velocity } = bird;
  let rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 8, velocity * 0.1));

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.scale(-1, 1);

  if (ultActive || commonInvincibility > 0) {
    const blink = Math.floor(Date.now() / 100) % 2 === 0;
    if (blink) {
      ctx.filter = "brightness(2) saturate(2) drop-shadow(0 0 10px gold)";
    } else {
      ctx.filter = "brightness(1.2) drop-shadow(0 0 5px white)";
    }
  }

  ctx.font = `${w}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const animals = { chick: "🐤", penguin: "🐧", bird: "🕊️", dog: "🐕" };
  ctx.fillText(animals[animal], 0, 0);
  ctx.restore();
}

function updateLogic() {
  if (isGameOver) return;

  if (commonInvincibility > 0) commonInvincibility--;

  let speedMultiplier = 1;
  const START_TRANSITION = 60;
  const END_TRANSITION = 120;

  if (ultActive) {
    ultTimer--;
    const elapsed = ultTotalStartTime - ultTimer;

    if (bird.animal === "penguin") {
      if (elapsed < START_TRANSITION) {
        let progress = elapsed / START_TRANSITION;
        speedMultiplier = 1.0 - 0.5 * progress;
      } else if (ultTimer < END_TRANSITION) {
        let progress = 1 - ultTimer / END_TRANSITION;
        speedMultiplier = 0.5 + 0.5 * progress;
      } else {
        speedMultiplier = 0.5;
      }
    }

    if (bird.animal === "dog") {
      if (elapsed < START_TRANSITION) {
        let progress = elapsed / START_TRANSITION;
        let newSize = 45 - 23 * progress;
        bird.width = newSize;
        bird.height = newSize;
      } else if (ultTimer < END_TRANSITION) {
        let progress = 1 - ultTimer / END_TRANSITION;
        let newSize = 22 + 23 * progress;
        bird.width = newSize;
        bird.height = newSize;
      } else {
        bird.width = 22;
        bird.height = 22;
      }
    }

    if (ultTimer <= 0) {
      ultActive = false;
      if (bird.animal === "dog") {
        bird.width = 45;
        bird.height = 45;
      }
    }
  }

  bird.velocity += bird.gravity;
  bird.y += bird.velocity;

  const isInvincible =
    (ultActive && bird.animal === "chick") || commonInvincibility > 0;

  if (!isInvincible) {
    if (bird.y + bird.height > canvas.height || bird.y < 0) return gameOver();
  } else {
    if (bird.y < 0) bird.y = 0;
    if (bird.y + bird.height > canvas.height)
      bird.y = canvas.height - bird.height;
  }

  const speed = (3 + level * 0.5) * speedMultiplier;

  // 가로 간격 완화 로직 수정
  const baseHorizontalDist = 375; // 시작 간격
  // 감소폭을 2.5에서 1.2로 줄여 훨씬 천천히 좁아지게 함, 최소 간격은 260px로 설정
  const horizontalDist = Math.max(260, baseHorizontalDist - score * 1.2);

  if (
    pipes.length === 0 ||
    pipes[pipes.length - 1].x < canvas.width - horizontalDist
  ) {
    let gapMultiplier = ultActive && bird.animal === "bird" ? 1.5 : 1;
    const gap = Math.max(100, (180 - level * 10) * gapMultiplier);
    const h = Math.random() * (canvas.height - gap - 150) + 75;
    pipes.push({
      x: canvas.width,
      top: h,
      bottom: canvas.height - h - gap,
      width: 60,
      passed: false,
    });
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    pipes[i].x -= speed;
    if (!isInvincible) {
      if (
        bird.x < pipes[i].x + pipes[i].width &&
        bird.x + bird.width > pipes[i].x &&
        (bird.y < pipes[i].top ||
          bird.y + bird.height > canvas.height - pipes[i].bottom)
      )
        return gameOver();
    }
    if (!pipes[i].passed && bird.x > pipes[i].x + pipes[i].width) {
      score++;
      scoreEl.innerText = score;
      pipes[i].passed = true;
      if (score > 0 && score % 10 === 0) {
        level++;
        levelEl.innerText = level;
      }
    }
    if (pipes[i].x + pipes[i].width < -20) pipes.splice(i, 1);
  }

  let starProb =
    ultActive && (bird.animal === "bird" || bird.animal === "dog")
      ? 0.023
      : 0.015;
  if (Math.random() < starProb && stars.length < 4) {
    let starX = canvas.width + 50;
    let overlap = pipes.some((p) => starX > p.x - 30 && starX < p.x + 90);
    if (!overlap) stars.push({ x: starX, y: 150 + Math.random() * 300 });
  }

  for (let i = stars.length - 1; i >= 0; i--) {
    stars[i].x -= speed;
    ctx.font = "30px Arial";
    ctx.fillText("⭐", stars[i].x - 15, stars[i].y + 10);
    let dist = Math.sqrt(
      Math.pow(bird.x + bird.width / 2 - stars[i].x, 2) +
        Math.pow(bird.y + bird.height / 2 - stars[i].y, 2),
    );
    if (dist < bird.width + 15) {
      playSound("star");
      stars.splice(i, 1);
      score += 2;
      scoreEl.innerText = score;
      if (!ultActive) {
        energy = Math.min(100, energy + 10);
        updateEnergyUI();
      }
    } else if (stars[i].x < -50) stars.splice(i, 1);
  }
}

function updateEnergyUI() {
  gaugeBar.style.width = energy + "%";
  if (energy >= 100) {
    gaugeText.innerText = "MAX";
    ultButton.classList.add("ready", "ult-ready-animation");
    gaugeBar.classList.add("ult-ready-animation");
  } else {
    gaugeText.innerText = energy + "%";
    ultButton.classList.remove("ready", "ult-ready-animation");
    gaugeBar.classList.remove("ult-ready-animation");
  }
}

function useUltimate() {
  if (energy < 100 || ultActive || isGameOver || !gameActive) return;
  energy = 0;
  updateEnergyUI();
  ultActive = true;
  commonInvincibility = 60;
  if (bird.animal === "chick") ultTimer = 5 * 60;
  else if (bird.animal === "penguin") ultTimer = 7 * 60;
  else if (bird.animal === "bird") ultTimer = 10 * 60;
  else if (bird.animal === "dog") ultTimer = 10 * 60;
  ultTotalStartTime = ultTimer;
}

function drawBackground() {
  ctx.fillStyle = "#ade1e5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  bgAssets.buildings.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, canvas.height - b.h, b.w, b.h);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = 10; i < b.w - 10; i += 20)
      for (let j = 10; j < b.h - 10; j += 30)
        ctx.fillRect(b.x + i, canvas.height - b.h + j, 8, 12);
  });
  ctx.fillStyle = "white";
  bgAssets.clouds.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c[0], c[1], 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c[0] + 20, c[1], 20, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawArrowUI(text, emoji, showGameOver = false) {
  const tx = canvas.width / 2;
  const ty = canvas.height / 2 + 20;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e67e22";
  ctx.beginPath();
  ctx.roundRect(tx - 90, ty, 180, 60, 10);
  ctx.moveTo(tx - 20, ty);
  ctx.lineTo(tx, ty - 25);
  ctx.lineTo(tx + 20, ty);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(text, tx, ty + 38);
  ctx.font = "40px Arial";
  ctx.fillText(emoji, tx, ty - 40);
  if (showGameOver) {
    ctx.font = "bold 40px Arial";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillText("GAME OVER", tx, ty - 120);
    ctx.font = "bold 20px Arial";
    ctx.fillText(`SCORE: ${score}`, tx, ty - 80);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  if (gameActive || isGameOver) {
    pipes.forEach(drawPipe);
    updateLogic();
  }
  if (bird) drawBird();
  const now = Date.now();
  if (isReady && !gameActive && !isGameOver) drawArrowUI("TAP TO START", "☝️");
  else if (isGameOver)
    if (now - deathTime > 2000) drawArrowUI("TAP TO RETRY", "🔄", true);
  requestAnimationFrame(draw);
}

function initGame() {
  score = 0;
  level = 1;
  energy = 0;
  commonInvincibility = 0;
  gameActive = false;
  isGameOver = false;
  ultActive = false;
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
  scoreEl.innerText = score;
  levelEl.innerText = level;
  updateEnergyUI();
  ultButton.style.display = "flex";
}

function gameOver() {
  if (isGameOver) return;
  isGameOver = true;
  gameActive = false;
  deathTime = Date.now();
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
  const now = Date.now();
  if (isGameOver) {
    if (now - deathTime > 2000) {
      initGame();
      isReady = true;
    }
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
    if (e.key === "Enter" || e.code === "Space") startGameFlow();
    return;
  }
  if (e.code === "Space") handleAction(e);
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

charItems.forEach((item, i) =>
  item.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    updateCharSelection(i);
  }),
);

document.getElementById("confirmBtn").addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  startGameFlow();
});

const bgAssets = {
  clouds: [
    [50, 80],
    [200, 50],
    [320, 100],
    [120, 150],
  ],
  buildings: [
    { x: 0, w: 80, h: 150, color: "#95c6cc" },
    { x: 100, w: 60, h: 100, color: "#a5d6dc" },
    { x: 200, w: 100, h: 180, color: "#95c6cc" },
    { x: 320, w: 80, h: 120, color: "#a5d6dc" },
  ],
};

function drawPipe(pipe) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000";
  const drawSinglePipe = (x, y, w, h, isTop) => {
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    const headH = 30;
    const headW = w + 10;
    const headX = x - 5;
    const headY = isTop ? y + h - headH : y;
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(headX, headY, headW, headH);
    ctx.strokeRect(headX, headY, headW, headH);
  };
  drawSinglePipe(pipe.x, 0, pipe.width, pipe.top, true);
  drawSinglePipe(
    pipe.x,
    canvas.height - pipe.bottom,
    pipe.width,
    pipe.bottom,
    false,
  );
}

drawBackground();
