const APPS = [
  {
    name: "Excel Validation",
    description:
      "Validate uploaded Excel sheets for schema issues, and access lightweight data modelling utilities.",
    href: "https://excelvalidator.teagasc.net/",
    icon: "excel"
  }
];

const DEFAULT_CONFIG = {
  ideaRecipient: "TeagascICTResearchInnovationteam@teagasc.ie",
  ideaSubjectPrefix: "[Automation Idea]"
};

let PORTAL_CONFIG = { ...DEFAULT_CONFIG };

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const ICONS = {
  excel: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path d="M9 8h8M9 12h8M9 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.9" />
      <path d="M9 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.35" />
      <path
        d="M10.2 18.2l-1.6-2m1.6 0l-1.6 2"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.65"
      />
    </svg>
  `,
  default: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
  `
};

function supportsSvgFilterUrl() {
  const el = document.createElement("div");
  const values = ['url("#liquidGlassCard")', "url(#liquidGlassCard)"];

  for (const v of values) {
    el.style.filter = "";
    el.style.filter = v;
    if (String(el.style.filter).includes("url")) return true;
  }

  return false;
}

function buildLiquidDisplacementMapDataUrl({
  size = 256,
  bezel = 0.34,
  thickness = 0.18,
  ior = 1.5
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // Convex "squircle" bezel profile: y = 1 - (1 - x)^4
  const f = (x) => 1 - Math.pow(1 - x, 4);
  const fp = (x) => 4 * Math.pow(1 - x, 3);

  const norm2 = (x, y) => {
    const len = Math.hypot(x, y);
    if (!len) return [0, 0];
    return [x / len, y / len];
  };

  const displacementAt = (nx, ny) => {
    const r = Math.hypot(nx, ny);
    if (r <= 0 || r > 1) return [0, 0];

    const ux = nx / r;
    const uy = ny / r;

    // distanceFromSide (0 at border → 1 at end of bezel)
    const d = 1 - r;
    if (d <= 0 || d >= bezel) return [0, 0];

    const x = d / bezel; // 0..1
    const h = thickness * f(x);
    const slope = (thickness * fp(x)) / bezel;

    // Normal for surface y = h(x): n = (-dy/dx, 1), pointing upward (towards air)
    const [Nx, Ny] = norm2(-slope, 1);

    // Incoming ray orthogonal to background plane (no perspective): I = (0, -1)
    const Ix = 0;
    const Iy = -1;

    // Snell/Descartes: n1=1 (air), n2=ior (glass)
    const eta = 1 / ior;
    const cosi = -(Nx * Ix + Ny * Iy); // = Ny
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k <= 0) return [0, 0];

    const a = eta * cosi - Math.sqrt(k);
    const Tx = eta * Ix + a * Nx;
    const Ty = eta * Iy + a * Ny;
    if (Ty >= -1e-4) return [0, 0];

    // One refraction event: intersect refracted ray with background plane below surface.
    const dxLocal = h * (Tx / -Ty); // + inward (towards center)

    // Convert 1D displacement (radial) into 2D vector field (towards center = -u).
    return [-ux * dxLocal, -uy * dxLocal];
  };

  let maxMag = 0;
  for (let y = 0; y < size; y += 1) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const [dx, dy] = displacementAt(nx, ny);
      const mag = Math.hypot(dx, dy);
      if (mag > maxMag) maxMag = mag;
    }
  }
  if (maxMag < 1e-6) maxMag = 1;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  let i = 0;

  for (let y = 0; y < size; y += 1) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const [dx, dy] = displacementAt(nx, ny);
      const xn = clamp(dx / maxMag, -1, 1);
      const yn = clamp(dy / maxMag, -1, 1);

      // feDisplacementMap interprets channels as [-1..1] with 128 as neutral.
      data[i++] = Math.round(128 + xn * 127); // R (X)
      data[i++] = Math.round(128 + yn * 127); // G (Y)
      data[i++] = 128; // B ignored
      data[i++] = 255; // A opaque
    }
  }

  ctx.putImageData(img, 0, 0);

  // Our computation uses radius=1. SVG filter units are objectBoundingBox (width=1, diameter=2),
  // so convert radius-units into bbox-units by dividing by 2.
  const maxDisplacementBBox = maxMag / 2;

  return { href: canvas.toDataURL("image/png"), maxDisplacementBBox };
}

