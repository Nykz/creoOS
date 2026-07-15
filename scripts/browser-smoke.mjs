import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createAdminClient } from "@insforge/sdk";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const mode = process.env.SMOKE_EMAIL ? "sign-in" : "sign-up";
const onboardingAction = process.env.SMOKE_ONBOARDING_ACTION ?? "create-company";
const email = process.env.SMOKE_EMAIL ?? `creoos-browser-${Date.now()}@example.com`;
const companyName = `CreoOS Smoke Studio ${Date.now()}`;
const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const password = process.env.SMOKE_PASSWORD ?? "SecurePass1234";
const chromeBase = "http://127.0.0.1:9222";

function parseSetCookie(cookie) {
  const [nameValue, ...attributes] = cookie.split(";").map((part) => part.trim());
  const index = nameValue.indexOf("=");
  const parsed = {
    name: nameValue.slice(0, index),
    value: decodeURIComponent(nameValue.slice(index + 1)),
    path: "/",
    httpOnly: false,
    secure: baseUrl.startsWith("https://"),
  };
  for (const attribute of attributes) {
    const [rawKey, rawValue] = attribute.split("=");
    const key = rawKey.toLowerCase();
    if (key === "path" && rawValue) parsed.path = rawValue;
    if (key === "httponly") parsed.httpOnly = true;
    if (key === "secure") parsed.secure = true;
  }
  return parsed;
}

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function openTarget(url) {
  const response = await fetch(`${chromeBase}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open Chrome target: ${response.status}`);
  return response.json();
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message));
      else resolve(payload.result ?? {});
      return;
    }
    if (payload.method) events.push(payload);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}

