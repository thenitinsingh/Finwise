// Static safety and structure checks (spec AC17, AC18, AC18b).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(serverDir, '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    out.push(path);
    if (statSync(path).isDirectory()) out.push(...walk(path));
  }
  return out;
}

const serverSources = walk(join(serverDir, 'src')).filter((p) => p.endsWith('.js'));
const read = (path) => readFileSync(path, 'utf8');

describe('safety boundaries', () => {
  it('AC17 — no server code makes outbound network calls or sends mail', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /from\s+['"]node:(http|https|net|tls|dgram)['"]/,
      /from\s+['"](http|https|net|axios|node-fetch|nodemailer|stripe|twilio)['"]/,
      /require\(\s*['"](http|https|axios|nodemailer)['"]\s*\)/,
    ];
    // The AI service is the one place allowed to call out (to Gemini).
    const aiPath = join(serverDir, 'src', 'ai', 'aiService.js');
    for (const file of serverSources) {
      const code = read(file);
      if (file === aiPath) {
        assert.ok(!/nodemailer|smtp/i.test(code), 'AI service must not send mail');
        continue;
      }
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(code), `${relative(repoRoot, file)} matches ${pattern}`);
      }
    }
  });

  it('AC18 — the AI service is the only LLM boundary', () => {
    const aiPath = join(serverDir, 'src', 'ai', 'aiService.js');
    const aiCode = read(aiPath);
    assert.ok(aiCode.includes('generativelanguage.googleapis.com'), 'AI service talks to Gemini');
    assert.ok(!/console\.log\([^)]*(apiKey|AI_API_KEY)/.test(aiCode), 'the key is never logged');
    const llmSdk = /from\s+['"](openai|@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|groq-sdk|cohere-ai|@mistralai\/[\w-]+|ollama)['"]/;
    for (const file of serverSources.filter((p) => p !== aiPath)) {
      assert.ok(!llmSdk.test(read(file)), `${relative(repoRoot, file)} imports an LLM SDK`);
    }
    const pkg = JSON.parse(read(join(serverDir, 'package.json')));
    assert.ok(!Object.keys(pkg.dependencies ?? {}).some((dep) => llmSdk.test(`from '${dep}'`)), 'no LLM SDK dependency');
  });
});

describe('project structure', () => {
  it('AC18b — two application folders (client/, server/) plus Prompts/', () => {
    const dirs = readdirSync(repoRoot).filter(
      (name) => !name.startsWith('.') && statSync(join(repoRoot, name)).isDirectory(),
    );
    assert.deepEqual(dirs.sort(), ['Prompts', 'client', 'server']); // Prompts/ holds the prompt text files
  });

  it('AC18b — no path, env var or README heading uses the forbidden names', () => {
    const banned = /front[-_ ]?end|back[-_ ]?end/i;
    for (const path of walk(repoRoot)) {
      assert.ok(!banned.test(relative(repoRoot, path)), `path ${relative(repoRoot, path)}`);
    }
    const readme = read(join(repoRoot, 'README.md'));
    for (const heading of readme.split('\n').filter((line) => line.startsWith('#'))) {
      assert.ok(!banned.test(heading), `README heading: ${heading}`);
    }
    for (const envFile of [join(serverDir, '.env.example'), join(repoRoot, 'client', '.env.example')]) {
      assert.ok(!banned.test(read(envFile)), `${relative(repoRoot, envFile)}`);
    }
  });
});
