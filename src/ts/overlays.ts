export interface OverlayConfig {
  name: string;
  zIndex: number;
}

// Layer ordering (lower z = behind, higher z = in front)
// Background and topography go behind the radar; others go on top
const LAYER_CONFIG: Record<string, OverlayConfig> = {
  background: { name: "background", zIndex: 1 },
  topography: { name: "topography", zIndex: 2 },
  waterways: { name: "waterways", zIndex: 3 },
  // Radar animation is at zIndex 10
  range: { name: "range", zIndex: 20 },
  catchments: { name: "catchments", zIndex: 21 },
  wthrDistricts: { name: "wthrDistricts", zIndex: 22 },
  roads: { name: "roads", zIndex: 23 },
  rail: { name: "rail", zIndex: 24 },
  locations: { name: "locations", zIndex: 25 },
  observations: { name: "observations", zIndex: 26 },
  // National-specific layers
  "place-names": { name: "place-names", zIndex: 25 },
  "optimal-coverage": { name: "optimal-coverage", zIndex: 21 },
};

export class OverlayManager {
  private container: HTMLElement;
  private imagesContainer: HTMLElement;
  private productId: string; // e.g. "IDR023"
  private layers: Map<string, HTMLDivElement> = new Map();
  private overlayPath: string;
  private onProgress?: (loaded: number, total: number) => void;
  private totalAssets = 0;
  private loadedAssets = 0;

  constructor(container: HTMLElement, productId: string) {
    this.container = container;
    this.imagesContainer =
      container.querySelector("#overlay-images") || container;
    this.productId = productId;
    this.overlayPath = "https://reg.bom.gov.au/products/radar_transparencies/";
  }

  setProgressCallback(cb: (loaded: number, total: number) => void) {
    this.onProgress = cb;
  }

  private trackLoad() {
    this.loadedAssets++;
    if (this.onProgress) this.onProgress(this.loadedAssets, this.totalAssets);
  }

  addToTotal(count: number) {
    this.totalAssets += count;
  }

  loadInitialLayers(layerNames: string[]): Promise<void> {
    this.totalAssets += layerNames.length + 1; // +1 for legend
    this.setupLegend();
    for (const name of layerNames) {
      this.showLayer(name);
    }
    return this.waitForLayers();
  }

  private waitForLayers(): Promise<void> {
    // Preload all layer images
    const urls: string[] = [];
    for (const [, div] of this.layers) {
      const bg = div.style.backgroundImage;
      const match = bg.match(/url\("(.+)"\)/);
      if (match) urls.push(match[1]);
    }
    // Also legend
    const legendDiv = this.imagesContainer.querySelector(".legend") as HTMLElement;
    if (legendDiv) {
      const bg = legendDiv.style.backgroundImage;
      const match = bg.match(/url\("(.+)"\)/);
      if (match) urls.push(match[1]);
    }

    return new Promise((resolve) => {
      if (urls.length === 0) {
        resolve();
        return;
      }
      let done = 0;
      urls.forEach((url) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          done++;
          this.trackLoad();
          if (done === urls.length) resolve();
        };
        img.src = url;
      });
    });
  }

  private setupLegend() {
    // Legend is a 512x557 transparency — overlay it on the images container
    // z-index between background and radar animation so it doesn't cover the timestamp
    const div = document.createElement("div");
    div.className = "layer-div legend";
    div.style.backgroundImage = `url("${this.overlayPath}IDR.legend.0.png")`;
    div.style.zIndex = "5";
    this.imagesContainer.appendChild(div);
  }


  showLayer(name: string, overrideProductId?: string) {
    if (this.layers.has(name)) return;

    const config = LAYER_CONFIG[name];
    if (!config) return;

    const pid = overrideProductId || this.productId;
    const div = document.createElement("div");
    div.className = "layer-div";
    div.id = `${name}Div`;
    div.style.zIndex = String(config.zIndex);
    div.style.backgroundImage = `url("${this.overlayPath}${pid}.${name}.png")`;
    this.imagesContainer.appendChild(div);
    this.layers.set(name, div);
  }

  hideLayer(name: string) {
    const div = this.layers.get(name);
    if (div) {
      div.remove();
      this.layers.delete(name);
    }
  }

  toggleLayer(name: string, visible: boolean) {
    if (visible) {
      this.showLayer(name);
    } else {
      this.hideLayer(name);
    }
  }

  hideAll() {
    for (const [name] of this.layers) {
      if (name !== "background") {
        this.hideLayer(name);
      }
    }
  }

  showAll() {
    for (const name of Object.keys(LAYER_CONFIG)) {
      if (name !== "observations") {
        // observations needs special handling
        this.showLayer(name);
      }
    }
  }
}
