// Run with: node --test tests/scanner.test.cjs
// Real page, staff gate, event resolver and POST handler; mocked Auth/Prisma only.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const crypto = require("node:crypto");
const vm = require("node:vm");
const ts = require("typescript");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");

const ORIGIN = "https://apply.example.invalid";
const TOKEN = crypto.randomBytes(32).toString("base64url");
const NOT_FOUND = { error: "BADGE_NOT_FOUND" };
const plain = (value) => JSON.parse(JSON.stringify(value));
const compiled = new Map();
const noLogs = Object.fromEntries(["log", "error", "warn", "info", "debug"].map((name) => [
  name, () => assert.fail("Scanner must never log credentials or internal errors"),
]));

function load(path, modules = {}) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  const context = {
    exports: {}, URL, Response, Uint8Array, TextDecoder, console: noLogs,
    process: { env: { NEXT_PUBLIC_SITE_URL: ORIGIN } },
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
      return modules[name];
    },
  };
  vm.runInNewContext(compiled.get(path), context);
  return context.exports;
}

function user() {
  return { id: "synthetic-auth", identities: [{ provider: "discord", identity_data: { sub: "staff-discord" } }],
    user_metadata: { provider_id: "forged-organizer", role: "ORGANIZER" } };
}

function setup(overrides = {}) {
  const state = {
    role: "VOLUNTEER", user: user(), authError: null, thrownAuthError: null, roleError: null,
    eventError: null, applicationError: null, event: { id: "event-latest" },
    application: {
      id: "private-application", eventId: "event-latest", personId: "private-person", badgeToken: TOKEN,
      status: "ACCEPTED", rsvpStatus: "PENDING", school: "private-school", whyAttend: "private-answer",
      diet: "private-diet", gender: "private-demographic", admissionNotes: "private-notes",
      person: { id: "private-person", firstName: "Synthetic", lastName: "Attendee", email: "private@example.invalid",
        phoneNum: "private-phone", discordId: "private-discord", resume: { storageKey: "private-resume" } },
    },
    ...overrides,
  };
  const calls = { auth: 0, people: [], events: [], applications: [] };
  const prisma = {
    person: { findUnique: async (query) => {
      calls.people.push(plain(query));
      if (state.roleError) throw state.roleError;
      return state.role === null ? null : { role: state.role };
    } },
    event: { findFirst: async (query) => {
      calls.events.push(plain(query));
      if (state.eventError) throw state.eventError;
      return state.event;
    } },
    application: { findUnique: async (query) => {
      calls.applications.push(plain(query));
      if (state.applicationError) throw state.applicationError;
      const row = state.application;
      // Deliberately return extra fields so the result must be constructed safely.
      return row?.badgeToken === query.where.badgeToken && row.eventId === query.where.eventId ? row : null;
    } },
  };
  const modules = {
    "server-only": {},
    "next/navigation": {
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
      notFound: () => { throw new Error("NOT_FOUND"); },
    },
    "@/lib/prisma": { prisma },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      calls.auth++;
      if (state.thrownAuthError) throw state.thrownAuthError;
      return { data: { user: state.user }, error: state.authError };
    } } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
  };
  modules["@/lib/volunteer"] = load("src/lib/volunteer.ts", modules);
  const access = load("src/lib/scanner-access.ts", modules);
  const page = load("src/app/scanner/page.tsx", {
    "react/jsx-runtime": jsx, "@/lib/scanner-access": access,
    "./Scanner": { default: () => jsx.jsx("main", { children: "SCANNER" }) },
  });
  const route = load("src/app/api/scanner/lookup/route.ts", {
    ...modules, "@/lib/scanner-access": access,
    "@/lib/scanner-event": load("src/lib/scanner-event.ts", modules),
    "@/lib/portal-access": load("src/lib/portal-access.ts"),
    "@/lib/site-url": load("src/lib/site-url.ts"),
  });
  return { state, calls, access, page: page.default, post: route.POST };
}

function request(body = JSON.stringify({ token: TOKEN }), headers = {}) {
  return new Request(`${ORIGIN}/api/scanner/lookup`, {
    method: "POST", body, headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
  });
}

async function result(s, req = request()) {
  const response = await s.post(req);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  return { status: response.status, body: await response.json() };
}

test("signed-out scanner page redirects to scanner OAuth and lookup returns 401", async () => {
  const s = setup({ user: null });
  await assert.rejects(s.page(), /REDIRECT:\/auth\/signin\?next=\/scanner/);
  assert.deepEqual(await result(s), { status: 401, body: { error: "UNAUTHORIZED" } });
  assert.equal(s.calls.people.length, 0);
  assert.equal(s.calls.applications.length, 0);
});

