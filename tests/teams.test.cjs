// Run with: node --test tests/teams.test.cjs
// Teams: the rules, every action against an in-memory fake database, and
// that whose team is touched comes only from the session. No real DB.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, modules = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { exports: {}, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

const rules = load("src/lib/team-rules.ts");
const portal = load("src/lib/portal-access.ts");

// ---- rules ----

test("invite codes are forgiving about how they're typed", () => {
  assert.equal(rules.normalizeInviteCode("HJ-7K3QPX"), "HJ-7K3QPX");
  assert.equal(rules.normalizeInviteCode("hj-7k3qpx"), "HJ-7K3QPX");
  assert.equal(rules.normalizeInviteCode(" hj 7k3 qpx "), "HJ-7K3QPX");
  assert.equal(rules.normalizeInviteCode("7k3qpx"), "HJ-7K3QPX");
});

test("impossible codes are rejected before touching the database", () => {
  for (const bad of ["", "HJ-7K3QP", "HJ-7K3QPXX", "HJ-0K3QPX", "HJ-1K3QPX", "HJ-OK3QPX", "<script>", null, 42]) {
    assert.equal(rules.normalizeInviteCode(bad), null, String(bad));
  }
});

test("team names are trimmed, required, and capped", () => {
  assert.deepEqual(plain(rules.normalizeTeamName("  Byte   Me  ")), { ok: true, name: "Byte Me" });
  assert.equal(rules.normalizeTeamName("   ").ok, false);
  assert.equal(rules.normalizeTeamName("x".repeat(41)).ok, false);
  assert.equal(rules.TEAM_MAX, 3);
});

// ---- a fake database ----

function fakeDb({ apps = [], teams = [], people = [] } = {}) {
  const db = {
    apps: new Map(apps.map((a) => [a.id, { teamId: null, status: "ACCEPTED", rsvpStatus: "PENDING", eventId: "ev-26", createdAt: 0, ...a }])),
    teams: new Map(teams.map((t) => [t.id, { eventId: "ev-26", ...t }])),
    people: new Map(people.map((p) => [p.id, { discordUsername: null, ...p }])),
  };
  let n = 0;
  const matches = (a, where = {}) =>
    (where.teamId === undefined || a.teamId === where.teamId) &&
    (where.status === undefined || a.status === where.status) &&
    (where.rsvpStatus?.in === undefined || where.rsvpStatus.in.includes(a.rsvpStatus));

  const client = {
    $queryRaw: async (strings, id) => {
      const table = strings.join("").includes('"Team"') ? db.teams : db.apps;
      return table.has(id) ? [{ id }] : [];
    },
    application: {
      findUnique: async ({ where }) => {
        const a = db.apps.get(where.id);
        return a ? { ...a, personId: a.personId } : null;
      },
      update: async ({ where, data }) => Object.assign(db.apps.get(where.id), data),
      count: async ({ where }) => [...db.apps.values()].filter((a) => matches(a, where)).length,
    },
    team: {
      create: async ({ data }) => {
        const id = `team-${++n}`;
        db.teams.set(id, { id, ...data });
        return { id };
      },
      findFirst: async ({ where }) =>
        [...db.teams.values()].find((t) => t.inviteCode === where.inviteCode && t.eventId === where.eventId) ?? null,
      findUnique: async ({ where }) => {
        const t = db.teams.get(where.id);
        if (!t) return null;
        const members = [...db.apps.values()]
          .filter((a) => matches(a, { teamId: t.id, status: "ACCEPTED", rsvpStatus: { in: ["PENDING", "CONFIRMED"] } }))
          .sort((x, y) => x.createdAt - y.createdAt)
          .map((a) => ({ id: a.id, person: db.people.get(a.personId) }));
        return { name: t.name, inviteCode: t.inviteCode, members };
      },
      update: async ({ where, data }) => Object.assign(db.teams.get(where.id), data),
      delete: async ({ where }) => {
        db.teams.delete(where.id);
        // ON DELETE SET NULL
        for (const a of db.apps.values()) if (a.teamId === where.id) a.teamId = null;
      },
    },
    person: { update: async ({ where, data }) => Object.assign(db.people.get(where.id), data) },
  };

  // Transactions run one at a time, like Postgres row locks serialize them.
  let chain = Promise.resolve();
  const prisma = {
    ...client,
    $transaction: (fn) => {
      const run = chain.then(() => fn(client));
      chain = run.catch(() => {});
      return run;
    },
  };
  const lib = load("src/lib/teams.ts", {
    "server-only": {},
    "node:crypto": require("node:crypto"),
    "@/lib/prisma": { prisma },
    "@/lib/portal-access": portal,
    "@/lib/team-rules": rules,
  });
  return { db, teams: lib };
}