function setupSvgLiquidGlassBackdrop() {
  const map = document.getElementById("lg-map-card");
  if (!map) return;
  if (!supportsSvgFilterUrl()) return;

  try {
    const { href, maxDisplacementBBox } = buildLiquidDisplacementMapDataUrl();
    map.setAttribute("href", href);
    map.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);

    const disp = document.getElementById("lg-disp-card");
    if (disp) {
      const intensity = 4.0; // artistic control; based on max displacement normalization
      const scale = Math.max(0.006, Math.min(0.12, maxDisplacementBBox * intensity));
      disp.setAttribute("scale", String(scale));
    }

    document.documentElement.classList.add("has-liquid-glass");

    // Inline style uses the document as the base URL, so url(#id) resolves correctly even when CSS is external.
    document.querySelectorAll(".card__glass").forEach((el) => {
      el.style.filter = "url(#liquidGlassCard)";
      el.style.webkitFilter = "url(#liquidGlassCard)";
    });
  } catch {
    // Keep CSS blur fallback.
  }
}

function disableSvgFilterAnimationsIfReducedMotion() {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReduced) return;
  document.querySelectorAll("svg defs animate").forEach((el) => el.remove());
}

function iconSvg(name) {
  if (!name) return ICONS.default;
  return ICONS[name] || ICONS.default;
}

function renderApps() {
  const grid = $("appsGrid");
  grid.innerHTML = APPS.map((app) => {
    const name = escapeHtml(app.name);
    const desc = escapeHtml(app.description);
    const href = escapeHtml(app.href);
    const icon = iconSvg(app.icon);

    return `
      <article class="card" data-tilt>
        <div class="card__glass" aria-hidden="true"></div>
        <div class="card__inner">
          <div class="card__icon" aria-hidden="true">${icon}</div>
          <h3 class="card__title">${name}</h3>
          <p class="card__desc">${desc}</p>
          <div class="card__actions">
            <a class="btn btn--primary" href="${href}" target="_blank" rel="noreferrer noopener">
              Open app
            </a>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function setupScrollReveal() {
  const cards = Array.from(document.querySelectorAll(".card"));
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add("is-visible");
      }
    },
    { threshold: 0.12 }
  );
  cards.forEach((c) => obs.observe(c));
}

function setupParallaxBackground() {
  const root = document.documentElement;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  let raf = null;
  let mx = 0;
  let my = 0;
  let pxp = 50;
  let pyp = 30;

  root.style.setProperty("--mx", "0px");
  root.style.setProperty("--my", "0px");
  root.style.setProperty("--px", `${pxp}%`);
  root.style.setProperty("--py", `${pyp}%`);

  function onMove(ev) {
    const x = ev.clientX / window.innerWidth - 0.5;
    const y = ev.clientY / window.innerHeight - 0.5;
    mx = Math.round(x * 18);
    my = Math.round(y * 18);
    pxp = Math.round((x + 0.5) * 100);
    pyp = Math.round((y + 0.5) * 100);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      root.style.setProperty("--mx", `${mx}px`);
      root.style.setProperty("--my", `${my}px`);
      root.style.setProperty("--px", `${pxp}%`);
      root.style.setProperty("--py", `${pyp}%`);
    });
  }

  // window.addEventListener("pointermove", onMove, { passive: true });
}

function setupCardTilt() {
  const cards = Array.from(document.querySelectorAll("[data-tilt]"));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  for (const card of cards) {
    let raf = null;
    let rect = null;

    function readRect() {
      rect = card.getBoundingClientRect();
    }

    function onEnter() {
      readRect();
      card.style.willChange = "transform";
      card.style.setProperty("--hx", "50%");
      card.style.setProperty("--hy", "26%");
    }

    function onMove(ev) {
      if (!rect) readRect();
      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      const rx = (py - 0.5) * -7;
      const ry = (px - 0.5) * 9;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        card.style.setProperty("--hx", `${Math.round(px * 100)}%`);
        card.style.setProperty("--hy", `${Math.round(py * 100)}%`);
        card.style.transform = `translateY(0px) scale(1.02) perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
    }

    function onLeave() {
      rect = null;
      card.style.transform = "";
      card.style.willChange = "";
    }

    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", () => (rect = null), { passive: true });
  }
}

