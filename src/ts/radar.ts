import { RadarLoop } from "./loop";
import { OverlayManager } from "./overlays";
import { findSiteById, getSizeProducts } from "./sites";

const BOM_BASE = "https://reg.bom.gov.au";

interface RadarConfig {
  siteId: string;
  km: number;
  productId: string;
  lat: number;
  lon: number;
  name: string;
}

function parseQueryParams(): RadarConfig {
  const params = new URLSearchParams(window.location.search);
  const siteParam = params.get("site") || "02";
  const kmParam = parseInt(params.get("km") || "128", 10);

  // National radar
  if (siteParam === "national") {
    return {
      siteId: "national",
      km: 2150,
      productId: "IDR00004",
      lat: -27.0,
      lon: 133.5,
      name: "National",
    };
  }

  const site = findSiteById(siteParam);
  if (!site) {
    // Fallback to Melbourne
    return {
      siteId: "02",
      km: 128,
      productId: "IDR023",
      lat: -37.852,
      lon: 144.757,
      name: "Melbourne",
    };
  }

  const sizes = getSizeProducts(site.id);
  const validKm =
    [64, 128, 256, 512].includes(kmParam) && kmParam in sizes ? kmParam : 128;
  const productId = sizes[validKm];

  return {
    siteId: site.id,
    km: validKm,
    productId,
    lat: site.lat,
    lon: site.lon,
    name: site.name,
  };
}

function updateSizeLinks(config: RadarConfig) {
  const sizes = getSizeProducts(config.siteId);
  const allSizes = [64, 128, 256, 512];

  for (const km of allSizes) {
    const el = document.getElementById(`link-${km}`);
    if (!el) continue;

    if (!(km in sizes)) {
      // Size not available for this site
      el.style.display = "none";
    } else if (km === config.km) {
      el.removeAttribute("href");
      el.style.fontWeight = "bold";
      el.style.textDecoration = "none";
      el.style.color = "#000";
    } else {
      el.setAttribute("href", `radar.html?site=${config.siteId}&km=${km}`);
      el.style.fontWeight = "";
      el.style.textDecoration = "";
      el.style.color = "";
    }
  }

  const nationalLink = document.getElementById("link-national");
  if (nationalLink) {
    nationalLink.setAttribute("href", "radar.html?site=national");
  }
}

interface DiscoverResult {
  frames: string[];
  satFrames: string[];
}

async function discoverFrames(productId: string): Promise<DiscoverResult> {
  const frames = await probeFrames(productId);

  // For national, derive satellite URLs from radar frame timestamps
  // Satellite is at xx30 of the same hour as radar
  let satFrames: string[] = [];
  if (productId === "IDR00004" && frames.length > 0) {
    satFrames = frames
      .map((url) => {
        const match = url.match(
          /\.T\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.png/,
        );
        if (!match) return "";
        const [, year, month, day, hour] = match;
        return `${BOM_BASE}/gms/IDE00135.radar.${year}${month}${day}${hour}30.jpg`;
      })
      .filter((u) => u.length > 0);
  }

  return { frames, satFrames };
}

function preloadImages(
  urls: string[],
  onEach?: () => void,
): Promise<HTMLImageElement[]> {
  return new Promise((resolve) => {
    let loaded = 0;
    const images = urls.map((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (onEach) onEach();
        if (loaded === urls.length) resolve(images);
      };
      img.src = url;
      return img;
    });
  });
}

