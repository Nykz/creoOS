import { writeFile } from "node:fs/promises";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const mode = process.env.SMOKE_EMAIL ? "sign-in" : "sign-up";
const email = process.env.SMOKE_EMAIL ?? `creoos-browser-${Date.now()}@example.com`;
const companyName = `CreoOS Smoke Studio ${Date.now()}`;
const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const password = process.env.SMOKE_PASSWORD ?? "SecurePass1234";
const chromeBase = "http://127.0.0.1:9222";

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

const authPath = mode === "sign-in" ? "/sign-in?next=%2F" : "/sign-up";
const target = await openTarget(`${baseUrl}${authPath}`);
const client = createCdpClient(target.webSocketDebuggerUrl);
await client.ready;
await Promise.all([
  client.send("Page.enable"),
  client.send("Runtime.enable"),
  client.send("Network.enable"),
]);

await client.send("Page.navigate", { url: `${baseUrl}${authPath}` });
await waitFor(client, () => client.events.some((event) => event.method === "Page.loadEventFired"), 15_000);
await waitForPageExpression(client, `Boolean(window.__CREOOS_AUTH_FORM_READY && document.querySelector('form button'))`, 15_000);

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

const submitResult = await client.send("Runtime.evaluate", { expression: fillAndSubmit, awaitPromise: true, returnByValue: true });
if (!submitResult.result.value?.submitted || submitResult.result.value.email !== email || submitResult.result.value.passwordLength < 10) {
  throw new Error(`Auth form was not filled correctly: ${JSON.stringify(submitResult.result.value)}`);
}
const cookiesAfterSubmit = await client.send("Network.getAllCookies");

const redirected = await waitFor(client, () => {
  const expectedPath = mode === "sign-in" ? `${baseUrl}/` : `${baseUrl}/onboarding`;
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

if (mode === "sign-up" && pageState.result.value.href.includes("/onboarding") && !pageState.result.value.bodyText.includes("Sign in first")) {
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

await waitForPageExpression(client, `document.body.innerText.includes('Overview') || document.body.innerText.includes('Check your email')`, 15_000);

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
}

const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const screenshotPath = "/tmp/creoos-signup-smoke.png";
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

const networkFailures = client.events
  .filter((event) => event.method === "Network.loadingFailed")
  .map((event) => event.params?.errorText)
  .filter(Boolean);
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
const blockedByAuth = pageState.result.value.bodyText.includes("Sign in first") || finalState.result.value.bodyText.includes("Sign in first");

client.close();

const result = {
  mode,
  email,
  redirected: redirected || pageState.result.value.href.includes("/onboarding"),
  href: finalState.result.value.href,
  tasksHref: tasksState.href,
  authError: finalState.result.value.authError,
  blockedByAuth,
  dashboardReady,
  tasksReady,
  signupRequiresVerification: mode === "sign-up" && finalState.result.value.bodyText.includes("Check your email"),
  companySlug,
  screenshotPath,
  networkFailures,
  httpErrors,
  blockingHttpErrors,
  submitResult: submitResult.result.value,
  authCookies: (cookiesAfterSubmit.cookies ?? [])
    .filter((cookie) => cookie.name.startsWith("insforge_"))
    .map((cookie) => ({ name: cookie.name, domain: cookie.domain, path: cookie.path, httpOnly: cookie.httpOnly })),
};

console.log(JSON.stringify(result, null, 2));

if (mode === "sign-in" && (!dashboardReady || !tasksReady || blockedByAuth || networkFailures.length > 0 || blockingHttpErrors.length > 0)) {
  throw new Error("Browser workspace guard smoke failed.");
}
