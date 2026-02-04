const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.set("trust proxy", true);

function envBool(name, defaultValue = false) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return defaultValue;
}

function envInt(name, defaultValue) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function resolveSmtpPort({ secure, portRaw, hasAuth }) {
  const raw = String(portRaw || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (secure) return 465;
  return hasAuth ? 587 : 25;
}

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIR = path.join(__dirname, "public");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self' https://excelvalidator.teagasc.net"
    ].join("; ")
  );
  next();
});

app.use(express.json({ limit: "64kb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// Optional CORS for hosting frontend separately
const corsOrigin = (process.env.CORS_ORIGIN || "").trim();
if (corsOrigin) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.ip || "unknown";
}

// Simple in-memory rate limiting (best-effort; replace with a proper store in prod)
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const rate = new Map(); // ip -> { windowStart, count }

function rateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rate.set(ip, { windowStart: now, count: 1 });
    return next();
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return res.status(429).json({
      ok: false,
      error: "Too many submissions. Please try again in a minute."
    });
  }
  entry.count += 1;
  return next();
}

function isEmailish(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clean(value, maxLen) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function smtpConfigured() {
  const host = (process.env.SMTP_HOST || "").trim();
  if (!host) return { ok: false, error: "Missing SMTP_HOST." };

  const secure = envBool("SMTP_SECURE", false);
  const port = resolveSmtpPort({
    secure,
    portRaw: process.env.SMTP_PORT,
    hasAuth: Boolean((process.env.SMTP_USER || "").trim())
  });

  if (!Number.isFinite(port) || port <= 0 || port >= 65536) {
    return { ok: false, error: "Invalid SMTP_PORT." };
  }

  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();

  if ((user && !pass) || (!user && pass)) {
    return { ok: false, error: "SMTP_USER and SMTP_PASS must be set together (or both left blank)." };
  }

  return { ok: true, host, port, secure, hasAuth: Boolean(user) };
}

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const hasAuth = Boolean(user && pass);

  const secure = envBool("SMTP_SECURE", false);
  const port = resolveSmtpPort({
    secure,
    portRaw: process.env.SMTP_PORT,
    hasAuth
  });

  const smtpIgnoreTls = envBool("SMTP_IGNORE_TLS", false);
  const smtpRequireTls = envBool("SMTP_REQUIRE_TLS", false);
  const smtpTlsRejectUnauthorized = envBool("SMTP_TLS_REJECT_UNAUTHORIZED", true);
  const smtpDebug = envBool("SMTP_DEBUG", false);
  const smtpLogger = envBool("SMTP_LOGGER", false);

  const transportOptions = {
    host,
    port,
    secure,
    ignoreTLS: smtpIgnoreTls,
    requireTLS: smtpRequireTls,
    connectionTimeout: envInt("SMTP_CONNECTION_TIMEOUT", 120000),
    greetingTimeout: envInt("SMTP_GREETING_TIMEOUT", 30000),
    socketTimeout: envInt("SMTP_SOCKET_TIMEOUT", 600000),
    dnsTimeout: envInt("SMTP_DNS_TIMEOUT", 30000),
    logger: smtpLogger,
    debug: smtpDebug,
    tls: {
      rejectUnauthorized: smtpTlsRejectUnauthorized
    }
  };

  if (hasAuth) {
    transportOptions.auth = { user, pass };
  }

  cachedTransporter = nodemailer.createTransport(transportOptions);
  return cachedTransporter;
}

function safeSmtpErrorDetails(err) {
  const message = String(err?.message || err || "");
  const code = err?.code ? String(err.code) : "";
  const command = err?.command ? String(err.command) : "";
  const response = err?.response ? String(err.response) : "";
  const responseCode = err?.responseCode ? String(err.responseCode) : "";
  const parts = [
    message ? `message=${message}` : null,
    code ? `code=${code}` : null,
    command ? `command=${command}` : null,
    responseCode ? `responseCode=${responseCode}` : null,
    response ? `response=${response}` : null
  ].filter(Boolean);
  return parts.join(" | ");
}

app.get("/api/config", (req, res) => {
  return res.json({
    ok: true,
    ideaRecipient: (process.env.IDEA_RECIPIENT || "TeagascICTResearchInnovationteam@teagasc.ie").trim(),
    ideaSubjectPrefix: (process.env.IDEA_SUBJECT_PREFIX || "[Automation Idea]").trim(),
    emailEnabled: smtpConfigured().ok
  });
});

app.post("/api/ideas", rateLimit, async (req, res) => {
  const smtp = smtpConfigured();
  if (!smtp.ok) {
    return res.status(503).json({
      ok: false,
      error: `Email is not configured on this server (${smtp.error})`
    });
  }

  const name = clean(req.body?.name, 80);
  const email = clean(req.body?.email, 120);
  const businessUnit = clean(req.body?.businessUnit, 120);
  const title = clean(req.body?.title, 120);
  const description = clean(req.body?.description, 5000);
  const dataSources = clean(req.body?.dataSources, 500);
  const expectedBenefits = clean(req.body?.expectedBenefits, 500);
  const urgency = clean(req.body?.urgency, 40);

  if (!title || !description) {
    return res.status(400).json({
      ok: false,
      error: "Please include an idea title and description."
    });
  }

  if (email && !isEmailish(email)) {
    return res.status(400).json({
      ok: false,
      error: "Email address looks invalid."
    });
  }

  const to = (process.env.IDEA_RECIPIENT || "TeagascICTResearchInnovationteam@teagasc.ie").trim();
  const from = (process.env.SMTP_FROM || "Teagasc Automation Portal <no-reply@teagasc.ie>").trim();
  const prefix = (process.env.IDEA_SUBJECT_PREFIX || "[Automation Idea]").trim();

  const meta = [
    `Submitted: ${new Date().toISOString()}`,
    `IP: ${getClientIp(req)}`,
    name ? `Name: ${name}` : null,
    email ? `Email: ${email}` : null,
    businessUnit ? `Business unit: ${businessUnit}` : null,
    urgency ? `Urgency: ${urgency}` : null,
    dataSources ? `Data sources: ${dataSources}` : null,
    expectedBenefits ? `Expected benefits: ${expectedBenefits}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const text = `${meta}\n\n---\n\nTitle: ${title}\n\n${description}\n`;

  const includeDetails = envBool("SMTP_DEBUG", false) || process.env.NODE_ENV !== "production";

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from,
      to,
      replyTo: email || undefined,
      subject: `${prefix} ${title}`,
      text
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("SMTP send failed:", safeSmtpErrorDetails(err));
    return res.status(502).json({
      ok: false,
      error: "Failed to send email.",
      details: includeDetails ? safeSmtpErrorDetails(err) : undefined
    });
  }
});

// SPA-ish fallback (serve index for unknown routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Automation Portal running on http://localhost:${PORT}`);

  const shouldVerify = envBool("SMTP_DEBUG", false) || envBool("SMTP_VERIFY_ON_START", false);
  const smtp = smtpConfigured();
  if (shouldVerify && smtp.ok) {
    getTransporter()
      .verify()
      .then(() => console.log("SMTP verified: server is ready to accept messages."))
      .catch((err) => console.error("SMTP verify failed:", safeSmtpErrorDetails(err)));
  }
});