async function loadPortalConfig() {
  try {
    const resp = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!resp.ok) return;
    const json = await resp.json().catch(() => null);
    if (!json || !json.ok) return;

    if (typeof json.ideaRecipient === "string" && json.ideaRecipient.trim()) {
      PORTAL_CONFIG.ideaRecipient = json.ideaRecipient.trim();
    }
    if (typeof json.ideaSubjectPrefix === "string" && json.ideaSubjectPrefix.trim()) {
      PORTAL_CONFIG.ideaSubjectPrefix = json.ideaSubjectPrefix.trim();
    }
  } catch {
    // Ignore; defaults will be used.
  }
}

function buildMailto(payload) {
  const to = PORTAL_CONFIG.ideaRecipient || DEFAULT_CONFIG.ideaRecipient;
  const prefix = PORTAL_CONFIG.ideaSubjectPrefix || DEFAULT_CONFIG.ideaSubjectPrefix;
  const subjectUnit = payload.businessUnit ? `${payload.businessUnit} - ` : "";
  const subject = `${prefix} ${subjectUnit}${payload.title || "New idea"}`;
  const lines = [
    `Name: ${payload.name || ""}`,
    `Email: ${payload.email || ""}`,
    `Business unit: ${payload.businessUnit || ""}`,
    `Data sources: ${payload.dataSources || ""}`,
    `Expected benefits: ${payload.expectedBenefits || ""}`,
    "",
    "Title:",
    payload.title || "",
    "",
    "Description:",
    payload.description || ""
  ];
  const body = lines.join("\n").trim();
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function setupIdeaForm() {
  const form = $("ideaForm");
  if (!form) return;

  const status = $("formStatus");
  const submitBtn = $("submitBtn");
  const mailtoBtn = $("mailtoBtn");

  function setStatus(text, kind = "info") {
    if (!status) return;
    status.textContent = text;
    status.style.color =
      kind === "error" ? "rgba(255,255,255,0.78)" : kind === "ok" ? "rgba(255,255,255,0.88)" : "";
  }

  function readPayload() {
    const fd = new FormData(form);
    return {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      businessUnit: String(fd.get("businessUnit") || "").trim(),
      urgency: String(fd.get("urgency") || "").trim(),
      title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim(),
      dataSources: String(fd.get("dataSources") || "").trim(),
      expectedBenefits: String(fd.get("expectedBenefits") || "").trim()
    };
  }

  if (mailtoBtn) {
    mailtoBtn.addEventListener("click", () => {
      const payload = readPayload();
      window.location.href = buildMailto(payload);
    });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = readPayload();

    if (!payload.businessUnit || !payload.title || !payload.description) {
      setStatus("Please include business unit, title, and description.", "error");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }
    setStatus("Submitting...");

    try {
      const resp = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        const message = json.error || "Could not submit via server.";
        const details = json.details ? `\n\n${json.details}` : "";
        setStatus(`${message}${details}\n\nOpening an email draft instead...`, "error");
        window.location.href = buildMailto(payload);
        return;
      }

      form.reset();
      setStatus("Sent. Thank you - the team will review your idea.", "ok");
    } catch {
      setStatus("Network error. Opening an email draft instead...", "error");
      window.location.href = buildMailto(payload);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send idea";
      }
    }
  });
}

renderApps();
disableSvgFilterAnimationsIfReducedMotion();
setupSvgLiquidGlassBackdrop();
setupScrollReveal();
setupParallaxBackground();
setupCardTilt();
loadPortalConfig();
setupIdeaForm();
