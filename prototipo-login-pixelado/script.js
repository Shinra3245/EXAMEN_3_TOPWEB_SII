const authForm = document.getElementById("auth-form");
const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const tabs = document.querySelector(".mode-switch");
const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name");
const passwordField = document.getElementById("password-field");
const passwordInput = document.getElementById("password");
const emailInput = document.getElementById("email");
const welcomeMessage = document.getElementById("welcome-message");
const forgotCopy = document.getElementById("forgot-copy");
const resetButton = document.getElementById("reset-button");
const backButton = document.getElementById("back-button");
const submitButton = document.getElementById("submit-button");
const formMessage = document.getElementById("form-message");
const mosaicCanvas = document.getElementById("mosaic-canvas");

let currentMode = "login";
let isResetMode = false;

const cloudGroups = [
  { x: 0.1, y: 0.2, size: 0.14 },
  { x: 0.37, y: 0.31, size: 0.09 },
  { x: 0.75, y: 0.18, size: 0.14 },
  { x: 0.95, y: 0.36, size: 0.1 },
];

const cascadePositions = [0.018, 0.071, 0.128, 0.199, 0.254, 0.327, 0.386, 0.462, 0.519, 0.584, 0.659, 0.716, 0.786, 0.846, 0.916, 0.978];
const cascadeLengths = [0.89, 0.92, 0.83, 0.9, 0.94, 0.84, 0.91, 0.81, 0.94, 0.87, 0.93, 0.81, 0.91, 0.83, 0.94, 0.88];
const cascadeDrifts = [-0.01, 0.016, -0.018, 0.012, -0.01, 0.018, -0.012, 0.014, -0.02, 0.011, 0.014, -0.016, 0.018, -0.012, 0.012, -0.018];
const cascadeWidths = [3, 4, 2, 3, 4, 2, 4, 3, 2, 4, 3, 2, 4, 3, 4, 2];
const cascadeTurnPattern = [0, 2, -1, 3, -2, 1, -3, 2, 0];
const waterfallStreams = cascadeLengths.map((endY, index) => {
  const startX = cascadePositions[index];

  return {
    startX,
    endX: Math.min(0.99, Math.max(0.01, startX + cascadeDrifts[index])),
    startY: 0.47 + ((index * 5) % 7) * 0.02,
    endY,
    halfWidthCells: cascadeWidths[index],
    turns: cascadeTurnPattern.map((_, step) =>
      cascadeTurnPattern[(step + index * 2) % cascadeTurnPattern.length],
    ),
  };
});

function drawPixelLandscape() {
  const canvasBounds = mosaicCanvas.getBoundingClientRect();
  const width = canvasBounds.width;
  const height = canvasBounds.height;

  if (!width || !height) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const mosaicContext = mosaicCanvas.getContext("2d");
  mosaicCanvas.width = Math.round(width * pixelRatio);
  mosaicCanvas.height = Math.round(height * pixelRatio);
  mosaicContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  mosaicContext.clearRect(0, 0, width, height);

  const cellSize = 0.15 * 96;
  const gapSize = 1.8;
  const cellStep = cellSize + gapSize;
  const columnCount = Math.floor((width + gapSize) / cellStep);
  const rowCount = Math.floor((height + gapSize) / cellStep);
  const gridWidth = columnCount * cellSize + (columnCount - 1) * gapSize;
  const gridHeight = rowCount * cellSize + (rowCount - 1) * gapSize;
  const startX = (width - gridWidth) / 2;
  const startY = (height - gridHeight) / 2;

  const grid = { width, height, cellSize, cellStep, columnCount, rowCount, startX, startY };

  drawSky(mosaicContext, grid);
  drawClouds(mosaicContext, grid);

  const mainIsland = { x: 0.45, top: 0.435, halfWidth: 0.29, depth: 0.11 };
  const sideIslands = [
    { x: 0.12, top: 0.305, halfWidth: 0.075, depth: 0.085 },
    { x: 0.81, top: 0.305, halfWidth: 0.09, depth: 0.095 },
  ];

  drawWaterfalls(mosaicContext, grid);
  [mainIsland, ...sideIslands].forEach((island) => drawIsland(mosaicContext, grid, island));

  const houseColumns = width < 500 ? 5 : 8;
  const lighthouseColumns = 4;
  const structureGap = grid.cellStep * 2.5;
  const houseX = mainIsland.x -
    (lighthouseColumns * grid.cellStep + structureGap) / (2 * width);
  const lighthouseX = mainIsland.x +
    (houseColumns * grid.cellStep + structureGap) / (2 * width);

  drawHouse(mosaicContext, grid, {
    x: houseX,
    base: mainIsland.top,
    columns: houseColumns,
    rows: width < 500 ? 4 : 5,
    wall: "#f6c184",
    roof: "#ec755b",
  });

  drawLighthouse(mosaicContext, grid, {
    x: lighthouseX,
    base: mainIsland.top,
    columns: lighthouseColumns,
    rows: width < 500 ? 5 : 6,
  });
}