const person = (id, extra = {}) => ({ id, firstName: id.toUpperCase(), lastName: "Test", ...extra });

test("generated invite codes are random, well-formed, and normalize to themselves", () => {
  const { teams } = fakeDb();
  const codes = new Set(Array.from({ length: 200 }, () => teams.generateInviteCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.equal(rules.normalizeInviteCode(code), code);
});

test("the counting filter matches the portal rule for every status combination", () => {
  const { teams } = fakeDb();
  for (const status of ["SUBMITTED", "ACCEPTED", "WAITLISTED", "REJECTED"]) {
    for (const rsvpStatus of ["PENDING", "CONFIRMED", "DECLINED"]) {
      const inFilter = teams.COUNTING_MEMBER.status === status && teams.COUNTING_MEMBER.rsvpStatus.in.includes(rsvpStatus);
      assert.equal(inFilter, portal.canEnterPortal({ status, rsvpStatus }), `${status}/${rsvpStatus}`);
    }
  }
});

// ---- create ----

test("creating a team puts you on it and saves your Discord handle", async () => {
  const { db, teams } = fakeDb({ apps: [{ id: "a1", personId: "p1" }], people: [person("p1")] });
  const result = await teams.createTeam("a1", "  Byte Me ", "byteme");
  assert.equal(result.ok, true);
  const team = [...db.teams.values()][0];
  assert.equal(team.name, "Byte Me");
  assert.match(team.inviteCode, /^HJ-[A-Z2-9]{6}$/);
  assert.equal(db.apps.get("a1").teamId, team.id);
  assert.equal(db.people.get("p1").discordUsername, "byteme");
});

test("you can't create a second team, or create one without portal access", async () => {
  const { teams } = fakeDb({
    apps: [{ id: "a1", personId: "p1", teamId: "t0" }, { id: "a2", personId: "p2", status: "WAITLISTED" }, { id: "a3", personId: "p3", rsvpStatus: "DECLINED" }],
    teams: [{ id: "t0", name: "Old", inviteCode: "HJ-AAAAAA" }],
    people: [person("p1"), person("p2"), person("p3")],
  });
  assert.equal((await teams.createTeam("a1", "New", null)).error, "ALREADY_IN_TEAM");
  assert.equal((await teams.createTeam("a2", "New", null)).error, "NOT_ELIGIBLE");
  assert.equal((await teams.createTeam("a3", "New", null)).error, "NOT_ELIGIBLE");
  assert.equal((await teams.createTeam("a1", "  ", null)).error, "INVALID_NAME");
});

// ---- join ----

function teamOf(n, extra = []) {
  const apps = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, personId: `pm${i}`, teamId: "t1", createdAt: i }));
  return {
    apps: [...apps, ...extra],
    teams: [{ id: "t1", name: "Pixel Pioneers", inviteCode: "HJ-7K3QPX" }],
    people: [...apps.map((a) => person(a.personId)), ...extra.map((a) => person(a.personId))],
  };
}