function formatTimestamp(t: Date): string {
  return (
    t.getUTCFullYear().toString() +
    String(t.getUTCMonth() + 1).padStart(2, "0") +
    String(t.getUTCDate()).padStart(2, "0") +
    String(t.getUTCHours()).padStart(2, "0") +
    String(t.getUTCMinutes()).padStart(2, "0")
  );
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function probeFrames(productId: string): Promise<string[]> {
  const now = new Date();
  const isNational = productId.startsWith("IDR000");
  const lookbackMinutes = isNational ? 360 : 50;

  // Step 1: Find the most recent frame by probing every minute from now backwards
  let firstHitTs: Date | null = null;
  for (let i = 0; i <= lookbackMinutes; i++) {
    const t = new Date(now.getTime() - i * 60 * 1000);
    const ts = formatTimestamp(t);
    const url = `${BOM_BASE}/radar/${productId}.T.${ts}.png`;
    if (await probeImage(url)) {
      firstHitTs = t;
      break;
    }
  }

  if (!firstHitTs) return [];

  // Step 2: From the first hit, go back in ~interval steps to find more frames
  const interval = isNational ? 60 : 5;
  const frameCount = isNational ? 4 : 7;
  const valid: string[] = [];

  for (let f = 0; f < frameCount; f++) {
    const approxTime = new Date(firstHitTs.getTime() - f * interval * 60 * 1000);
    // Probe a few minutes around the expected time
    let found = false;
    for (let offset = 0; offset <= 5; offset++) {
      for (const dir of [0, -1, 1]) {
        const t = new Date(approxTime.getTime() + (offset * dir) * 60 * 1000);
        const ts = formatTimestamp(t);
        const url = `${BOM_BASE}/radar/${productId}.T.${ts}.png`;
        if (await probeImage(url)) {
          valid.push(url);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  valid.sort();
  return valid;
}

async function init() {
  const config = parseQueryParams();

  // Update page title
  const titleText = `${config.km} km ${config.name} Radar Loop`;
  document.title = titleText;
  const titleEl = document.getElementById("radar-title");
  if (titleEl) titleEl.textContent = titleText;

  // Update size links
  updateSizeLinks(config);

  // Hide radar size row for national
  if (config.siteId === "national") {
    const linksRow = document.querySelector(".tabs-bar .links") as HTMLElement;
    if (linksRow) linksRow.style.display = "none";
  }

  // Setup overlay manager
  const overlayContainer = document.getElementById("overlay")!;
  const animationEl = document.getElementById("animation") as HTMLImageElement;
  const overlayManager = new OverlayManager(overlayContainer, config.productId);

  // Set animation image z-index
  animationEl.style.zIndex = "10";

  // Progress tracking
  const progressWrap = document.getElementById("loading-progress-wrap");
  const progressBar = document.getElementById(
    "loading-progress-bar",
  ) as HTMLProgressElement | null;
  const progressText = document.getElementById("loading-progress-text");
  let totalLoaded = 0;
  let totalExpected = 0;

  function updateProgress() {
    totalLoaded++;
    if (progressText)
      progressText.textContent = `${totalLoaded} / ${totalExpected}`;
    if (progressBar) progressBar.value = (totalLoaded / totalExpected) * 100;
  }

  overlayManager.setProgressCallback(() => updateProgress());

  // Discover frames first to know total count
  const { frames: frameUrls, satFrames } = await discoverFrames(
    config.productId,
  );

  if (frameUrls.length === 0) {
    const loadingEl = document.getElementById("loading-indicator");
    if (loadingEl) loadingEl.textContent = "No radar data available";
    return;
  }

  // National radar has no separate transparency layers but uses satellite bg
  const isNational = config.siteId === "national";
  const defaultLayers = isNational
    ? []
    : ["background", "topography", "locations", "range"];
  const layerCount = isNational ? 1 : defaultLayers.length + 1; // +1 for legend
  const satCount = satFrames.length > 0 ? satFrames.length : 0;
  totalExpected = layerCount + frameUrls.length + satCount;
  if (progressBar) progressBar.value = 0;
  if (progressText) progressText.textContent = `0 / ${totalExpected}`;

  // Load layers with progress
  if (isNational) {
    // National still needs the legend
    overlayManager.addToTotal(1);
    await overlayManager.loadInitialLayers([]);
  } else {
    overlayManager.addToTotal(layerCount);
    await overlayManager.loadInitialLayers(defaultLayers);
  }

  // For national, preload satellite images and show first as background
  let satImages: HTMLImageElement[] = [];
  if (satFrames.length > 0) {
    satImages = (await preloadImages(satFrames, updateProgress)).filter(
      (img) => img.naturalWidth > 0,
    );
    if (satImages.length > 0) {
      const satEl = document.createElement("img");
      satEl.id = "satellite-bg";
      satEl.className = "animation";
      satEl.style.zIndex = "5";
      satEl.src = satImages[0].src;
      const imagesContainer = document.getElementById("overlay-images")!;
      imagesContainer.insertBefore(satEl, imagesContainer.firstChild);
    }
  }

  // Setup animation loop with progress
  const loop = new RadarLoop(animationEl);
  loop.setLoadProgressCallback(() => updateProgress());

  // For national, sync satellite with radar frames
  if (satImages.length > 0) {
    loop.setFrameChangeCallback((index, _total, _timestamp) => {
      const satEl = document.getElementById("satellite-bg") as HTMLImageElement;
      if (satEl && satImages[index]) {
        satEl.src = satImages[index].src;
      }
    });
  }

  await loop.loadFrames(frameUrls);

  // Hide loading indicator, show radar
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) loadingEl.classList.add("hidden");
  loop.play();

  // Setup map feature checkboxes
  if (isNational) {
    setupNationalFeatures(overlayManager, animationEl);
  } else {
    setupMapFeatures(overlayManager);
  }

  // Setup control buttons
  document
    .getElementById("btn-sweep")
    ?.addEventListener("click", () => loop.sweep());
  document
    .getElementById("btn-back")
    ?.addEventListener("click", () => loop.stepBack());
  document
    .getElementById("btn-fwd")
    ?.addEventListener("click", () => loop.stepForward());
  document
    .getElementById("btn-play")
    ?.addEventListener("click", () => loop.play());
  document
    .getElementById("btn-slower")
    ?.addEventListener("click", () => loop.slower());
  document
    .getElementById("btn-faster")
    ?.addEventListener("click", () => loop.faster());
  document
    .getElementById("btn-stop")
    ?.addEventListener("click", () => loop.stop());

  // Refresh frames every 5 minutes
  setInterval(async () => {
    const { frames: newFrameUrls } = await discoverFrames(config.productId);
    if (newFrameUrls.length > 0) {
      const wasPlaying = loop.isPlaying;
      loop.stop();
      await loop.loadFrames(newFrameUrls);
      if (wasPlaying) loop.play();
    }
    // Refresh observations if enabled
    if (overlayManager.hasLayer("observations")) {
      overlayManager.hideLayer("observations");
      overlayManager.showLayer("observations");
    }
  }, 5 * 60 * 1000);
}

function setupMapFeatures(overlayManager: OverlayManager) {
  const featureCheckboxes = [
    "observations",
    "locations",
    "range",
    "topography",
    "waterways",
    "catchments",
    "wthrDistricts",
    "roads",
    "rail",
  ];

  for (const name of featureCheckboxes) {
    const checkbox = document.getElementById(
      `feat-${name}`,
    ) as HTMLInputElement | null;
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        overlayManager.toggleLayer(name, checkbox.checked);
      });
    }
  }

  document.getElementById("btn-hide-all")?.addEventListener("click", () => {
    overlayManager.hideAll();
    for (const name of featureCheckboxes) {
      const cb = document.getElementById(
        `feat-${name}`,
      ) as HTMLInputElement | null;
      if (cb) cb.checked = false;
    }
  });

  document.getElementById("btn-show-all")?.addEventListener("click", () => {
    overlayManager.showAll();
    for (const name of featureCheckboxes) {
      if (name === "observations") continue;
      const cb = document.getElementById(
        `feat-${name}`,
      ) as HTMLInputElement | null;
      if (cb) cb.checked = true;
    }
  });

  document
    .getElementById("btn-reset-features")
    ?.addEventListener("click", () => {
      const defaults = ["locations", "range", "topography"];
      for (const name of featureCheckboxes) {
        const cb = document.getElementById(
          `feat-${name}`,
        ) as HTMLInputElement | null;
        if (cb) {
          const shouldCheck = defaults.includes(name);
          cb.checked = shouldCheck;
          overlayManager.toggleLayer(name, shouldCheck);
        }
      }
    });
}

function setupNationalFeatures(
  overlayManager: OverlayManager,
  animationEl: HTMLImageElement,
) {
  const NATIONAL_OVERLAY_ID = "IDE00035";
  const featuresContainer = document.querySelector(
    "#tog table#map-features tbody",
  )!;

  // Replace checkboxes with national-specific ones
  featuresContainer.innerHTML = `
    <tr>
      <td class="label"><label><input type="checkbox" id="feat-nat-radar" checked>Radar</label></td>
      <td class="label"><label><input type="checkbox" id="feat-nat-satellite" checked>Satellite</label></td>
    </tr>
    <tr>
      <td class="label"><label><input type="checkbox" id="feat-nat-locations" checked>Locations</label></td>
      <td class="label"><label><input type="checkbox" id="feat-nat-place-names">Place Names</label></td>
    </tr>
    <tr>
      <td class="label"><label><input type="checkbox" id="feat-nat-optimal-coverage">Optimal Coverage</label></td>
      <td class="label">&nbsp;</td>
    </tr>
  `;

  // Show default layers
  overlayManager.showLayer("locations", NATIONAL_OVERLAY_ID);

  // Radar toggle shows/hides the radar animation
  document
    .getElementById("feat-nat-radar")
    ?.addEventListener("change", (e) => {
      animationEl.style.visibility = (e.target as HTMLInputElement).checked
        ? "visible"
        : "hidden";
    });

  // Satellite toggle shows/hides the satellite background
  document
    .getElementById("feat-nat-satellite")
    ?.addEventListener("change", (e) => {
      const satEl = document.getElementById("satellite-bg");
      if (satEl)
        satEl.style.visibility = (e.target as HTMLInputElement).checked
          ? "visible"
          : "hidden";
    });

  // Locations
  document
    .getElementById("feat-nat-locations")
    ?.addEventListener("change", (e) => {
      overlayManager.toggleLayer(
        "locations",
        (e.target as HTMLInputElement).checked,
      );
    });

  // Place Names
  document
    .getElementById("feat-nat-place-names")
    ?.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).checked) {
        overlayManager.showLayer("place-names", NATIONAL_OVERLAY_ID);
      } else {
        overlayManager.hideLayer("place-names");
      }
    });

  // Optimal Coverage
  document
    .getElementById("feat-nat-optimal-coverage")
    ?.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).checked) {
        overlayManager.showLayer("optimal-coverage", NATIONAL_OVERLAY_ID);
      } else {
        overlayManager.hideLayer("optimal-coverage");
      }
    });
}

init();