function forEachGridCell(grid, drawCell) {
  for (let row = 0; row < grid.rowCount; row += 1) {
    for (let column = 0; column < grid.columnCount; column += 1) {
      const x = grid.startX + column * grid.cellStep;
      const y = grid.startY + row * grid.cellStep;
      drawCell({
        x: x + grid.cellSize / 2,
        y: y + grid.cellSize / 2,
        left: x,
        top: y,
        unitX: (x + grid.cellSize / 2) / grid.width,
        unitY: (y + grid.cellSize / 2) / grid.height,
        column,
        row,
      });
    }
  }
}

function paintPixel(context, grid, cell, color, radius = 1.2) {
  if (!color) {
    return;
  }

  context.fillStyle = color;
  context.beginPath();
  context.roundRect(cell.left, cell.top, grid.cellSize, grid.cellSize, radius);
  context.fill();
}

function pixelVariation(column, row) {
  return Math.abs(Math.sin(column * 53.7 + row * 19.3) * 24634.6345) % 1;
}

function drawSky(context, grid) {
  const topColor = [102, 174, 234];
  const bottomColor = [211, 242, 255];

  forEachGridCell(grid, (cell) => {
    const lowerPixelEdge = 0.56 + Math.sin(cell.column * 0.47) * 0.018;
    if (cell.unitY > lowerPixelEdge) {
      return;
    }

    const variation = pixelVariation(cell.column, cell.row);
    const progress = Math.min(1, Math.max(0, cell.unitY * 0.72 + variation * 0.18));
    const shade = (variation - 0.5) * 28;
    const color = topColor.map((value, index) => {
      const blended = value + (bottomColor[index] - value) * progress + shade;
      return Math.round(Math.min(255, Math.max(0, blended)));
    });

    paintPixel(context, grid, cell, `rgb(${color.join(",")})`);
  });
}

function cloudLobes(cloud) {
  const size = cloud.size;

  return [
    { x: cloud.x - size * 0.42, y: cloud.y + size * 0.08, rx: size * 0.34, ry: size * 0.42 },
    { x: cloud.x - size * 0.18, y: cloud.y - size * 0.08, rx: size * 0.34, ry: size * 0.62 },
    { x: cloud.x + size * 0.16, y: cloud.y - size * 0.03, rx: size * 0.36, ry: size * 0.62 },
    { x: cloud.x + size * 0.46, y: cloud.y + size * 0.1, rx: size * 0.34, ry: size * 0.43 },
    { x: cloud.x - size * 0.18, y: cloud.y + size * 0.34, rx: size * 0.43, ry: size * 0.36 },
    { x: cloud.x + size * 0.25, y: cloud.y + size * 0.34, rx: size * 0.44, ry: size * 0.36 },
  ];
}

