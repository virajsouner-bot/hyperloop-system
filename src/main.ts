
import "./style.css";

/* =========================================
   HYPERLOOP CONTROL SIMULATION
   Educational simulation only
========================================= */

type SensorSample = {
  time: number;
  position: number;
  speed: number;
  remaining: number;
  stopping: number;
  health: string;
  braking: string;
};

type Anomaly = {
  time: number;
  sensor: string;
  issue: string;
  severity: "WARNING" | "CRITICAL";
  response: string;
};

type VelocityPoint = {
  time: number;
  speed: number;
};

type SafetyState = "normal" | "warning" | "critical";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Required HTML element not found: #${id}`);
  }

  return element as T;
};

const optionalElement = <T extends HTMLElement = HTMLElement>(
  id: string
): T | null => document.getElementById(id) as T | null;

/* =========================================
   CONFIGURATION AND SIMULATION STATE
========================================= */

const MIN_ROUTE_LENGTH = 100;
const MAX_ROUTE_LENGTH = 100000;
const MIN_SPEED_LIMIT = 1;
const MAX_SPEED_LIMIT = 150;

const MAX_ACCELERATION = 3;
const MAX_BRAKING = 6;
const SAMPLE_INTERVAL = 0.5;

let routeLength = 1000;
let speedLimit = 30;

let position = 0;
let speed = 0;
let elapsed = 0;

let running = false;
let braking = false;
let emergencyStop = false;
let sensorFault = false;
let completed = false;

let lastFrameTime = 0;
let sampleAccumulator = 0;

let velocityHistory: VelocityPoint[] = [];
let sensorSamples: SensorSample[] = [];
let anomalies: Anomaly[] = [];

/* =========================================
   HTML ELEMENT REFERENCES
========================================= */

const eventLog = $("eventLog");

const safetyBanner = $("safetyBanner");
const safetyIcon = $("safetyIcon");
const safetyTitle = $("safetyTitle");
const safetyMessage = $("safetyMessage");
const safetyTag = $("safetyTag");

const healthDot = $("healthDot");
const sensorHealthTag = $("sensorHealthTag");
const sensorHealth = $("sensorHealth");

const systemStatus = $("systemStatus");
const missionStatus = $("missionStatus");

const speedValue = $("speedValue");
const positionValue = $("positionValue");
const remainingValue = $("remainingValue");
const stoppingValue = $("stoppingValue");

const sensorPosition = $("sensorPosition");
const sensorSpeed = $("sensorSpeed");
const sensorBraking = $("sensorBraking");

const trackTag = $("trackTag");
const progressValue = $("progressValue");
const journeyProgress = $("journeyProgress");
const trackProgress = $("trackProgress");
const podMarker = $("podMarker");
const destinationLabel = $("destinationLabel");

const startButton = $("startButton") as HTMLButtonElement;
const pauseButton = $("pauseButton") as HTMLButtonElement;
const resetButton = $("resetButton") as HTMLButtonElement;

const applySettingsButton = $(
  "applySettingsButton"
) as HTMLButtonElement;

const faultButton = $("faultButton") as HTMLButtonElement;
const anomalyButton = $("anomalyButton") as HTMLButtonElement;

const velocityChart = $("velocityChart") as HTMLCanvasElement;

const sensorDataBody = $("sensorDataBody");
const anomalyTableBody = $("anomalyTableBody");

const anomalyCount = $("anomalyCount");
const criticalCount = $("criticalCount");
const latestAnomaly = $("latestAnomaly");
const anomalyStatus = $("anomalyStatus");

const routeLengthInput = $(
  "routeLengthInput"
) as HTMLInputElement;

const speedLimitInput = $(
  "speedLimitInput"
) as HTMLInputElement;

const exportButton = $("exportButton") as HTMLButtonElement;
const clearSensorButton = $(
  "clearSensorButton"
) as HTMLButtonElement;
const clearLogButton = $("clearLogButton") as HTMLButtonElement;

const routeEndLabel = optionalElement("routeEndLabel");

/* =========================================
   UTILITY FUNCTIONS
========================================= */

