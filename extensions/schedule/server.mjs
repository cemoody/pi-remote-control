import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export default function activate(prc) {
  const store = createStore(prc.storage.dataFile('cron-jobs.json'));

  prc.activity.registerView({ id: 'core.schedule.activity', title: 'Schedule', order: 20 });

  prc.server.api.get('/api/cron', async () => ({
    jobs: (await store.list()).map(toCronJobView),
    filePath: store.filePath,
  }));

  prc.server.api.post('/api/cron', async (request) => {
    const body = await request.json();
    const validation = validateCronInput(body);
    if (validation) return { status: 400, body: { error: validation } };
    const now = Date.now();
    const job = await store.create({
      id: randomUUID(),
      name: body.name.trim(),
      schedule: body.schedule.trim(),
      prompt: body.prompt ?? '',
      cwd: body.cwd,
      enabled: body.enabled !== false,
      nextRun: nextRun(body.schedule.trim(), new Date(now))?.getTime() ?? null,
      lastRun: null,
      lastSessionId: null,
    });
    return toCronJobView(job);
  });

  prc.server.api.post('/api/cron/:id', async (request) => {
    const body = await request.json();
    if (body.schedule !== undefined) {
      const validation = validateSchedule(body.schedule);
      if (validation) return { status: 400, body: { error: validation } };
    }
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.schedule !== undefined ? { schedule: body.schedule } : {}),
      ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
      ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    };
    const updated = await store.update(request.params.id, patch);
    if (!updated) return { status: 404, body: { error: 'cron job not found' } };
    if (body.schedule !== undefined || body.enabled !== undefined) {
      await store.update(request.params.id, { nextRun: updated.enabled ? (nextRun(updated.schedule, new Date())?.getTime() ?? null) : null });
    }
    return toCronJobView((await store.get(request.params.id)));
  });

  prc.server.api.post('/api/cron/:id/delete', async (request) => {
    const ok = await store.delete(request.params.id);
    if (!ok) return { status: 404, body: { error: 'cron job not found' } };
    return { ok: true };
  });

  prc.server.api.post('/api/cron/:id/run', async (request) => {
    const job = await store.get(request.params.id);
    if (!job) return { status: 400, body: { error: 'cron job not found' } };
    try {
      const session = await prc.sessions.createAndPrompt({ cwd: job.cwd, sessionName: `cron: ${job.name}`, prompt: job.prompt });
      const sessionId = session && typeof session === 'object' && typeof session.id === 'string' ? session.id : '';
      const updated = await store.update(job.id, {
        lastRun: Date.now(),
        lastSessionId: sessionId || null,
        nextRun: nextRun(job.schedule, new Date())?.getTime() ?? null,
      });
      return { job: toCronJobView(updated), sessionId, sessionFile: session?.sessionFile ?? '' };
    } catch (error) {
      return { status: 400, body: { error: error instanceof Error ? error.message : String(error) } };
    }
  });

  prc.jobs.register({
    id: 'core.schedule.scheduler',
    start() {
      const timer = setInterval(() => tick(store, prc).catch((error) => console.warn('[schedule]', error)), 60_000);
      timer.unref?.();
      this.timer = timer;
    },
    stop() {
      if (this.timer) clearInterval(this.timer);
    },
  });
}

async function tick(store, prc) {
  const now = Date.now();
  for (const job of await store.list()) {
    if (!job.enabled) continue;
    if (job.nextRun !== null && job.nextRun > now) continue;
    await prc.sessions.createAndPrompt({ cwd: job.cwd, sessionName: `cron: ${job.name}`, prompt: job.prompt });
    await store.update(job.id, { lastRun: now, nextRun: nextRun(job.schedule, new Date(now + 60_000))?.getTime() ?? null });
  }
}

function createStore(filePath) {
  async function read() {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data.jobs) ? data.jobs : [];
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async function write(jobs) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify({ jobs }, null, 2)}\n`, 'utf8');
  }
  return {
    filePath,
    async list() { return read(); },
    async get(id) { return (await read()).find((job) => job.id === id) ?? null; },
    async create(job) { const jobs = await read(); jobs.push(job); await write(jobs); return job; },
    async update(id, patch) {
      const jobs = await read();
      const index = jobs.findIndex((job) => job.id === id);
      if (index === -1) return null;
      jobs[index] = { ...jobs[index], ...patch };
      await write(jobs);
      return jobs[index];
    },
    async delete(id) {
      const jobs = await read();
      const next = jobs.filter((job) => job.id !== id);
      if (next.length === jobs.length) return false;
      await write(next);
      return true;
    },
  };
}

function toCronJobView(job) {
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    prompt: job.prompt,
    cwd: job.cwd,
    enabled: job.enabled,
    lastRun: job.lastRun ?? null,
    nextRun: job.nextRun ?? null,
    lastSessionId: job.lastSessionId ?? null,
    scheduleError: validateSchedule(job.schedule)?.replace(/^Invalid schedule: /, '') ?? null,
  };
}

function validateCronInput(body) {
  if (!body?.name || !String(body.name).trim()) return 'name is required';
  if (!body?.schedule || !String(body.schedule).trim()) return 'schedule is required';
  if (!body?.cwd || !String(body.cwd).trim()) return 'cwd is required';
  return validateSchedule(body.schedule);
}

function validateSchedule(schedule) {
  const parts = String(schedule).trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid schedule: expected five fields';
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  for (let i = 0; i < parts.length; i += 1) {
    if (!matchesField(0, parts[i], ranges[i][0], ranges[i][1], true)) return `Invalid schedule: invalid field ${i + 1}`;
  }
  return null;
}

function nextRun(schedule, from) {
  if (validateSchedule(schedule)) return null;
  const parts = schedule.trim().split(/\s+/);
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < 525_600; i += 1) {
    const day = cursor.getDay();
    const cronDay = day === 0 ? 7 : day;
    if (matchesField(cursor.getMinutes(), parts[0], 0, 59)
      && matchesField(cursor.getHours(), parts[1], 0, 23)
      && matchesField(cursor.getDate(), parts[2], 1, 31)
      && matchesField(cursor.getMonth() + 1, parts[3], 1, 12)
      && (matchesField(day, parts[4], 0, 7) || matchesField(cronDay, parts[4], 0, 7))) return cursor;
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

function matchesField(value, field, min, max, validateOnly = false) {
  return String(field).split(',').some((part) => {
    const [base, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step <= 0) return false;
    let start = min;
    let end = max;
    if (base !== '*') {
      if (base.includes('-')) {
        const [a, b] = base.split('-').map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < min || b > max || a > b) return false;
        start = a; end = b;
      } else {
        const single = Number(base);
        if (!Number.isInteger(single) || single < min || single > max) return false;
        start = single; end = single;
      }
    }
    if (validateOnly) return true;
    return value >= start && value <= end && (value - start) % step === 0;
  });
}