function getCloudDepth(x, y, cloud) {
  return cloudLobes(cloud).reduce((closest, lobe) => {
    const distance = Math.sqrt(((x - lobe.x) / lobe.rx) ** 2 + ((y - lobe.y) / lobe.ry) ** 2);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);
}

function drawClouds(context, grid) {
  forEachGridCell(grid, (cell) => {
    let closestCloud = null;
    let closestDepth = Number.POSITIVE_INFINITY;

    cloudGroups.forEach((cloud) => {
      const depth = getCloudDepth(cell.unitX, cell.unitY, cloud);
      if (depth < closestDepth) {
        closestDepth = depth;
        closestCloud = cloud;
      }
    });

    if (closestDepth > 1) {
      return;
    }

    const variation = pixelVariation(cell.column + 8, cell.row + 3);
    const lowerCloud = cell.unitY > closestCloud.y + closestCloud.size * 0.12;
    const shades = lowerCloud
      ? ["#f9c9c3", "#ffe0d5", "#f7b9cf"]
      : ["#ffffff", "#f1fbff", "#dff5ff"];
    const shade = shades[Math.floor(variation * shades.length)];

    paintPixel(context, grid, cell, shade, 2.2);
  });
}

function drawWaterfalls(context, grid) {
  const waterShades = ["#238dcc", "#47b3e6", "#89d7f3"];

  waterfallStreams.forEach((stream, streamIndex) => {
    let centerColumn = Math.round(stream.startX * grid.width / grid.cellStep);
    const edgeWobble = Math.sin(centerColumn * 0.47) * 0.018;
    const firstRow = Math.ceil((0.56 + edgeWobble) * grid.height / grid.cellStep);
    const lastRow = Math.min(grid.rowCount - 1, Math.floor(stream.endY * grid.height / grid.cellStep));

    for (let row = firstRow; row <= lastRow; row += 1) {
      const progress = (row - firstRow) / Math.max(1, lastRow - firstRow);
      const turn = stream.turns[Math.floor(progress * (stream.turns.length - 1))];
      const turnStep = Math.sign(turn) * (Math.abs(turn) > 1 ? 1 : 0);
      centerColumn += turnStep;

      // Neighboring wide roots join into a broken edge; every tip then sheds
      // pixels from its sides until only its final one-pixel spine remains.
      const halfWidth = Math.max(0, Math.round(stream.halfWidthCells * (1 - progress)));
      const edgeDensity = Math.max(0.2, 0.96 - progress * 0.76);

      for (let offset = -halfWidth; offset <= halfWidth; offset += 1) {
        const variation = pixelVariation(centerColumn + offset + streamIndex * 11, row + streamIndex * 7);
        const isSpine = offset === 0;
        if (!isSpine && variation > edgeDensity) continue;

        const column = centerColumn + offset;
        if (column < 0 || column >= grid.columnCount) continue;
        const x = grid.startX + column * grid.cellStep;
        const y = grid.startY + row * grid.cellStep;
        let pixelColor = waterShades[Math.floor(variation * waterShades.length)];
        if (progress > 0.58 && isSpine) {
          pixelColor = (row + column) % 2 === 0 ? "#238dcc" : "#89d7f3";
        }

        paintPixel(context, grid, {
          left: x,
          top: y,
          column,
          row,
        }, pixelColor, 1.2);
      }

      // A few detached side pixels make the edges look like they are crumbling.
      if (progress > 0.2 && progress < 0.82 && row % 2 === streamIndex % 2) {
        const side = stream.turns[(row + streamIndex) % stream.turns.length] < 0 ? -1 : 1;
        const debrisColumn = centerColumn + side * (1 + (row % 3 === 0 ? 1 : 0));
        const debrisVariation = pixelVariation(debrisColumn + streamIndex * 17, row + 31);
        if (debrisVariation > 0.28 && debrisColumn >= 0 && debrisColumn < grid.columnCount) {
          const x = grid.startX + debrisColumn * grid.cellStep;
          const y = grid.startY + row * grid.cellStep;
          paintPixel(context, grid, { left: x, top: y, column: debrisColumn, row }, "#47b3e6", 1.2);
        }
      }
    }
  });
}

function drawIsland(context, grid, island) {
  forEachGridCell(grid, (cell) => {
    const distanceFromCenter = Math.abs(cell.unitX - island.x);
    if (distanceFromCenter > island.halfWidth) {
      return;
    }

    const sideProgress = distanceFromCenter / island.halfWidth;
    const topEdge = island.top + Math.sin(cell.column * 1.7) * (grid.cellSize / grid.height) * 0.16;
    const bottomEdge = topEdge + island.depth * (1 - sideProgress * 0.7);

    if (cell.unitY < topEdge || cell.unitY > bottomEdge) {
      return;
    }

    const variation = pixelVariation(cell.column + 2, cell.row + 10);
    const grassBand = grid.cellSize / grid.height * 1.1;
    let color;

    if (cell.unitY < topEdge + grassBand) {
      const grassShades = ["#83d85a", "#69c34e", "#a1e86b"];
      color = grassShades[Math.floor(variation * grassShades.length)];
    } else if (cell.unitY < topEdge + grassBand * 1.8) {
      color = variation > 0.55 ? "#4d983e" : "#6cb34b";
    } else {
      const earthShades = ["#84502c", "#9a6031", "#b4773e", "#70452b"];
      color = earthShades[Math.floor(variation * earthShades.length)];
    }

    paintPixel(context, grid, cell, color);
  });
}

function drawHouse(context, grid, house) {
  const houseWidth = house.columns * grid.cellStep / grid.width;
  const houseHeight = house.rows * grid.cellStep / grid.height;
  const chimneyWidth = grid.cellStep / grid.width;
  const chimneyHeight = grid.cellStep * 1.5 / grid.height;
  const roofTop = house.base - houseHeight;

  forEachGridCell(grid, (cell) => {
    const chimneyX = house.x + houseWidth * 0.22;
    const chimneyTop = roofTop - chimneyHeight * 0.75;
    const chimneyBottom = roofTop + chimneyHeight * 0.1;
    const isChimney = Math.abs(cell.unitX - chimneyX) < chimneyWidth * 0.55 &&
      cell.unitY > chimneyTop && cell.unitY < chimneyBottom;

    if (isChimney) {
      paintPixel(context, grid, cell, "#b75a4e");
    }
  });

  forEachGridCell(grid, (cell) => {
    const distanceX = Math.abs(cell.unitX - house.x);
    const distanceY = house.base - cell.unitY;
    const roofHeight = houseHeight * 0.46;
    const wallHeight = houseHeight - roofHeight;
    const roofProgress = Math.min(1, Math.max(0, (houseHeight - distanceY) / roofHeight));
    const roofHalfWidth = houseWidth * (0.12 + roofProgress * 0.42);
    const outlineSizeX = grid.cellSize / grid.width * 0.7;
    const outlineSizeY = grid.cellSize / grid.height * 0.7;
    const inRoof = distanceY >= houseHeight - roofHeight && distanceY < houseHeight;
    const inWalls = distanceY >= 0 && distanceY < wallHeight && distanceX < houseWidth / 2;
    const inRoofOutline = inRoof && distanceX < roofHalfWidth + outlineSizeX;
    const inWallOutline = distanceY >= -outlineSizeY && distanceY < wallHeight + outlineSizeY &&
      distanceX < houseWidth / 2 + outlineSizeX;

    if (inRoofOutline || inWallOutline) {
      paintPixel(context, grid, cell, "#653b55");
    }

    if (inRoof && distanceX < roofHalfWidth) {
      const roofStripe = Math.floor((house.base - cell.unitY) * grid.height / grid.cellStep);
      const roofColor = roofStripe % 2 === 0 ? house.roof : "#f59668";
      paintPixel(context, grid, cell, roofColor);
      return;
    }

    if (!inWalls) {
      return;
    }

    const windowY = house.base - houseHeight * 0.54;
    const windowSizeX = grid.cellSize / grid.width * 0.9;
    const windowSizeY = grid.cellSize / grid.height * 0.9;
    const isWindow = Math.abs(cell.unitY - windowY) < windowSizeY &&
      (Math.abs(cell.unitX - (house.x - houseWidth * 0.24)) < windowSizeX ||
        Math.abs(cell.unitX - (house.x + houseWidth * 0.24)) < windowSizeX);
    const isDoor = Math.abs(cell.unitX - house.x) < houseWidth * 0.13 &&
      cell.unitY > house.base - houseHeight * 0.34;

    if (isWindow) {
      paintPixel(context, grid, cell, "#72d8e6");
    } else if (isDoor) {
      paintPixel(context, grid, cell, "#9f5645");
    } else {
      const wallShades = [house.wall, "#ffd7a0", "#efad79"];
      const shade = wallShades[Math.floor(pixelVariation(cell.column, cell.row) * wallShades.length)];
      paintPixel(context, grid, cell, shade);
    }
  });
}

function drawLighthouse(context, grid, lighthouse) {
  const towerWidth = lighthouse.columns * grid.cellStep / grid.width;
  const towerHeight = lighthouse.rows * grid.cellStep / grid.height;
  const cellHeight = grid.cellStep / grid.height;
  const top = lighthouse.base - towerHeight;
  const bodyTop = top + cellHeight;
  const outlineWidth = grid.cellSize / grid.width * 0.7;
  const outlineHeight = grid.cellSize / grid.height * 0.7;
  const beamY = top + cellHeight * 0.5;
  const beamStartX = lighthouse.x + towerWidth / 2 + grid.cellStep / grid.width * 0.4;
  const beamEndX = beamStartX + grid.cellStep / grid.width * 2.4;

  forEachGridCell(grid, (cell) => {
    const distanceX = Math.abs(cell.unitX - lighthouse.x);
    const isLightBeam = cell.unitX > beamStartX && cell.unitX < beamEndX &&
      Math.abs(cell.unitY - beamY) < cellHeight * 0.46;
    const isBeacon = distanceX < towerWidth * 0.17 &&
      Math.abs(cell.unitY - beamY) < cellHeight * 0.46;

    if (isLightBeam) {
      paintPixel(context, grid, cell, "#fff0a2");
      return;
    }

    if (isBeacon) {
      paintPixel(context, grid, cell, "#ffd866");
      return;
    }

    const isCap = cell.unitY >= top && cell.unitY < bodyTop &&
      distanceX < towerWidth * 0.42;
    const isBody = cell.unitY >= bodyTop && cell.unitY < lighthouse.base &&
      distanceX < towerWidth / 2;
    const isOutline = cell.unitY >= top - outlineHeight &&
      cell.unitY < lighthouse.base + outlineHeight &&
      distanceX < towerWidth / 2 + outlineWidth;

    if (isOutline) {
      paintPixel(context, grid, cell, "#47708d");
    }

    if (isCap) {
      const capTop = cell.unitY < top + cellHeight * 0.45;
      paintPixel(context, grid, cell, capTop ? "#fff6e6" : "#ed705f");
      return;
    }

    if (!isBody) {
      return;
    }

    const stripe = Math.floor((cell.unitY - bodyTop) * grid.height / grid.cellStep);
    const windowRow = stripe === Math.floor(lighthouse.rows * 0.58);
    const windowX = Math.abs(cell.unitX - lighthouse.x) < outlineWidth * 0.8;
    const isDoor = stripe >= lighthouse.rows - 2 && windowX;

    if (isDoor) {
      paintPixel(context, grid, cell, "#a85b49");
    } else if (windowRow && windowX) {
      paintPixel(context, grid, cell, "#65c9ef");
    } else {
      const towerShades = stripe % 2 === 0
        ? ["#fff8e8", "#fff0d2", "#ffe6bd"]
        : ["#ef7564", "#ff9272"];
      const variation = pixelVariation(cell.column + 17, stripe + 23);
      paintPixel(context, grid, cell, towerShades[Math.floor(variation * towerShades.length)]);
    }
  });
}

drawPixelLandscape();
let resizeTimer;

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(drawPixelLandscape, 100);
});