test("joining with a code (typed loosely) adds you to the team", async () => {
  const { db, teams } = fakeDb(teamOf(1, [{ id: "me", personId: "pme" }]));
  const result = await teams.joinTeam("me", "hj 7k3qpx", "me_handle");
  assert.equal(result.ok, true);
  assert.equal(db.apps.get("me").teamId, "t1");
  assert.equal(db.people.get("pme").discordUsername, "me_handle");
});

test("a full team (3) can't take a fourth", async () => {
  const { db, teams } = fakeDb(teamOf(3, [{ id: "me", personId: "pme" }]));
  assert.equal((await teams.joinTeam("me", "HJ-7K3QPX", null)).error, "FULL");
  assert.equal(db.apps.get("me").teamId, null);
});

test("two people joining the last spot at the same moment: only one gets it", async () => {
  const { db, teams } = fakeDb(teamOf(2, [{ id: "x", personId: "px" }, { id: "y", personId: "py" }]));
  const [rx, ry] = await Promise.all([teams.joinTeam("x", "HJ-7K3QPX", null), teams.joinTeam("y", "HJ-7K3QPX", null)]);
  assert.deepEqual(plain([rx.ok, ry.ok]).sort(), [false, true]);
  assert.equal([...db.apps.values()].filter((a) => a.teamId === "t1").length, 3);
});

test("a teammate who declined stops counting, freeing their spot", async () => {
  const data = teamOf(3, [{ id: "me", personId: "pme" }]);
  data.apps[0].rsvpStatus = "DECLINED";
  const { teams } = fakeDb(data);
  assert.equal((await teams.joinTeam("me", "HJ-7K3QPX", null)).ok, true);
});

test("wrong, malformed, or other-event codes don't join anything", async () => {
  const data = teamOf(1, [{ id: "me", personId: "pme" }]);
  data.teams.push({ id: "t-old", name: "Last year", inviteCode: "HJ-BBBBBB", eventId: "ev-25" });
  const { db, teams } = fakeDb(data);
  assert.equal((await teams.joinTeam("me", "HJ-ZZZZZZ", null)).error, "NOT_FOUND");
  assert.equal((await teams.joinTeam("me", "not a code", null)).error, "INVALID_CODE");
  assert.equal((await teams.joinTeam("me", "HJ-BBBBBB", null)).error, "NOT_FOUND");
  assert.equal(db.apps.get("me").teamId, null);
});

test("joining while on another team is refused; rejoining your own is a no-op", async () => {
  const data = teamOf(1, [{ id: "me", personId: "pme", teamId: "t2" }]);
  data.teams.push({ id: "t2", name: "Mine", inviteCode: "HJ-CCCCCC" });
  const { teams } = fakeDb(data);
  assert.equal((await teams.joinTeam("me", "HJ-7K3QPX", null)).error, "ALREADY_IN_TEAM");
  assert.equal((await teams.joinTeam("me", "HJ-CCCCCC", null)).ok, true);
});

// ---- rename & leave ----

test("any member can rename; non-members can't", async () => {
  const { db, teams } = fakeDb(teamOf(2, [{ id: "out", personId: "pout" }]));
  assert.equal((await teams.renameTeam("m1", "Byte Me")).ok, true);
  assert.equal(db.teams.get("t1").name, "Byte Me");
  assert.equal((await teams.renameTeam("out", "Hijack")).error, "NOT_IN_TEAM");
  assert.equal(db.teams.get("t1").name, "Byte Me");
});

test("leaving keeps the team while others remain; the last one out deletes it", async () => {
  const { db, teams } = fakeDb(teamOf(2));
  await teams.leaveTeam("m0");
  assert.equal(db.apps.get("m0").teamId, null);
  assert.ok(db.teams.has("t1"));
  await teams.leaveTeam("m1");
  assert.equal(db.teams.has("t1"), false);
});

