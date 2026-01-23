const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const highScoreEl = document.getElementById("highScore");
const charSelectUI = document.getElementById("char-select");
const charItems = document.querySelectorAll(".char-item");

// 궁극기 관련 UI 요소
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

// 초기 최고 점수 표시
highScoreEl.innerText = highScore;

let audioCtx = null;

/** 1. 오디오 초기화 및 재생 **/
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

/** 2. 캐릭터 드로잉 (회전 + 방향 반전 + 궁극기 반짝임) **/
function drawBird() {
  const { x, y, width: w, height: h, animal, velocity } = bird;

  // 속도에 따른 회전 각도 계산
  let rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 8, velocity * 0.1));

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);

  // 좌우 반전: 왼쪽 보는 이모지를 오른쪽으로 돌림
  ctx.scale(-1, 1);

  // 궁극기 사용 시 반짝거리는 효과 (100ms 단위로 깜빡임)
  if (ultActive && Math.floor(Date.now() / 100) % 2 === 0) {
    ctx.globalAlpha = 0.3;
  }

  ctx.font = `${w}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const animals = {
    chick: "🐤",
    penguin: "🐧",
    bird: "🕊️",
    dog: "🐕",
  };

  ctx.fillText(animals[animal], 0, 0);
  ctx.restore();
}

/** 3. 게임 엔진 로직 **/
function updateLogic() {
  if (isGameOver) return;

  // 궁극기 타이머 관리
  if (ultActive) {
    ultTimer--;
    if (ultTimer <= 0) {
      ultActive = false;
      // 궁극기 종료 시 원래 상태 복구 (dog 크기 등)
      if (bird.animal === "dog") {
        bird.width = 45;
        bird.height = 45;
      }
    }
  }

  bird.velocity += bird.gravity;
  bird.y += bird.velocity;

  // chick 궁극기: 무적 상태 체크
  const isInvincible = ultActive && bird.animal === "chick";

  if (!isInvincible) {
    if (bird.y + bird.height > canvas.height || bird.y < 0) return gameOver();
  } else {
    // 무적 상태 시 화면 이탈 방지
    if (bird.y < 0) bird.y = 0;
    if (bird.y + bird.height > canvas.height)
      bird.y = canvas.height - bird.height;
  }

  // penguin 궁극기: 게임 속도 50% 감소
  let speedMultiplier = ultActive && bird.animal === "penguin" ? 0.5 : 1;
  const speed = (3 + level * 0.5) * speedMultiplier;

  // 파이프 생성
  if (pipes.length === 0 || pipes[pipes.length - 1].x < canvas.width - 250) {
    // bird 궁극기: 파이프 간격 1.5배 확장
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

    // 무적 상태가 아닐 때만 파이프 충돌 체크
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

  // 별 생성 (bird, dog 궁극기 시 1.5배 빈도 증가)
  let starProb =
    ultActive && (bird.animal === "bird" || bird.animal === "dog")
      ? 0.015
      : 0.01;
  if (Math.random() < starProb && stars.length < 3) {
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
    if (dist < bird.width + 10) {
      playSound("star");
      stars.splice(i, 1);
      score += 2;
      scoreEl.innerText = score;

      // 게이지 충전 (궁극기 비활성 시에만)
      if (!ultActive) {
        energy = Math.min(100, energy + 10);
        updateEnergyUI();
      }
    } else if (stars[i].x < -50) stars.splice(i, 1);
  }
}

/** 4. UI 및 궁극기 제어 **/
function updateEnergyUI() {
  gaugeBar.style.width = energy + "%";
  if (energy >= 100) {
    gaugeText.innerText = "MAX";
    ultButton.classList.add("ready");
  } else {
    gaugeText.innerText = energy + "%";
    ultButton.classList.remove("ready");
  }
}

function useUltimate() {
  if (energy < 100 || ultActive || isGameOver || !gameActive) return;

  energy = 0;
  updateEnergyUI();
  ultActive = true;

  if (bird.animal === "chick")
    ultTimer = 5 * 60; // 5초
  else if (bird.animal === "penguin")
    ultTimer = 7 * 60; // 7초
  else if (bird.animal === "bird")
    ultTimer = 10 * 60; // 10초
  else if (bird.animal === "dog") {
    ultTimer = 10 * 60;
    bird.width = 22;
    bird.height = 22; // 0.5배 축소
  }
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
  const bw = 180;
  const bh = 60;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#e67e22";
  ctx.beginPath();
  ctx.roundRect(tx - bw / 2, ty, bw, bh, 10);
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
  if (isReady && !gameActive && !isGameOver) {
    drawArrowUI("TAP TO START", "☝️");
  } else if (isGameOver) {
    if (now - deathTime > 2000) drawArrowUI("TAP TO RETRY", "🔄", true);
  }
  requestAnimationFrame(draw);
}

function initGame() {
  score = 0;
  level = 1;
  energy = 0;
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

/** 5. 이벤트 핸들링 **/
const handleAction = (e) => {
  // 키보드 스페이스바 또는 화면 터치(pointerdown) 처리
  if (e.type === "keydown" && e.code !== "Space") return;
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
    if (e.key === "ArrowDown" || e.key === "ArrowUp")
      updateCharSelection((charIndex + 2) % 4);
    if (e.key === "Enter" || e.code === "Space") startGameFlow();
    return;
  }
  if (e.code === "Space") handleAction(e);
});

// 메인 게임 터치 (passive: false는 preventDefault 사용을 위해 필수)
canvas.addEventListener("pointerdown", handleAction, { passive: false });

// 궁극기 버튼 터치
ultButton.addEventListener(
  "pointerdown",
  (e) => {
    e.stopPropagation(); // 캔버스로의 점프 명령 전달 방지
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

// 초기 선택창 이벤트 (옆모습 이모지)
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
