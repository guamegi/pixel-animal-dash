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

const introScreen = document.getElementById("intro-screen");
const tutorialModal = document.getElementById("tutorial-modal");
const closeTutorialBtn = document.getElementById("closeTutorialBtn");
const skillActor = document.getElementById("skill-actor");
const skillDesc = document.getElementById("skill-simple-desc");

canvas.width = 400;
canvas.height = 600;

let lastDisplayedScore = -1;
let lastDisplayedLevel = -1;
let lastDisplayedEnergy = -1;

let score, level, gameActive, isReady, isGameOver, pipes, stars, bird;
let selectedAnimal = "chick";
let charIndex = 0;
let deathTime = 0;
let highScore = localStorage.getItem("animalDash_highScore") || 0;

let energy = 0;
let ultActive = false;
let ultTimer = 0;
let ultTotalStartTime = 0;
let commonInvincibility = 0;

// 스킬 사운드 루프용 변수
let ultAudioInterval = null;

highScoreEl.innerText = highScore;
let audioCtx = null;

// 캐릭터 정보 데이터
const charData = {
  chick: {
    name: "무적 방어",
    desc: "5초간 모든 장애물을 무시하는 무적 보호막 생성!",
    visual: "🛡️",
    class: "v-invincible",
  },
  penguin: {
    name: "얼음 땡",
    desc: "화면의 모든 장애물을 즉시 제거합니다.",
    visual: "❄️",
    class: "v-clear",
  },
  bird: {
    name: "공중 부양",
    desc: "하늘을 날 수 있어 장애물을 쉽게 피합니다.",
    visual: "☁️",
    class: "v-fly",
  },
  bee: {
    name: "소형화",
    desc: "몸집이 작아져 좁은 틈도 통과할 수 있습니다.",
    visual: "✨",
    class: "v-small",
  },
  // 신규 캐릭터 1: 토끼
  rabbit: {
    name: "황금 자석",
    desc: "2초 무적 및 주변의 모든 별과 보석을 자석처럼 끌어당깁니다.",
    visual: "🧲",
    class: "v-magnet",
  },
  // 신규 캐릭터 2: 말
  horse: {
    name: "물방울 보호막",
    desc: "10초 유지되는 보호막 생성! 장애물에 닿으면 1회 방어 후 소멸.",
    visual: "🫧",
    class: "v-bubble",
  },
};

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
    // 스킬 사용 중 배경음
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

// 스킬 사운드 루프 시작
function startUltSound() {
  if (ultAudioInterval) clearInterval(ultAudioInterval);
  // 0.15초 -> 0.05초로 변경 (초당 20번의 사운드 발생)
  ultAudioInterval = setInterval(() => {
    if (ultActive) playSound("ult_loop");
    else stopUltSound();
  }, 50);
}