test("the last counting member leaving deletes the team even if a dropped-out member still points at it", async () => {
  const data = teamOf(2);
  data.apps[1].status = "REJECTED";
  const { db, teams } = fakeDb(data);
  await teams.leaveTeam("m0");
  assert.equal(db.teams.has("t1"), false);
  assert.equal(db.apps.get("m1").teamId, null);
});

// ---- the view ----

test("the team view shows counting members only, with names and handles — no ids", async () => {
  const data = teamOf(3);
  data.people[0].discordUsername = "zero";
  data.apps[2].rsvpStatus = "DECLINED";
  const { teams } = fakeDb(data);
  const view = plain(await teams.getTeamView("m1"));
  assert.equal(view.name, "Pixel Pioneers");
  assert.equal(view.members.length, 2);
  assert.deepEqual(view.members[0], { name: "PM0 Test", discordUsername: "zero", isYou: false });
  assert.equal(view.members[1].isYou, true);
  assert.equal(view.full, false);
  assert.doesNotMatch(JSON.stringify(view), /"id"|m0|m1|pm0/);
});

test("someone not on a team gets no view", async () => {
  const { teams } = fakeDb({ apps: [{ id: "solo", personId: "p" }], people: [person("p")] });
  assert.equal(await teams.getTeamView("solo"), null);
});

// ---- actions: the session decides whose team, never the form ----

function actions({ identities = [{ provider: "discord", identity_data: { sub: "discord-me" } }] } = {}) {
  const calls = [];
  const exports = load("src/app/(app)/team/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/prisma": { prisma: { application: { findFirst: async ({ where }) => (where.person.discordId === "discord-me" ? { id: "app-mine" } : null) } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: {
      id: "sb", user_metadata: { provider_id: "discord-victim", preferred_username: "me#0" }, identities,
    } } }) } }) },
    "@/lib/supabase/user": load("src/lib/supabase/user.ts"),
    "@/lib/teams": {
      createTeam: async (...a) => { calls.push(["create", ...a]); return { ok: true }; },
      joinTeam: async (...a) => { calls.push(["join", ...a]); return { ok: true }; },
      renameTeam: async (...a) => { calls.push(["rename", ...a]); return { ok: true }; },
      leaveTeam: async (...a) => { calls.push(["leave", ...a]); return { ok: true }; },
    },
  });
  return { ...exports, calls };
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

test("every action acts on the signed-in hacker's own application", async () => {
  const a = actions();
  await a.createTeamAction({ status: "idle" }, form({ name: "Byte Me", applicationId: "app-victim" }));
  await a.joinTeamAction({ status: "idle" }, form({ code: "HJ-7K3QPX", applicationId: "app-victim" }));
  await a.renameTeamAction({ status: "idle" }, form({ name: "X", teamId: "t-victim" }));
  await a.leaveTeamAction({ status: "idle" });
  assert.deepEqual(plain(a.calls.map((c) => c[1])), ["app-mine", "app-mine", "app-mine", "app-mine"]);
  assert.equal(a.calls[0][3], "me");
});

test("no verified identity: nothing happens", async () => {
  const a = actions({ identities: [] });
  const result = await a.createTeamAction({ status: "idle" }, form({ name: "Byte Me" }));
  assert.equal(result.status, "error");
  assert.equal(a.calls.length, 0);
});

test("the team page and dashboard read real teams, not placeholders", () => {
  const page = readFileSync("src/app/(app)/team/page.tsx", "utf8");
  assert.match(page, /await getCurrentHacker\(\)/);
  assert.match(page, /getTeamView\(application\.id\)/);
  assert.doesNotMatch(readFileSync("src/app/(app)/team/Team.tsx", "utf8"), /placeholder-data|PIXEL PIONEERS|HJ26-7F3K/);
  assert.doesNotMatch(readFileSync("src/lib/placeholder-data.ts", "utf8"), /export const team =/);
  assert.doesNotMatch(readFileSync("src/app/(app)/dashboard/Dashboard.tsx", "utf8"), /FIND TEAMMATES/);
});