function formatNumber(value: number, decimals = 1): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0.0";
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getRemainingDistance(): number {
  return Math.max(0, routeLength - position);
}

function calculateStoppingDistance(currentSpeed = speed): number {
  const safeSpeed = Math.max(0, currentSpeed);

  return (safeSpeed * safeSpeed) / (2 * MAX_BRAKING);
}

function getClockTime(): string {
  return `${elapsed.toFixed(1)}s`;
}

function escapeHTML(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setTag(
  element: HTMLElement,
  text: string,
  state: "normal" | "warning" | "critical" = "normal"
): void {
  element.textContent = text;
  element.classList.remove("state-normal", "state-warning", "state-critical");

  element.classList.add(`state-${state}`);

  if (state === "warning") {
    element.style.borderColor = "rgba(255, 189, 89, 0.4)";
    element.style.background = "rgba(255, 189, 89, 0.08)";
    element.style.color = "#ffbd59";
  } else if (state === "critical") {
    element.style.borderColor = "rgba(255, 101, 119, 0.4)";
    element.style.background = "rgba(255, 101, 119, 0.08)";
    element.style.color = "#ff6577";
  } else {
    element.style.borderColor = "";
    element.style.background = "";
    element.style.color = "";
  }
}

/* =========================================
   EVENT LOG
========================================= */

function logEvent(
  message: string,
  level: "INFO" | "WARNING" | "CRITICAL" = "INFO"
): void {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  if (level === "WARNING") {
    entry.classList.add("warning");
  } else if (level === "CRITICAL") {
    entry.classList.add("critical");
  }

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = getClockTime();

  const messageElement = document.createElement("span");
  messageElement.className = "log-message";
  messageElement.textContent = message;

  const levelElement = document.createElement("span");
  levelElement.className = "log-level";
  levelElement.textContent = level;

  entry.append(time, messageElement, levelElement);
  eventLog.prepend(entry);

  while (eventLog.children.length > 100) {
    eventLog.lastElementChild?.remove();
  }
}

/* =========================================
   SAFETY AND FAULT MANAGEMENT
========================================= */

function getSafetyState(): SafetyState {
  if (emergencyStop || sensorFault) {
    return "critical";
  }

  if (braking || anomalies.some((item) => item.severity === "WARNING")) {
    return "warning";
  }

  return "normal";
}

function renderSafety(): void {
  const state = getSafetyState();

  safetyBanner.classList.remove(
    "warning",
    "alert",
    "fault",
    "braking",
    "critical",
    "emergency",
    "danger"
  );

  if (state === "critical") {
    safetyBanner.classList.add("critical");

    safetyIcon.textContent = "!";
    safetyTitle.textContent = emergencyStop
      ? "Emergency stop activated"
      : "Sensor fault detected";

    safetyMessage.textContent = emergencyStop
      ? "The simulation has stopped. Reset the system to resume."
      : "A sensor fault is active. Check the diagnostic records.";

    setTag(safetyTag, "CRITICAL", "critical");

    healthDot.style.background = "#ff6577";
    healthDot.style.boxShadow = "0 0 10px rgba(255, 101, 119, 0.5)";

    sensorHealth.textContent = "FAULT";
    sensorHealth.className = "critical-text";
    sensorHealthTag.textContent = "SAFETY FAULT DETECTED";

    systemStatus.textContent = "SAFETY FAULT";
  } else if (state === "warning") {
    safetyBanner.classList.add("warning");

    safetyIcon.textContent = "!";
    safetyTitle.textContent = braking
      ? "Automatic braking active"
      : "Diagnostic warning";

    safetyMessage.textContent = braking
      ? "The pod is decelerating as it approaches the stopping zone."
      : "A previous warning is recorded in the anomaly history.";

    setTag(safetyTag, "WARNING", "warning");

    healthDot.style.background = "#ffbd59";
    healthDot.style.boxShadow = "0 0 10px rgba(255, 189, 89, 0.4)";

    sensorHealth.textContent = "CHECK";
    sensorHealth.className = "warning-text";
    sensorHealthTag.textContent = "CHECK DIAGNOSTIC HISTORY";

    systemStatus.textContent = "WARNING";
  } else {
    safetyIcon.textContent = "✓";
    safetyTitle.textContent = "All systems normal";
    safetyMessage.textContent = "No active safety alerts detected.";

    setTag(safetyTag, "NORMAL", "normal");

    healthDot.style.background = "#6ce5a2";
    healthDot.style.boxShadow = "0 0 10px rgba(108, 229, 162, 0.4)";

    sensorHealth.textContent = "HEALTHY";
    sensorHealth.className = "healthy-text";
    sensorHealthTag.textContent = "SENSOR CHECK PASSED";

    systemStatus.textContent = running
      ? "SYSTEM ACTIVE"
      : completed
        ? "JOURNEY COMPLETE"
        : "SYSTEM READY";
  }

  if (emergencyStop) {
    missionStatus.textContent = "EMERGENCY STOP";
  } else if (sensorFault) {
    missionStatus.textContent = "FAULT";
  } else if (running && braking) {
    missionStatus.textContent = "BRAKING";
  } else if (running) {
    missionStatus.textContent = "IN TRANSIT";
  } else if (completed) {
    missionStatus.textContent = "COMPLETE";
  } else if (speed > 0) {
    missionStatus.textContent = "PAUSED";
  } else {
    missionStatus.textContent = "READY";
  }
}

/* =========================================
   TELEMETRY DISPLAY
========================================= */

function renderTelemetry(): void {
  const remaining = getRemainingDistance();
  const stopping = calculateStoppingDistance();

  speedValue.textContent = formatNumber(speed);
  positionValue.textContent = formatNumber(position);
  remainingValue.textContent = formatNumber(remaining);
  stoppingValue.textContent = formatNumber(stopping);

  sensorPosition.textContent = `${formatNumber(position)} m`;
  sensorSpeed.textContent = `${formatNumber(speed)} m/s`;

  if (emergencyStop) {
    sensorBraking.textContent = "EMERGENCY";
    sensorBraking.style.color = "#ff6577";
  } else if (braking) {
    sensorBraking.textContent = "ACTIVE";
    sensorBraking.style.color = "#ffbd59";
  } else {
    sensorBraking.textContent = running ? "STANDBY" : "STANDBY";
    sensorBraking.style.color = "";
  }

  const progress = routeLength > 0
    ? clamp((position / routeLength) * 100, 0, 100)
    : 0;

  progressValue.textContent = `${progress.toFixed(1)}%`;

  journeyProgress.style.width = `${progress}%`;
  trackProgress.style.width = `${progress}%`;
  podMarker.style.left = `${progress}%`;

  destinationLabel.textContent = `DESTINATION · ${routeLength.toFixed(0)} m`;

  if (routeEndLabel) {
    routeEndLabel.innerHTML =
      `${routeLength.toFixed(0)} m <small>END</small>`;
  }

  if (emergencyStop) {
    setTag(trackTag, "EMERGENCY STOP", "critical");
  } else if (sensorFault) {
    setTag(trackTag, "SENSOR FAULT", "critical");
  } else if (braking) {
    setTag(trackTag, "BRAKING", "warning");
  } else if (completed) {
    setTag(trackTag, "ARRIVED", "normal");
  } else if (running) {
    setTag(trackTag, "IN TRANSIT", "normal");
  } else if (speed > 0) {
    setTag(trackTag, "PAUSED", "warning");
  } else {
    setTag(trackTag, "STATIONARY", "normal");
  }

  startButton.disabled = running || emergencyStop || sensorFault || completed;
  pauseButton.disabled = !running;

  const canConfigure = !running && speed <= 0.001;

  applySettingsButton.disabled = !canConfigure;
  routeLengthInput.disabled = !canConfigure;
  speedLimitInput.disabled = !canConfigure;

  renderSafety();
}

/* =========================================
   SENSOR DATA COLLECTION
========================================= */

function captureSensorSample(): void {
  const sample: SensorSample = {
    time: elapsed,
    position,
    speed,
    remaining: getRemainingDistance(),
    stopping: calculateStoppingDistance(),
    health: sensorFault ? "FAULT" : "HEALTHY",
    braking: emergencyStop
      ? "EMERGENCY"
      : braking
        ? "ACTIVE"
        : "STANDBY",
  };

  sensorSamples.push(sample);

  if (sensorSamples.length > 5000) {
    sensorSamples.shift();
  }

  velocityHistory.push({
    time: elapsed,
    speed,
  });

  if (velocityHistory.length > 120) {
    velocityHistory.shift();
  }

  renderSensorTable();
  renderVelocityChart();
}

/* =========================================
   SENSOR TABLE
========================================= */

function renderSensorTable(): void {
  const latestSamples = sensorSamples.slice(-20).reverse();

  if (latestSamples.length === 0) {
    sensorDataBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          Sensor samples will appear here.
        </td>
      </tr>
    `;
    return;
  }

  sensorDataBody.innerHTML = latestSamples
    .map((sample) => {
      const healthClass =
        sample.health === "FAULT" ? "critical-text" : "healthy-text";

      const brakingClass =
        sample.braking === "EMERGENCY"
          ? "critical-text"
          : sample.braking === "ACTIVE"
            ? "warning-text"
            : "";

      return `
        <tr>
          <td>${formatNumber(sample.time)}</td>
          <td>${formatNumber(sample.position)}</td>
          <td>${formatNumber(sample.speed)}</td>
          <td>${formatNumber(sample.remaining)}</td>
          <td>${formatNumber(sample.stopping)}</td>
          <td class="${healthClass}">${escapeHTML(sample.health)}</td>
          <td class="${brakingClass}">${escapeHTML(sample.braking)}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================
   ANOMALY DETECTION
========================================= */

function addAnomaly(
  sensor: string,
  issue: string,
  severity: "WARNING" | "CRITICAL",
  response: string
): void {
  anomalies.push({
    time: elapsed,
    sensor,
    issue,
    severity,
    response,
  });

  if (anomalies.length > 500) {
    anomalies.shift();
  }

  renderAnomalies();
}

function renderAnomalies(): void {
  anomalyCount.textContent = String(anomalies.length);

  criticalCount.textContent = String(
    anomalies.filter((item) => item.severity === "CRITICAL").length
  );

  const latest = anomalies[anomalies.length - 1];

  latestAnomaly.textContent = latest
    ? latest.issue
    : "No faults detected";

  if (!latest) {
    setTag(anomalyStatus, "MONITORING", "normal");
  } else if (latest.severity === "CRITICAL") {
    setTag(anomalyStatus, "CRITICAL EVENT", "critical");
  } else {
    setTag(anomalyStatus, "WARNING DETECTED", "warning");
  }

  const rows = anomalies.slice().reverse();

  if (rows.length === 0) {
    anomalyTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <span class="empty-icon">✓</span>
          No anomalies recorded. Monitoring is active.
        </td>
      </tr>
    `;
    return;
  }

  anomalyTableBody.innerHTML = rows
    .map((item) => {
      const severityClass =
        item.severity === "CRITICAL"
          ? "critical-text"
          : "warning-text";

      return `
        <tr>
          <td>${formatNumber(item.time)}</td>
          <td>${escapeHTML(item.sensor)}</td>
          <td>${escapeHTML(item.issue)}</td>
          <td class="${severityClass}">${escapeHTML(item.severity)}</td>
          <td>${escapeHTML(item.response)}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================
   VELOCITY CHART
========================================= */

function renderVelocityChart(): void {
  const canvas = velocityChart;
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const rect = canvas.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const width = rect.width;
  const height = rect.height;

  context.clearRect(0, 0, width, height);

  const padding = {
    left: 39,
    right: 13,
    top: 15,
    bottom: 27,
  };

  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);

  const points = velocityHistory.slice(-60);
  const maximumSpeed = Math.max(speedLimit, 1);
  const chartMaximum = Math.ceil(maximumSpeed / 5) * 5 || 5;

  context.font = '9px "DM Mono", monospace';
  context.textAlign = "right";
  context.textBaseline = "middle";

  // Horizontal grid lines and Y-axis labels.
  for (let i = 0; i <= 4; i++) {
    const fraction = i / 4;
    const y = padding.top + plotHeight * fraction;
    const labelValue = chartMaximum * (1 - fraction);

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);

    context.strokeStyle = "rgba(128, 147, 166, 0.14)";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#78889a";
    context.fillText(
      labelValue.toFixed(0),
      padding.left - 8,
      y
    );
  }

  // X-axis labels.
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#78889a";

  const firstTime = points[0]?.time ?? elapsed;
  const lastTime = points[points.length - 1]?.time ?? elapsed;

  for (let i = 0; i <= 4; i++) {
    const x = padding.left + (plotWidth * i) / 4;
    const labelTime = firstTime + ((lastTime - firstTime) * i) / 4;

    context.fillText(
      `${labelTime.toFixed(1)}s`,
      x,
      height - padding.bottom + 9
    );
  }

  if (points.length === 0) {
    context.fillStyle = "#78889a";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = '11px "Space Grotesk", sans-serif';
    context.fillText(
      "Start the journey to generate velocity data",
      padding.left + plotWidth / 2,
      padding.top + plotHeight / 2
    );
    return;
  }

  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? padding.left + plotWidth
        : padding.left + (plotWidth * index) / (points.length - 1);

    const normalizedSpeed = clamp(point.speed / chartMaximum, 0, 1);
    const y = padding.top + plotHeight * (1 - normalizedSpeed);

    return { x, y };
  });

  // Area fill under the curve.
  if (coordinates.length > 1) {
    const gradient = context.createLinearGradient(
      0,
      padding.top,
      0,
      padding.top + plotHeight
    );

    gradient.addColorStop(0, "rgba(84, 243, 226, 0.20)");
    gradient.addColorStop(1, "rgba(84, 243, 226, 0.005)");

    context.beginPath();
    context.moveTo(coordinates[0].x, padding.top + plotHeight);

    for (const point of coordinates) {
      context.lineTo(point.x, point.y);
    }

    context.lineTo(
      coordinates[coordinates.length - 1].x,
      padding.top + plotHeight
    );

    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  // Velocity line.
  context.beginPath();

  coordinates.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  context.strokeStyle = "#54f3e2";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = "rgba(84, 243, 226, 0.25)";
  context.shadowBlur = 7;
  context.stroke();
  context.shadowBlur = 0;

  // Highlight the latest point.
  const lastPoint = coordinates[coordinates.length - 1];

  context.beginPath();
  context.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
  context.fillStyle = "#54f3e2";
  context.fill();
}

/* =========================================
   SIMULATION PHYSICS
========================================= */

function simulationStep(dt: number): void {
  if (!running || emergencyStop || sensorFault || completed) {
    return;
  }

  elapsed += dt;

  const remaining = getRemainingDistance();
  const stoppingDistance = calculateStoppingDistance();

  // Begin braking before the pod reaches the stopping boundary.
  braking = remaining <= stoppingDistance + Math.max(speed * dt, 0.5);

  if (braking) {
    speed = Math.max(0, speed - MAX_BRAKING * dt);
  } else {
    speed = Math.min(speedLimit, speed + MAX_ACCELERATION * dt);
  }

  // Move the pod using its updated velocity.
  position = Math.min(routeLength, position + speed * dt);

  // Prevent negative or invalid state values.
  position = clamp(position, 0, routeLength);
  speed = clamp(speed, 0, speedLimit);

  const updatedRemaining = getRemainingDistance();

  // Complete the journey once the destination is reached.
  if (updatedRemaining <= 0.01) {
    position = routeLength;
    speed = 0;
    running = false;
    braking = false;
    completed = true;

    logEvent("Destination reached. Journey complete.");
    captureSensorSample();
    renderTelemetry();
    return;
  }

  // A pod that has stopped inside the route should not keep running.
  if (braking && speed <= 0.01 && updatedRemaining > 0.01) {
    speed = 0;
    running = false;
    braking = false;

    logEvent(
      "Pod stopped before destination. Review route and braking parameters.",
      "WARNING"
    );

    captureSensorSample();
    renderTelemetry();
    return;
  }

  sampleAccumulator += dt;

  if (sampleAccumulator >= SAMPLE_INTERVAL) {
    sampleAccumulator %= SAMPLE_INTERVAL;
    captureSensorSample();
  }

  renderTelemetry();
}

/* =========================================
   ANIMATION LOOP
========================================= */

function animationFrame(timestamp: number): void {
  if (lastFrameTime === 0) {
    lastFrameTime = timestamp;
  }

  const rawDt = (timestamp - lastFrameTime) / 1000;
  const dt = clamp(rawDt, 0, 0.1);

  lastFrameTime = timestamp;

  if (running) {
    simulationStep(dt);
  }

  requestAnimationFrame(animationFrame);
}

/* =========================================
   START / PAUSE / RESET
========================================= */

function startJourney(): void {
  if (running || emergencyStop || sensorFault || completed) {
    return;
  }

  if (getRemainingDistance() <= 0.01) {
    logEvent("No remaining route. Apply a new route configuration.", "WARNING");
    return;
  }

  running = true;
  braking = false;

  logEvent("Journey started. Telemetry collection active.");
  renderTelemetry();
}

function pauseJourney(): void {
  if (!running) {
    return;
  }

  running = false;
  braking = false;

  logEvent("Journey paused by operator.");
  renderTelemetry();
}

function resetSimulation(): void {
  running = false;
  braking = false;
  emergencyStop = false;
  sensorFault = false;
  completed = false;

  position = 0;
  speed = 0;
  elapsed = 0;
  sampleAccumulator = 0;

  velocityHistory = [];
  sensorSamples = [];
  anomalies = [];

  lastFrameTime = 0;

  renderSensorTable();
  renderAnomalies();
  captureSensorSample();
  renderTelemetry();

  logEvent("Simulation reset. Safety monitoring reinitialized.");
}

/* =========================================
   APPLY JOURNEY SETTINGS
========================================= */

function applySettings(): void {
  // Settings must not change while the pod is moving.
  if (running || speed > 0.001) {
    alert("Pause and stop the pod before changing journey settings.");
    return;
  }

  const requestedRouteLength = Number(routeLengthInput.value);
  const requestedSpeedLimit = Number(speedLimitInput.value);

  if (
    !Number.isFinite(requestedRouteLength) ||
    requestedRouteLength < MIN_ROUTE_LENGTH ||
    requestedRouteLength > MAX_ROUTE_LENGTH
  ) {
    alert(
      `Route length must be between ${MIN_ROUTE_LENGTH} and ${MAX_ROUTE_LENGTH} metres.`
    );
    routeLengthInput.focus();
    return;
  }

  if (
    !Number.isFinite(requestedSpeedLimit) ||
    requestedSpeedLimit < MIN_SPEED_LIMIT ||
    requestedSpeedLimit > MAX_SPEED_LIMIT
  ) {
    alert(
      `Speed limit must be between ${MIN_SPEED_LIMIT} and ${MAX_SPEED_LIMIT} m/s.`
    );
    speedLimitInput.focus();
    return;
  }

  const routeChanged = requestedRouteLength !== routeLength;
  const speedChanged = requestedSpeedLimit !== speedLimit;

  if (!routeChanged && !speedChanged) {
    logEvent("Configuration unchanged. No settings were modified.");
    return;
  }

  // Commit validated settings.
  routeLength = requestedRouteLength;
  speedLimit = requestedSpeedLimit;

  // Start a fresh route when applying a new configuration.
  position = 0;
  speed = 0;
  elapsed = 0;
  sampleAccumulator = 0;

  running = false;
  braking = false;
  emergencyStop = false;
  sensorFault = false;
  completed = false;

  velocityHistory = [];
  sensorSamples = [];
  anomalies = [];

  renderSensorTable();
  renderAnomalies();
  captureSensorSample();
  renderTelemetry();

  logEvent(
    `Configuration applied: route ${routeLength} m, speed limit ${speedLimit} m/s.`
  );

  // Ensure the chart reflects the new configuration.
  renderVelocityChart();
}

/* =========================================
   FAULT SIMULATION
========================================= */

function triggerSensorFault(): void {
  if (sensorFault || emergencyStop) {
    logEvent("A safety fault is already active. Reset before testing again.", "WARNING");
    return;
  }

  sensorFault = true;
  emergencyStop = true;
  running = false;
  braking = false;
  speed = 0;

  addAnomaly(
    "Position / velocity",
    "Simulated sensor fault",
    "CRITICAL",
    "Emergency stop activated"
  );

  logEvent(
    "Simulated sensor fault detected. Emergency stop activated.",
    "CRITICAL"
  );

  captureSensorSample();
  renderTelemetry();
}

function injectSensorAnomaly(): void {
  if (sensorFault || emergencyStop) {
    logEvent("Reset the active fault before injecting another anomaly.", "WARNING");
    return;
  }

  // A deliberately invalid reading for testing validation.
  const corruptedSpeed = -12;

  if (corruptedSpeed < 0 || corruptedSpeed > speedLimit) {
    sensorFault = true;
    emergencyStop = true;
    running = false;
    braking = false;
    speed = 0;

    addAnomaly(
      "Velocity",
      `Invalid speed reading (${corruptedSpeed} m/s)`,
      "CRITICAL",
      "Reading rejected; emergency stop activated"
    );

    logEvent(
      `Invalid velocity reading ${corruptedSpeed} m/s detected. Emergency stop activated.`,
      "CRITICAL"
    );

    captureSensorSample();
    renderTelemetry();
    return;
  }

  addAnomaly(
    "Velocity",
    "Unexpected velocity measurement",
    "WARNING",
    "Reading flagged for review"
  );

  logEvent("Velocity anomaly detected and flagged.", "WARNING");
  renderTelemetry();
}

/* =========================================
   CSV EXPORT
========================================= */

function exportSensorCSV(): void {
  if (sensorSamples.length === 0) {
    alert("There are no sensor samples to export yet.");
    return;
  }

  const header = [
    "Time (s)",
    "Position (m)",
    "Speed (m/s)",
    "Remaining distance (m)",
    "Stopping distance (m)",
    "Sensor health",
    "Braking status",
  ];

  const rows = sensorSamples.map((sample) => [
    sample.time.toFixed(2),
    sample.position.toFixed(2),
    sample.speed.toFixed(2),
    sample.remaining.toFixed(2),
    sample.stopping.toFixed(2),
    sample.health,
    sample.braking,
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "hyperloop-sensor-telemetry.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  logEvent(`Exported ${sensorSamples.length} telemetry samples to CSV.`);
}

/* =========================================
   CLEAR DATA ACTIONS
========================================= */

function clearSensorData(): void {
  sensorSamples = [];
  velocityHistory = [];

  renderSensorTable();
  renderVelocityChart();

  // Record a fresh sample to show the current state.
  captureSensorSample();

  logEvent("Sensor data history cleared.");
}

function clearEventLog(): void {
  eventLog.replaceChildren();

  logEvent("Event log cleared.");
}

/* =========================================
   BUTTON EVENT LISTENERS
========================================= */

startButton.addEventListener("click", startJourney);
pauseButton.addEventListener("click", pauseJourney);
resetButton.addEventListener("click", resetSimulation);

applySettingsButton.addEventListener("click", applySettings);

faultButton.addEventListener("click", triggerSensorFault);
anomalyButton.addEventListener("click", injectSensorAnomaly);

exportButton.addEventListener("click", exportSensorCSV);
clearSensorButton.addEventListener("click", clearSensorData);
clearLogButton.addEventListener("click", clearEventLog);

// Re-render the chart when the window size changes.
window.addEventListener("resize", renderVelocityChart);

// Validate and apply settings when Enter is pressed in either input.
routeLengthInput.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    applySettings();
  }
});

speedLimitInput.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    applySettings();
  }
});

/* =========================================
   INITIALIZE DASHBOARD
========================================= */

function initializeDashboard(): void {
  routeLengthInput.value = String(routeLength);
  speedLimitInput.value = String(speedLimit);

  renderSensorTable();
  renderAnomalies();
  captureSensorSample();
  renderTelemetry();

  logEvent("Hyperloop Control dashboard initialized.");
  logEvent("Telemetry monitoring is ready.");
  logEvent("Automatic braking simulation initialized.");

  requestAnimationFrame(animationFrame);
}

initializeDashboard();