for (const role of ["APPLICANT", null]) {
  test(`scanner page and manual lookup deny role ${role}`, async () => {
    const s = setup({ role });
    await assert.rejects(s.page(), /NOT_FOUND/);
    assert.deepEqual(await result(s), { status: 403, body: { error: "FORBIDDEN" } });
    assert.equal(s.calls.events.length, 0);
    assert.equal(s.calls.applications.length, 0);
    assert.ok(s.calls.people.every((query) => query.where.discordId === "staff-discord"));
  });
}

for (const role of ["VOLUNTEER", "ORGANIZER"]) {
  test(`${role} can open scanner without any hacker Application`, async () => {
    const s = setup({ role, application: null });
    assert.match(renderToStaticMarkup(await s.page()), /SCANNER/);
    assert.equal(s.calls.applications.length, 0);
    assert.equal(s.calls.events.length, 0);
  });
  test(`${role} lookup returns exactly name with a minimal unique-token query`, async () => {
    const s = setup({ role });
    assert.deepEqual(await result(s), { status: 200, body: { name: "Synthetic Attendee" } });
    assert.deepEqual(s.calls.events, [{ orderBy: { startDate: "desc" }, select: { id: true } }]);
    assert.deepEqual(s.calls.applications, [{
      where: { badgeToken: TOKEN, eventId: "event-latest" },
      select: { status: true, rsvpStatus: true, person: { select: { firstName: true, lastName: true } } },
    }]);
    assert.deepEqual(s.calls.people, [{ where: { discordId: "staff-discord" }, select: { role: true } }]);
  });
}

test("missing provider identity cannot claim staff access through editable metadata", async () => {
  const s = setup({ role: "ORGANIZER", user: { ...user(), identities: [] } });
  await assert.rejects(s.page(), /NOT_FOUND/);
  assert.equal((await result(s)).status, 403);
  assert.equal(s.calls.people.length, 0);
  assert.equal(s.calls.applications.length, 0);
});

test("returned Auth errors deny access even when a user was returned", async () => {
  const s = setup({ authError: new Error("private-auth-error") });
  await assert.rejects(s.page(), /REDIRECT:/);
  assert.equal((await result(s)).status, 401);
  assert.equal(s.calls.people.length, 0);
});

test("every lookup rechecks current session and role, including after page access", async () => {
  const s = setup();
  await s.page();
  assert.equal((await result(s)).status, 200);
  s.state.role = "APPLICANT";
  assert.equal((await result(s)).status, 403);
  s.state.user = null;
  assert.equal((await result(s)).status, 401);
  assert.equal(s.calls.auth, 4);
  assert.equal(s.calls.applications.length, 1);
});

test("response exposes no sensitive fixture field or token, even if the DB mock returns extras", async () => {
  const s = setup();
  const value = await result(s);
  assert.deepEqual(Object.keys(value.body), ["name"]);
  assert.doesNotMatch(JSON.stringify(value.body), /private|ACCEPTED|PENDING|event-latest/);
  assert.ok(!JSON.stringify(value.body).includes(TOKEN));
});

for (const rsvpStatus of ["PENDING", "CONFIRMED"]) {
  test(`ACCEPTED + ${rsvpStatus} is eligible`, async () => {
    const s = setup();
    s.state.application.rsvpStatus = rsvpStatus;
    assert.equal((await result(s)).status, 200);
  });
}

test("unknown, missing and older-event badges share the same public not-found result", async () => {
  const cases = [setup({ application: null }), setup({ event: null }), setup()];
  cases[2].state.application.eventId = "event-old";
  for (const s of cases) assert.deepEqual(await result(s), { status: 404, body: NOT_FOUND });
  assert.equal(cases[1].calls.applications.length, 0);
  assert.deepEqual(await result(setup(), request(JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }))),
    { status: 404, body: NOT_FOUND });
});

for (const status of ["SUBMITTED", "WAITLISTED", "REJECTED", "ACCEPTED"]) {
  for (const rsvpStatus of ["PENDING", "CONFIRMED", "DECLINED"]) {
    if (status === "ACCEPTED" && rsvpStatus !== "DECLINED") continue;
    test(`${status} + ${rsvpStatus} is generic not-found`, async () => {
      const s = setup();
      Object.assign(s.state.application, { status, rsvpStatus });
      assert.deepEqual(await result(s), { status: 404, body: NOT_FOUND });
    });
  }
}

