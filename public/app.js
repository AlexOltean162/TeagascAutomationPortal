const APPS = [
  {
    name: "Excel Validation",
    description:
      "Validate uploaded Excel sheets for schema issues and use lightweight data modelling utilities.",
    href: "https://excelvalidator.teagasc.net/",
    icon: "excel",
    status: "Live tool"
  }
];

const DEFAULT_CONFIG = {
  ideaRecipient: "digital.innovations@teagasc.ie",
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
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path d="M9 8h8M9 12h8M9 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M9 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.35" />
    </svg>
  `,
  default: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5z"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path d="M8.5 10.5h7M8.5 13.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `
};

function iconSvg(name) {
  return ICONS[name] || ICONS.default;
}

function renderApps() {
  const grid = $("appsGrid");
  const appCount = $("appCount");
  if (!grid) return;

  grid.innerHTML = APPS.map((app) => {
    const name = escapeHtml(app.name);
    const desc = escapeHtml(app.description);
    const href = escapeHtml(app.href);
    const status = escapeHtml(app.status || "Available");

    return `
      <article class="card">
        <div class="card__inner">
          <div class="card__top">
            <div class="card__icon">${iconSvg(app.icon)}</div>
            <span class="card__tag">${status}</span>
          </div>
          <div>
            <h3 class="card__title">${name}</h3>
            <p class="card__desc">${desc}</p>
          </div>
          <div class="card__actions">
            <a class="btn btn--primary" href="${href}" target="_blank" rel="noreferrer noopener">
              Open tool
            </a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  if (appCount) {
    appCount.textContent = String(APPS.length);
  }
}

async function loadPortalConfig() {
  const ideaChannel = $("ideaChannel");

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

    if (!ideaChannel) return;

    ideaChannel.textContent = json.emailEnabled
      ? "Submissions are emailed directly to the Teagasc ICT Research & Innovation team."
      : "Email sending is unavailable on this server, so the form will open a draft email instead.";
  } catch {
    // Defaults are sufficient.
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
    `Priority: ${payload.urgency || ""}`,
    `Data sources: ${payload.dataSources || ""}`,
    `Expected benefits: ${payload.expectedBenefits || ""}`,
    "",
    "Title:",
    payload.title || "",
    "",
    "Description:",
    payload.description || ""
  ];

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join("\n").trim()
  )}`;
}

function setupIdeaForm() {
  const form = $("ideaForm");
  const status = $("formStatus");
  const submitBtn = $("submitBtn");
  if (!form || !status || !submitBtn) return;

  function setStatus(text, kind = "info") {
    status.textContent = text;
    status.style.color =
      kind === "error" ? "#8f2d2d" : kind === "ok" ? "#2f5833" : "";
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = readPayload();

    if (!payload.businessUnit || !payload.title || !payload.description) {
      setStatus("Please include business unit, title, and description.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
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
        setStatus(`${message} Opening an email draft instead...`, "error");
        window.location.href = buildMailto(payload);
        return;
      }

      form.reset();
      setStatus("Sent. The team will review your idea.", "ok");
    } catch {
      setStatus("Network error. Opening an email draft instead...", "error");
      window.location.href = buildMailto(payload);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send idea";
    }
  });
}

renderApps();
loadPortalConfig();
setupIdeaForm();