// 스킬 사운드 루프 정지
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

  // 1. 게이지가 MAX(100)일 때 캐릭터 황금색 깜빡임 효과 (추가)
  if (energy >= 100 && !ultActive) {
    ctx.save();
    ctx.beginPath();
    // 황금색 아우라 효과
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#f1c40f";
    ctx.fillStyle = "rgba(241, 196, 15, 0.4)";
    if (blink) {
      ctx.arc(0, 0, w * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. 무적 상태(피격 후 또는 병아리 스킬) 빨간색 아우라
  const showRedAura =
    commonInvincibility > 0 || (ultActive && animal === "chick");
  if (showRedAura) {
    ctx.save();
    ctx.beginPath();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "red";
    ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    if (blink) {
      ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. 캐릭터 본체 렌더링
  if ((commonInvincibility > 0 || ultActive) && !blink) {
    ctx.globalAlpha = 0.4;
  }

  ctx.scale(-1, 1);
  ctx.font = `${w}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const animals = {
    chick: "🐤",
    penguin: "🐧",
    bird: "🕊️",
    bee: "🐝",
    rabbit: "🐇",
    horse: "🐴",
  };

  // 게이지가 찼을 때 캐릭터 텍스트에도 약간의 광택 효과 추가
  if (energy >= 100 && !ultActive && blink) {
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 3;
    ctx.strokeText(animals[animal], 0, 0);
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeText(animals[animal], 0, 0);
  }

  if (ultActive && animal === "horse") {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(100, 200, 255, 0.8)";
    ctx.lineWidth = 4;
    ctx.arc(0, 0, w * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(100, 200, 255, 0.2)";
    ctx.fill();
    ctx.restore();
  }

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

  // 스킬 활성화 로직
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

    if (bird.animal === "bee") {
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

    if (bird.animal === "rabbit") {
      commonInvincibility = 2; // 스킬 지속 시간 동안 무적 유지

      stars.forEach((s) => {
        // 캐릭터와 별 사이의 거리 계산
        const dx = bird.x + bird.width / 2 - s.x;
        const dy = bird.y + bird.height / 2 - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 자석 범위 내에 있으면 끌어당김 (강도 조절 가능)
        if (dist < 300) {
          s.x += dx * 0.12;
          s.y += dy * 0.12;
        }
      });
    }

    if (ultTimer <= 0) {
      ultActive = false;
      stopUltSound(); // 사운드 중지
      bird.width = 45;
      bird.height = 45;
      // 말의 보호막이 시간이 다 되어 사라지는 경우 처리
      if (bird.animal === "horse") bird.hasBubble = false;
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

  const baseSpeed = 3;
  const speedIncrease = 0.15; // 레벨당 속도 증가량
  const speed =
    (baseSpeed + level * speedIncrease) * speedMultiplier + dashEffect;
  const gapDecrease = 20; // 레벨당 파이프 간격 감소량(가로)
  const horizontalDist = Math.max(260, 500 - (level - 1) * gapDecrease);

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

    const isInvincible =
      (ultActive &&
        (bird.animal === "chick" ||
          bird.animal === "bird" ||
          bird.animal === "rabbit")) ||
      commonInvincibility > 0;

    if (
      !isInvincible &&
      bird.x < p.x + p.width &&
      bird.x + bird.width > p.x &&
      (bird.y < p.top || bird.y + bird.height > canvas.height - p.bottom)
    ) {
      // 말(horse) 스킬: 물방울 보호막이 있는 경우
      if (bird.animal === "horse" && ultActive) {
        ultActive = false; // 보호막 소멸
        stopUltSound();
        commonInvincibility = 60; // 충돌 직후 짧은 무적 시간 부여 (중복 충돌 방지)
        playSound("hit"); // 혹은 보호막 깨지는 소리
        continue; // 게임오버 건너뛰고 파이프 통과
      }
      return gameOver();
    }

    if (!p.passed && bird.x > p.x + p.width) {
      score++;
      level = Math.floor(score / 10) + 1;
      p.passed = true;
      updateUI();
    }
    if (p.x + p.width < -100) pipes.splice(i, 1);
  }

  let starProb = 0.015; // 별이 나올 기본 확률
  if (ultActive && bird.animal === "bee") starProb *= 1.5;
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
  } else if (bird.animal === "rabbit") {
    ultTimer = 120; // 토끼 자석은 2초 (60fps 기준)
  } else if (bird.animal === "horse") {
    ultTimer = 600; // 말 보호막은 10초
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
    // 스킬 사용 중: 요란한 사운드에 맞춰 배경도 무작위 색상으로 깜빡임
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
  if (isReady && !gameActive && !isGameOver) drawArrowUI("TAP TO START", "👇");
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
    localStorage.setItem("animalDash_highScore", highScore);
    highScoreEl.innerText = highScore;
  }
}

const handleAction = (e) => {
  // UI가 하나라도 열려 있다면 게임 조작(점프) 로직을 실행하지 않고 리턴합니다.
  if (
    !charSelectUI.classList.contains("hidden") ||
    !tutorialModal.classList.contains("hidden") ||
    !introScreen.classList.contains("hidden")
  ) {
    return;
  }

  // 키보드 입력인데 Space가 아니면 무시
  if (e.type === "keydown") {
    if (e.code !== "Space") return; // 점프는 Space로만
  }
  // 스킬 버튼 클릭 시 점프 방지
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

// 기존에 흩어져 있던 리스너들을 정리하고 하나로 통합합니다.
window.addEventListener("keydown", handleAction); // 게임 플레이 점프용

charItems.forEach((item) => {
  item.addEventListener("pointerdown", () => {
    const idx = parseInt(item.getAttribute("data-index"));
    updateCharSelection(idx);
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

function updateUltInfo(animal) {
  const data = charData[animal];
  document.getElementById("ult-name").textContent = "스킬 효과";
  document.getElementById("ult-desc").textContent = data.desc;
  const visualEl = document.getElementById("ult-visual");
  visualEl.textContent = data.visual;
  visualEl.className = "ult-visual-anim " + data.class;
}

function startGameFlow() {
  initAudio();
  charSelectUI.classList.add("hidden");
  isReady = true;
  initGame();
  requestAnimationFrame(draw);
}

// 모바일 접속 여부 확인 및 텍스트 변경 로직
function updateControlHeuristic() {
  const howToControlEl = document.getElementById("howToControl");
  if (!howToControlEl) return;

  // 터치 가능한 기기(모바일/태블릿)인지 확인
  const isMobile =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    navigator.maxTouchPoints > 0;

  if (isMobile) {
    // 모바일용 설명으로 교체
    howToControlEl.innerHTML =
      "점프: 화면 탭 &nbsp;&nbsp;|&nbsp;&nbsp; 스킬: [P] 버튼";
  } else {
    // PC용 설명 (기본값 유지 또는 재설정)
    howToControlEl.innerHTML =
      "점프: 스페이스바 &nbsp;&nbsp;|&nbsp;&nbsp; 스킬: P";
  }
}

// 페이지 로드 시 및 캐릭터 선택창이 뜰 때 실행
window.addEventListener("load", updateControlHeuristic);

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

  // 중앙 정렬 및 선 스타일 공통 설정
  ctx.textAlign = "center";
  ctx.strokeStyle = "black"; // 테두리 색상: 검정
  ctx.lineWidth = 4; // 테두리 두께 (조절 가능)

  // 1. 하단 보조 텍스트 (TAP TO START 등)
  ctx.fillStyle = "rgb(255, 230, 1)";
  ctx.font = "bold 24px Arial";
  // 테두리를 먼저 그려야 글자 내부색이 테두리에 덮이지 않습니다.
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 70);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 70);

  // 2. 중앙 이모지
  ctx.font = "40px Arial";
  ctx.strokeText(emoji, canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 + 20);

  // 3. 게임 오버 텍스트
  if (showGameOver) {
    ctx.fillStyle = "white";
    ctx.font = "bold 48px Arial";
    ctx.lineWidth = 6; // 메인 제목이므로 테두리를 조금 더 두껍게 설정
    ctx.strokeText("GAME OVER", canvas.width / 2, canvas.height / 2 - 80);
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 80);
  }

  ctx.restore();
}

// 실제 뷰포트 높이를 계산하여 설정하는 함수
function setScreenSize() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}

// 화면 크기가 변할 때마다 재계산
window.addEventListener("resize", setScreenSize);

// 사용자가 다른 앱을 쓰다가 돌아왔을 때(포커스 복귀) 화면을 다시 맞춤
window.addEventListener("pageshow", (event) => {
  setScreenSize();
  // 약간의 지연을 주어 브라우저 UI가 완전히 자리를 잡은 후 다시 계산 (사파리 특유의 버그 대응)
  setTimeout(setScreenSize, 100);
});

// 2. 튜토리얼 모달 닫기 -> 캐릭터 선택 화면
closeTutorialBtn.addEventListener("click", () => {
  tutorialModal.classList.add("hidden");
  charSelectUI.classList.remove("hidden");
});

// 3. 캐릭터별 스킬 미리보기 업데이트
function updateCharSelection(index) {
  const items = document.querySelectorAll(".char-item");
  if (index < 0 || index >= items.length) return;

  charIndex = index; // 인덱스 전역 변수 동기화
  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add("selected");
      selectedAnimal = item.getAttribute("data-animal");
      updateSkillPreview(selectedAnimal);
    } else {
      item.classList.remove("selected");
    }
  });
}

// [기능 1] 인트로에서 아무 키나 누르면 모달로 전환
function handleIntroInput() {
  if (!introScreen.classList.contains("hidden")) {
    introScreen.classList.add("hidden"); // 인트로 숨기기
    tutorialModal.classList.remove("hidden"); // 조작법 모달 보이기

    // 이벤트 중복 방지를 위해 인트로 핸들러 제거
    // window.removeEventListener("keydown", handleIntroInput);
    // window.removeEventListener("pointerdown", handleIntroInput);
  }
}

// 로딩 시스템(Loading... -> 인트로 화면)
document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");
  const introScreen = document.getElementById("intro-screen");

  // 1. 페이지 로드 후 2초 대기
  setTimeout(() => {
    // 2. 로딩 화면 숨기기
    loadingScreen.classList.add("hidden");

    // 3. 인트로 화면 나타내기
    introScreen.classList.remove("hidden");

    // 4. 인트로 화면이 나타난 후에만 키 입력/클릭 리스너 작동
    window.addEventListener("keydown", handleIntroInput);
    window.addEventListener("pointerdown", handleIntroInput);
  }, 2000);
});

// [기능 2] 조작법 모달 닫기 로직 (Space, Enter 대응)
function closeTutorial() {
  if (!tutorialModal.classList.contains("hidden")) {
    tutorialModal.classList.add("hidden");
    charSelectUI.classList.remove("hidden");

    // 캐릭터 선택창 진입 시 첫 번째 캐릭터 스킬 즉시 실행
    updateSkillPreview("chick");
  }
}

// [통합] 캐릭터 선택 및 게임 시작 키보드 핸들러
// 파일 하단의 기존 keydown 리스너들을 모두 지우고 이 코드를 넣으세요.
window.addEventListener("keydown", (e) => {
  // 1. 인트로 화면 처리
  if (!introScreen.classList.contains("hidden")) {
    handleIntroInput();
    return;
  }

  // 2. 튜토리얼 모달 처리
  if (!tutorialModal.classList.contains("hidden")) {
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      closeTutorial();
    }
    return;
  }

  // 3. 캐릭터 선택 화면 처리
  if (!charSelectUI.classList.contains("hidden")) {
    const totalChars = Object.keys(charData).length;
    const cols = 3;

    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    ) {
      e.preventDefault(); // 스크롤 방지
    }

    if (e.key === "ArrowRight") {
      charIndex = (charIndex + 1) % totalChars;
    } else if (e.key === "ArrowLeft") {
      charIndex = (charIndex - 1 + totalChars) % totalChars;
    } else if (e.key === "ArrowDown") {
      if (charIndex + cols < totalChars) charIndex += cols;
    } else if (e.key === "ArrowUp") {
      if (charIndex - cols >= 0) charIndex -= cols;
    } else if (e.key === "Enter" || e.code === "Space") {
      // 엔터나 스페이스 시 게임 시작 실행
      e.preventDefault();
      startGameFlow(); // 직접 시작 함수 호출 (안정성 확보)
      return;
    } else {
      return;
    }
    updateCharSelection(charIndex);
  }
});

closeTutorialBtn.addEventListener("click", closeTutorial);

// [기능 3] 캐릭터 선택 및 스킬 프리뷰 (진입 시 자동 실행 보장)
function updateSkillPreview(animal) {
  const data = charData[animal];
  const animals = {
    chick: "🐤",
    penguin: "🐧",
    bird: "🕊️",
    bee: "🐝",
    rabbit: "🐇",
    horse: "🐴",
  };

  const actor = document.getElementById("ult-visual"); // 기존 ID 사용
  const name = document.getElementById("ult-name");
  const desc = document.getElementById("ult-desc");

  if (actor) {
    actor.textContent = animals[animal];
    actor.className = "ult-visual-anim " + data.class; // 애니메이션 클래스 부여
    // 텍스트 업데이트
    name.innerText = animal.toUpperCase();
    desc.innerText = data.desc;
  }
  /*
  if (actor) {
    // 만약 mp4 영상을 적용하신다면 actor.innerHTML = `<video...>` 형태로 수정하게 됩니다.
    actor.textContent = animals[animal]; 
    actor.className = "ult-visual-anim " + (data.class || "");
  }
  */
  if (name) name.textContent = data.name;
  if (desc) desc.textContent = data.desc;
}

window.addEventListener("keydown", (e) => {
  // 게임이 활성 상태일 때만 작동
  if (gameActive && !isGameOver) {
    // 영문 'P'와 한글 입력 상태의 'ㅔ' 모두 대응
    if (e.key.toLowerCase() === "p" || e.key === "ㅔ") {
      e.preventDefault();
      initAudio();
      useUltimate(); // 스킬 발동 함수 호출
    }
  }
});

const confirmBtn = document.getElementById("confirmBtn");

const handleStartGame = (e) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // 오디오 컨텍스트 활성화 (모바일 필수)
  initAudio();

  console.log("Game Starting...");
  startGameFlow();
};

// 터치와 클릭 모두에 반응하도록 등록
confirmBtn.addEventListener("pointerdown", handleStartGame);
confirmBtn.addEventListener("click", handleStartGame);

// 기존 버튼 클릭 이벤트도 유지
document
  .getElementById("closeTutorialBtn")
  .addEventListener("click", closeTutorial);

setScreenSize();
drawBackground();
updateUltInfo("chick");
