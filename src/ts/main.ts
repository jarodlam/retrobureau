// Scale image map areas when the map image is resized
function scaleImageMap() {
  const img = document.querySelector(
    '#aus-radar-map img',
  ) as HTMLImageElement | null;
  const map = document.querySelector(
    'map[name="m_australia-radar-map"]',
  ) as HTMLMapElement | null;
  if (!img || !map) return;

  const naturalWidth = img.naturalWidth || 589;
  const naturalHeight = img.naturalHeight || 414;

  // Store original coords on first run
  const areas = map.querySelectorAll("area");
  areas.forEach((area) => {
    if (!area.dataset.originalCoords) {
      area.dataset.originalCoords = area.getAttribute("coords") || "";
    }
  });

  function resize() {
    const scaleX = img!.clientWidth / naturalWidth;
    const scaleY = img!.clientHeight / naturalHeight;

    areas.forEach((area) => {
      const original = area.dataset.originalCoords || "";
      const scaled = original
        .split(",")
        .map((v) => Math.round(parseInt(v.trim()) * scaleX))
        .join(",");
      area.setAttribute("coords", scaled);
    });
  }

  // Run on load and resize
  if (img.complete) {
    resize();
  } else {
    img.addEventListener("load", resize);
  }
  window.addEventListener("resize", resize);
}

scaleImageMap();