test("malformed bodies, wrong token formats and extra fields never query event/application data", async () => {
  const bodies = [
    "", "{", "null", "[]", "42", '"text"', "{}", '{"token":null}', '{"token":43}', '{"token":{}}',
    ...["", " ", "arbitrary", "A".repeat(42), "A".repeat(44), "!".repeat(43), TOKEN + "\n", " " + TOKEN,
      "https://evil.example/" + TOKEN, "A".repeat(200)].map((token) => JSON.stringify({ token })),
    ...["applicationId", "personId", "eventId", "name", "role", "eligible"].map((key) => JSON.stringify({ token: TOKEN, [key]: "claimed" })),
    JSON.stringify({ token: TOKEN, __extra: true }),
  ];
  for (const body of bodies) {
    const s = setup();
    assert.deepEqual(await result(s, request(body)), { status: 400, body: NOT_FOUND });
    assert.equal(s.calls.events.length, 0);
    assert.equal(s.calls.applications.length, 0);
  }
  assert.equal((await result(setup(), request(null))).status, 400);
  assert.equal((await result(setup(), request("{}", { "content-type": "text/plain" }))).status, 415);
});

test("body byte limit handles absent/false Content-Length, chunked input and UTF-8", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    const s = setup();
    assert.deepEqual(await result(s, request(" ".repeat(1025), headers)), { status: 413, body: NOT_FOUND });
    assert.equal(s.calls.applications.length, 0);
  }
  const s = setup();
  assert.equal((await result(s, request("é".repeat(600)))).status, 413);
  let cancelled = false;
  const chunks = [new Uint8Array(600), new Uint8Array(425)];
  const stream = new ReadableStream({
    pull(controller) { if (chunks.length) controller.enqueue(chunks.shift()); },
    cancel() { cancelled = true; },
  });
  const req = new Request(`${ORIGIN}/api/scanner/lookup`, {
    method: "POST", body: stream, duplex: "half", headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  assert.deepEqual(await result(s, req), { status: 413, body: NOT_FOUND });
  assert.equal(cancelled, true);
  assert.equal(s.calls.events.length, 0);
  assert.equal(s.calls.applications.length, 0);
  const valid = JSON.stringify({ token: TOKEN });
  assert.equal((await result(setup(), request(valid.padEnd(1024)))).status, 200);
});

test("invalid UTF-8 and interrupted request streams are safely rejected", async () => {
  const s = setup();
  assert.deepEqual(await result(s, request(new Uint8Array([0xff]))), { status: 400, body: NOT_FOUND });
  const stream = new ReadableStream({ start(controller) { controller.error(new Error(`private-stream ${TOKEN}`)); } });
  const req = new Request(`${ORIGIN}/api/scanner/lookup`, {
    method: "POST", body: stream, duplex: "half", headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  assert.deepEqual(await result(s, req), { status: 400, body: NOT_FOUND });
  assert.equal(s.calls.applications.length, 0);
});

test("missing, null and foreign origins cannot invoke lookup", async () => {
  for (const origin of ["null", "https://evil.example", `${ORIGIN}.evil.example`, "", `${ORIGIN}/scanner`]) {
    const s = setup();
    assert.deepEqual(await result(s, request(undefined, { origin })), { status: 403, body: { error: "FORBIDDEN" } });
    assert.equal(s.calls.events.length, 0);
    assert.equal(s.calls.applications.length, 0);
  }
  const req = request();
  req.headers.delete("origin");
  assert.equal((await result(setup(), req)).status, 403);
  // Configured site origin wins over attacker-provided forwarded headers.
  assert.equal((await result(setup(), request(undefined, { origin: "https://evil.example", "x-forwarded-host": "evil.example" }))).status, 403);
});

for (const failure of ["thrownAuthError", "roleError", "eventError", "applicationError"]) {
  test(`${failure} fails closed without error/token exposure or logging`, async () => {
    const s = setup({ [failure]: new Error(`private-database ${TOKEN}`) });
    assert.deepEqual(await result(s), { status: 503, body: { error: "UNAVAILABLE" } });
    if (["thrownAuthError", "roleError"].includes(failure)) {
      await assert.rejects(s.page(), (error) => {
        assert.equal(error.message, "Scanner unavailable. Please try again.");
        assert.equal(error.cause, undefined);
        return true;
      });
      assert.equal(s.calls.applications.length, 0);
    }
  });
}