async function waitFor(client, predicate, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function waitForPageExpression(client, expression, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result.result.value) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

const authPath = mode === "sign-in" ? (process.env.SMOKE_NEXT_PATH ? `/sign-in?next=${encodeURIComponent(process.env.SMOKE_NEXT_PATH)}` : "/sign-in?next=%2F") : "/sign-up";
const shouldPreloadOnboarding = mode === "sign-in" && process.env.SMOKE_PRELOAD_ONBOARDING === "1";
const shouldBootstrapRequestAccess = mode === "sign-up" && onboardingAction === "request-access";
const target = await openTarget(`${baseUrl}${shouldPreloadOnboarding || shouldBootstrapRequestAccess ? "/onboarding" : authPath}`);
const client = createCdpClient(target.webSocketDebuggerUrl);
await client.ready;
await Promise.all([
  client.send("Page.enable"),
  client.send("Runtime.enable"),
  client.send("Network.enable"),
]);
if (mode === "sign-up") {
  await client.send("Network.clearBrowserCookies");
}

let apiBootstrap = null;
if (shouldBootstrapRequestAccess) {
  const signUp = await fetch(`${baseUrl}/api/auth/sign-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "CreoOS Browser Smoke", email, password }),
  });
  const signUpBody = await signUp.json().catch(() => ({}));
  if (!signUp.ok) throw new Error(`Bootstrap sign-up failed: ${signUp.status} ${JSON.stringify(signUpBody)}`);
  const setCookies = signUp.headers.getSetCookie?.() ?? [];
  if (!setCookies.some((cookie) => cookie.startsWith("insforge_access_token="))) {
    throw new Error(`Bootstrap sign-up did not issue auth cookies: ${JSON.stringify(signUpBody)}`);
  }
  await Promise.all(
    setCookies.map((cookie) => {
      const parsed = parseSetCookie(cookie);
      return client.send("Network.setCookie", {
        url: baseUrl,
        name: parsed.name,
        value: parsed.value,
        path: parsed.path,
        httpOnly: parsed.httpOnly,
        secure: parsed.secure,
        sameSite: "Lax",
      });
    }),
  );
  apiBootstrap = { user: signUpBody.user?.id ?? null, cookieCount: setCookies.length };
}

if (shouldBootstrapRequestAccess) {
  await client.send("Page.navigate", { url: `${baseUrl}/onboarding` });
  await waitForPageExpression(client, `document.body.innerText.includes('Choose your company path') && !document.body.innerText.includes('Sign in first')`, 15_000);
} else if (shouldPreloadOnboarding) {
  await client.send("Page.navigate", { url: `${baseUrl}/onboarding` });
  await waitForPageExpression(client, `document.body.innerText.includes('Sign in first')`, 15_000);
}
if (!shouldBootstrapRequestAccess) {
  await client.send("Page.navigate", { url: `${baseUrl}${authPath}` });
  await waitFor(client, () => client.events.some((event) => event.method === "Page.loadEventFired"), 15_000);
  await waitForPageExpression(client, `Boolean(window.__CREOOS_AUTH_FORM_READY && document.querySelector('form button'))`, 15_000);
}

const fillAndSubmit = mode === "sign-in" ? `
(async () => {
  const response = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email: '${email}', password: '${password}' })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Browser sign-in failed.');
  const hasAccessCookie = document.cookie.includes('insforge_access_token=');
  window.location.assign('/');
  return { submitted: true, email: '${email}', passwordLength: ${password.length}, status: response.status, hasAccessCookie };
})()
` : `
(() => {
  const setValue = (name, value) => {
    const input = document.querySelector('[name="' + name + '"]');
    if (!input) throw new Error('Missing input: ' + name);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input.value !== value) throw new Error('Input did not keep value: ' + name);
  };
  ${mode === "sign-up" ? "setValue('name', 'CreoOS Browser Smoke');" : ""}
  setValue('email', '${email}');
  setValue('password', '${password}');
  const form = document.querySelector('form');
  const submitter = document.querySelector('form button[type="submit"], form button');
  if (!form || !submitter) throw new Error('Missing auth form submitter.');
  form.requestSubmit(submitter);
  return {
    submitted: true,
    href: location.href,
    email: document.querySelector('[name="email"]').value,
    passwordLength: document.querySelector('[name="password"]').value.length
  };
})()
`;

const submitResult = shouldBootstrapRequestAccess
  ? { result: { value: { submitted: true, email, passwordLength: password.length, apiBootstrap } } }
  : await client.send("Runtime.evaluate", { expression: fillAndSubmit, awaitPromise: true, returnByValue: true });
if (!submitResult.result.value?.submitted || submitResult.result.value.email !== email || submitResult.result.value.passwordLength < 10) {
  const diagnostic = await client.send("Runtime.evaluate", {
    expression: `({ href: location.href, bodyText: document.body.innerText.slice(0, 800) })`,
    returnByValue: true,
  });
  throw new Error(`Auth form was not filled correctly: ${JSON.stringify({ submit: submitResult.result.value, page: diagnostic.result.value })}`);
}
const cookiesAfterSubmit = await client.send("Network.getAllCookies");

const redirected = shouldBootstrapRequestAccess
  ? true
  : await waitFor(client, () => {
      const expectedPath = mode === "sign-in" ? `${baseUrl}${process.env.SMOKE_NEXT_PATH ?? "/"}` : `${baseUrl}/onboarding`;
      return client.events.some((event) => event.method === "Page.frameNavigated" && event.params?.frame?.url === expectedPath);
    }, 25_000);

const pageState = await client.send("Runtime.evaluate", {
  expression: `({
    href: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1200),
    authError: document.querySelector('.auth-error')?.textContent ?? null
  })`,
  returnByValue: true,
});

let requestAccessState = { requested: false, requestId: null, cleanup: null };
if (
  mode === "sign-up" &&
  onboardingAction === "request-access" &&
  pageState.result.value.href.includes("/onboarding") &&
  !pageState.result.value.bodyText.includes("Sign in first")
) {
  const requestAccess = `
  (() => {
    const joinTrigger = Array.from(document.querySelectorAll('[role="tab"], button')).find((button) => button.textContent?.includes('Join company'));
    if (!joinTrigger) throw new Error('Missing Join company tab. Page: ' + JSON.stringify({ href: location.href, bodyText: document.body.innerText.slice(0, 900) }));
    joinTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    joinTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    joinTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    joinTrigger.click();
    return { switched: true };
  })()
  `;
  const tabSwitch = await client.send("Runtime.evaluate", { expression: requestAccess, awaitPromise: true, returnByValue: true });
  if (tabSwitch.exceptionDetails) {
    throw new Error(
      tabSwitch.exceptionDetails.exception?.description ??
        tabSwitch.exceptionDetails.exception?.value ??
        tabSwitch.exceptionDetails.text ??
        "Request access tab switch failed.",
    );
  }
  await waitForPageExpression(client, `Boolean(document.querySelector('[name="company_code"]'))`, 10_000);
  const fillRequestAccess = `
  (() => {
    const setValue = (name, value) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('Missing input: ' + name);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('company_code', 'ct');
    const submitter = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Request access'));
    if (!submitter) throw new Error('Missing Request access button.');
    submitter.click();
    return { submitted: true };
  })()
  `;
  const requestSubmit = await client.send("Runtime.evaluate", { expression: fillRequestAccess, awaitPromise: true, returnByValue: true });
  if (requestSubmit.exceptionDetails) {
    throw new Error(
      requestSubmit.exceptionDetails.exception?.description ??
        requestSubmit.exceptionDetails.exception?.value ??
        requestSubmit.exceptionDetails.text ??
        "Request access form interaction failed.",
    );
  }
  const requestNoticeShown = await waitForPageExpression(
    client,
    `document.body.innerText.includes('Pending approval') || document.body.innerText.includes('Your access request is pending admin approval.') || document.body.innerText.includes('waiting for admin approval')`,
    25_000,
  );
  const requestPageState = await client.send("Runtime.evaluate", {
    expression: `({
      href: location.href,
      authError: document.querySelector('.auth-error')?.textContent ?? null,
      success: document.querySelector('.auth-success')?.textContent ?? null,
      bodyText: document.body.innerText.slice(0, 1200)
    })`,
    returnByValue: true,
  });
  const env = readEnvFile(".env.local");
  const admin = createAdminClient({ baseUrl: env.INSFORGE_URL, apiKey: env.INSFORGE_API_KEY });
  const recipientsResult = await admin.database
    .from("organization_members")
    .select("user_id,role")
    .eq("organization_id", "2154a327-bb4e-4cbe-8ef3-82446ad3195b")
    .in("role", ["owner", "admin"]);
  if (recipientsResult.error) throw recipientsResult.error;
  const { data, error } = await admin.database
    .from("organization_access_requests")
    .select("id,email,organization_slug,status,requested_role")
    .eq("email", email)
    .eq("organization_slug", "ct")
    .limit(1);
  if (error) throw error;
  if (!data?.[0]) {
    const requestResponses = client.events
      .filter((event) => event.method === "Network.responseReceived" && event.params?.response?.url.includes("/api/auth/workspace-access-request"))
      .map((event) => ({ url: event.params.response.url, status: event.params.response.status }));
    throw new Error(
      `Browser request-access did not create a pending request row: ${JSON.stringify({
        email,
        requestNoticeShown,
        page: requestPageState.result.value,
        requestResponses,
      })}`,
    );
  }
  const notificationRows = await admin.database
    .from("notifications")
    .select("id,user_id,type,title,body,organization_id")
    .eq("organization_id", "2154a327-bb4e-4cbe-8ef3-82446ad3195b")
    .eq("type", "access_request_received")
    .ilike("body", `%${email}%`);
  if (notificationRows.error) throw notificationRows.error;
  const recipientIds = new Set((recipientsResult.data ?? []).map((row) => row.user_id));
  const notifiedRecipientIds = new Set((notificationRows.data ?? []).map((row) => row.user_id));
  for (const recipientId of recipientIds) {
    if (!notifiedRecipientIds.has(recipientId)) {
      throw new Error(`Browser request-access did not notify recipient ${recipientId}.`);
    }
  }
  const notificationCleanupIds = (notificationRows.data ?? []).map((row) => row.id);
  if (notificationCleanupIds.length > 0) {
    const cleanupNotifications = await admin.database.from("notifications").delete().in("id", notificationCleanupIds);
    if (cleanupNotifications.error) throw cleanupNotifications.error;
  }
  const cleanup = await admin.database.from("organization_access_requests").delete().eq("id", data[0].id);
  if (cleanup.error) throw cleanup.error;
  requestAccessState = { requested: true, requestId: data[0].id, cleanup: "deleted" };
} else if (mode === "sign-up" && pageState.result.value.href.includes("/onboarding") && !pageState.result.value.bodyText.includes("Sign in first")) {
  const createCompany = `
  (() => {
    const setValue = (name, value) => {
      const input = document.querySelector('[name="' + name + '"]');
      if (!input) throw new Error('Missing input: ' + name);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('name', '${companyName}');
    setValue('slug', '${companySlug}');
    document.querySelector('.workspace-form button[type="submit"], .workspace-form button').click();
    return { submitted: true };
  })()
  `;
  await client.send("Runtime.evaluate", { expression: createCompany, awaitPromise: true, returnByValue: true });
  await waitFor(client, () =>
    client.events.some((event) => event.method === "Page.frameNavigated" && event.params?.frame?.url === `${baseUrl}/`),
    25_000,
  );
}

await waitForPageExpression(
  client,
  `document.body.innerText.includes('Overview') || document.body.innerText.includes('Check your email') || document.body.innerText.includes('Pending approval') || document.body.innerText.includes('waiting for admin approval')`,
  15_000,
);

const finalState = await client.send("Runtime.evaluate", {
  expression: `({
    href: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1200),
    authError: document.querySelector('.auth-error')?.textContent ?? null
  })`,
  returnByValue: true,
});

let tasksState = { href: null, bodyText: "" };
let onboardingState = { href: null, bodyText: "" };
if (mode === "sign-in") {
  await client.send("Page.navigate", { url: `${baseUrl}/tasks` });
  await waitFor(client, () =>
    client.events.some((event) => event.method === "Page.frameNavigated" && event.params?.frame?.url === `${baseUrl}/tasks`),
    15_000,
  );
  await waitForPageExpression(client, `document.body.innerText.includes('Tasks')`, 15_000);
  const tasksResult = await client.send("Runtime.evaluate", {
    expression: `({
      href: location.href,
      bodyText: document.body.innerText.slice(0, 1200)
    })`,
    returnByValue: true,
  });
  tasksState = tasksResult.result.value;

  await client.send("Page.navigate", { url: `${baseUrl}/onboarding` });
  await waitFor(client, () =>
    client.events.some((event) => event.method === "Page.frameNavigated" && event.params?.frame?.url.startsWith(`${baseUrl}/onboarding`)),
    15_000,
  );
  await waitForPageExpression(client, `document.body.innerText.includes('Loading your workspace access') || document.body.innerText.includes('Verified company access') || location.href === '${baseUrl}/'`, 15_000);
  const onboardingResult = await client.send("Runtime.evaluate", {
    expression: `({
      href: location.href,
      bodyText: document.body.innerText.slice(0, 1200)
    })`,
    returnByValue: true,
  });
  onboardingState = onboardingResult.result.value;
}

const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const screenshotPath = "/tmp/creoos-signup-smoke.png";
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

const networkFailures = client.events
  .filter((event) => event.method === "Network.loadingFailed")
  .map((event) => event.params?.errorText)
  .filter((errorText) => errorText && errorText !== "net::ERR_ABORTED");
const httpErrors = client.events
  .filter((event) => event.method === "Network.responseReceived" && event.params?.response?.status >= 400)
  .map((event) => ({ url: event.params.response.url, status: event.params.response.status }));
const blockingHttpErrors = httpErrors.filter((error) => !(error.url.includes("/api/auth/refresh") && error.status === 401));

const dashboardReady =
  finalState.result.value.href === `${baseUrl}/` &&
  finalState.result.value.bodyText.includes("Overview") &&
  !finalState.result.value.bodyText.includes("Choose a company workspace first");
const tasksReady =
  mode !== "sign-in" ||
  (tasksState.href === `${baseUrl}/tasks` &&
    tasksState.bodyText.includes("Tasks") &&
    !tasksState.bodyText.includes("Choose a company workspace first") &&
    !tasksState.bodyText.includes("Sign in first"));
const onboardingReady =
  mode !== "sign-in" ||
  ((onboardingState.href === `${baseUrl}/onboarding` || onboardingState.href === `${baseUrl}/`) &&
    !onboardingState.bodyText.includes("Sign in first") &&
    !onboardingState.bodyText.includes("No refresh token provided"));
const blockedByAuth = pageState.result.value.bodyText.includes("Sign in first") || finalState.result.value.bodyText.includes("Sign in first");

client.close();

const result = {
  mode,
  email,
  redirected: redirected || pageState.result.value.href.includes("/onboarding"),
  href: finalState.result.value.href,
  tasksHref: tasksState.href,
  onboardingHref: onboardingState.href,
  authError: finalState.result.value.authError,
  blockedByAuth,
  dashboardReady,
  tasksReady,
  onboardingReady,
  signupRequiresVerification: mode === "sign-up" && finalState.result.value.bodyText.includes("Check your email"),
  companySlug,
  screenshotPath,
  networkFailures,
  httpErrors,
  blockingHttpErrors,
  requestAccessState,
  submitResult: submitResult.result.value,
  authCookies: (cookiesAfterSubmit.cookies ?? [])
    .filter((cookie) => cookie.name.startsWith("insforge_"))
    .map((cookie) => ({ name: cookie.name, domain: cookie.domain, path: cookie.path, httpOnly: cookie.httpOnly })),
};

console.log(JSON.stringify(result, null, 2));

if (mode === "sign-in" && (!dashboardReady || !tasksReady || !onboardingReady || blockedByAuth || networkFailures.length > 0 || blockingHttpErrors.length > 0)) {
  throw new Error("Browser workspace guard smoke failed.");
}
if (mode === "sign-up" && onboardingAction === "request-access" && (!requestAccessState.requested || networkFailures.length > 0 || blockingHttpErrors.length > 0)) {
  throw new Error("Browser request-access smoke failed.");
}
