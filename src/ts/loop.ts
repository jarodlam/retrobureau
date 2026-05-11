type PlayMode = "stopped" | "forward" | "sweep";

export class RadarLoop {
  private frames: HTMLImageElement[] = [];
  private currentFrame = 0;
  private playMode: PlayMode = "stopped";
  private direction: "forward" | "reverse" = "forward";
  private delay = 300;
  private delayStep = 50;
  private delayMin = 50;
  private delayMax = 4000;
  private dwellMultiplier = 3;
  private timeoutId: number | null = null;
  private animationEl: HTMLImageElement;
  private onFrameChange?: (
    index: number,
    total: number,
    timestamp: string,
  ) => void;

  constructor(animationEl: HTMLImageElement) {
    this.animationEl = animationEl;
  }

  setFrameChangeCallback(
    cb: (index: number, total: number, timestamp: string) => void,
  ) {
    this.onFrameChange = cb;
  }

  private onLoadProgress?: () => void;

  setLoadProgressCallback(cb: () => void) {
    this.onLoadProgress = cb;
  }

  loadFrames(urls: string[]): Promise<void> {
    return new Promise((resolve) => {
      let loaded = 0;
      this.frames = urls.map((url) => {
        const img = new Image();
        img.onload = () => {
          loaded++;
          if (this.onLoadProgress) this.onLoadProgress();
          if (loaded === urls.length) resolve();
        };
        img.onerror = () => {
          loaded++;
          if (this.onLoadProgress) this.onLoadProgress();
          if (loaded === urls.length) resolve();
        };
        img.src = url;
        return img;
      });
    });
  }


  private displayFrame() {
    if (this.frames.length === 0) return;
    const frame = this.frames[this.currentFrame];
    if (frame.complete && frame.naturalWidth > 0) {
      this.animationEl.src = frame.src;
    }
    if (this.onFrameChange) {
      const timestamp = this.extractTimestamp(frame.src);
      this.onFrameChange(this.currentFrame, this.frames.length, timestamp);
    }
  }

  private extractTimestamp(url: string): string {
    // URL like /radar/IDR023.T.202605110024.png
    const match = url.match(/\.T\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.png/);
    if (!match) return "";
    const [, year, month, day, hour, min] = match;
    // Convert UTC to local display
    const utcDate = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
      ),
    );
    return utcDate.toLocaleString("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZoneName: "short",
    });
  }

  private scheduleNext() {
    if (this.playMode === "stopped") return;

    const isLastFrame = this.currentFrame === this.frames.length - 1;
    const isFirstFrame = this.currentFrame === 0;
    const actualDelay =
      (isLastFrame && this.direction === "forward") ||
      (isFirstFrame && this.direction === "reverse")
        ? this.delay * this.dwellMultiplier
        : this.delay;

    this.timeoutId = window.setTimeout(() => {
      this.advanceFrame();
      this.displayFrame();
      this.scheduleNext();
    }, actualDelay);
  }

  private advanceFrame() {
    if (this.playMode === "forward") {
      this.currentFrame++;
      if (this.currentFrame >= this.frames.length) {
        this.currentFrame = 0;
      }
    } else if (this.playMode === "sweep") {
      if (this.direction === "forward") {
        this.currentFrame++;
        if (this.currentFrame >= this.frames.length) {
          this.currentFrame = this.frames.length - 2;
          this.direction = "reverse";
        }
      } else {
        this.currentFrame--;
        if (this.currentFrame < 0) {
          this.currentFrame = 1;
          this.direction = "forward";
        }
      }
    }
  }

  play() {
    this.stop();
    this.playMode = "forward";
    this.direction = "forward";
    this.displayFrame();
    this.scheduleNext();
  }

  sweep() {
    this.stop();
    this.playMode = "sweep";
    this.direction = "forward";
    this.displayFrame();
    this.scheduleNext();
  }

  stop() {
    this.playMode = "stopped";
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  stepForward() {
    this.stop();
    this.currentFrame++;
    if (this.currentFrame >= this.frames.length) {
      this.currentFrame = 0;
    }
    this.displayFrame();
  }

  stepBack() {
    this.stop();
    this.currentFrame--;
    if (this.currentFrame < 0) {
      this.currentFrame = this.frames.length - 1;
    }
    this.displayFrame();
  }

  slower() {
    this.delay = Math.min(this.delay + this.delayStep, this.delayMax);
  }

  faster() {
    this.delay = Math.max(this.delay - this.delayStep, this.delayMin);
  }

}
