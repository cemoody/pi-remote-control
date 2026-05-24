/**
 * seed-long-session — write a single deterministic mock session JSON with
 * a very long message history (500 user/assistant pairs = 1000 messages)
 * into .tmp/playwright-long/ so the long-session pagination repro test
 * has a stable, oversized session to attach to.
 *
 * The first message has a unique sentinel string ("FIRST-MESSAGE-MARKER-α")
 * that the test asserts is reachable by scrolling up. The last message has
 * a matching "LAST-MESSAGE-MARKER-ω" sentinel so the test can confirm the
 * tail rendered as expected.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.tmp/playwright-long');
const cwd = path.resolve(process.env.PI_CRUST_PROJECT_ROOT ?? process.cwd());
const id = 'seeded-session-long';
const sessionFile = path.join(root, '0000000000000_seeded-session-long.mock-session.json');
await fs.mkdir(root, { recursive: true });

const TOTAL_TURNS = 500; // -> 1000 messages, well over the 200 initial-fetch cap
const FIRST_MARKER = 'FIRST-MESSAGE-MARKER-α';
const LAST_MARKER = 'LAST-MESSAGE-MARKER-ω';

const messages = [];
const baseTs = 1700000000000;
for (let i = 0; i < TOTAL_TURNS; i++) {
  const tag = i === 0 ? FIRST_MARKER : `turn-${i}-user`;
  messages.push({
    role: 'user',
    content: `${tag}: user message number ${i}`,
    timestamp: baseTs + i * 2,
  });
  const aTag = i === TOTAL_TURNS - 1 ? LAST_MARKER : `turn-${i}-assistant`;
  messages.push({
    role: 'assistant',
    content: `${aTag}: assistant reply number ${i}`,
    timestamp: baseTs + i * 2 + 1,
  });
}

await fs.writeFile(sessionFile, JSON.stringify({
  id,
  cwd,
  sessionFile,
  sessionName: 'Long session',
  messages,
  lastActivity: Date.now(),
}, null, 2) + '\n');
console.log(`seeded ${sessionFile} (${messages.length} messages)`);