function updateSubmitButton() {
  const requiredInputs = authForm.querySelectorAll("input[required]:not(:disabled)");
  const hasEmptyInput = Array.from(requiredInputs).some(
    (input) => input.value.trim() === "",
  );

  submitButton.disabled = hasEmptyInput;
}

function clearMessage() {
  formMessage.textContent = "";
}

function setMode(mode) {
  currentMode = mode;
  isResetMode = false;
  authForm.reset();

  tabs.hidden = false;
  nameField.hidden = mode !== "signup";
  nameInput.disabled = mode !== "signup";
  nameInput.required = mode === "signup";
  passwordField.hidden = false;
  passwordInput.disabled = false;
  passwordInput.required = true;
  passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  resetButton.hidden = mode !== "login";
  backButton.hidden = true;
  forgotCopy.hidden = mode !== "login";

  loginTab.classList.toggle("is-selected", mode === "login");
  signupTab.classList.toggle("is-selected", mode === "signup");
  loginTab.setAttribute("aria-selected", String(mode === "login"));
  signupTab.setAttribute("aria-selected", String(mode === "signup"));
  authForm.setAttribute("aria-labelledby", mode === "login" ? "login-tab" : "signup-tab");

  if (mode === "signup") {
    welcomeMessage.textContent =
      "Create your Pixel Gallery account.\nYour collection starts here.";
    submitButton.textContent = "Create account";
  } else {
    welcomeMessage.textContent =
      "Welcome back to Pixel Gallery!\nYou've been missed!";
    submitButton.textContent = "Login";
  }

  clearMessage();
  updateSubmitButton();
}

function showResetForm() {
  isResetMode = true;
  authForm.reset();
  tabs.hidden = true;
  nameField.hidden = true;
  nameInput.disabled = true;
  passwordField.hidden = true;
  passwordInput.disabled = true;
  passwordInput.required = false;
  resetButton.hidden = true;
  backButton.hidden = false;
  forgotCopy.hidden = true;
  welcomeMessage.textContent =
    "Enter your email address.\nWe'll help you get back in.";
  submitButton.textContent = "Send reset link";
  clearMessage();
  updateSubmitButton();
  emailInput.focus();
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));
resetButton.addEventListener("click", showResetForm);
backButton.addEventListener("click", () => setMode("login"));

authForm.addEventListener("input", () => {
  clearMessage();
  updateSubmitButton();
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!authForm.reportValidity()) {
    return;
  }

  if (isResetMode) {
    formMessage.textContent = "Local preview only: no reset email was sent.";
  } else if (currentMode === "signup") {
    formMessage.textContent = "Demo form validated. No account was created.";
  } else {
    formMessage.textContent = "Demo form validated. No sign-in request was sent.";
  }
});

updateSubmitButton();
