#!/usr/bin/env node
/**
 * Proves, against a real Supabase project, whether one signed-in user can tamper
 * with another user's Storage files.
 *
 * Why this exists: the app's UI only ever deletes your own photos, so tapping
 * around a build tells you nothing about what the Storage policies actually
 * permit. The policies are the only server-side guard on a direct API call, and
 * this script makes that call - with an ordinary user's token, exactly as a
 * script holding the public anon key could.
 *
 * DEV ONLY. It creates users and writes files, so it hard-refuses to run against
 * the production project. Never point it at production.
 *
 * Two details that matter for trusting the result:
 *   - A blocked Storage delete does NOT come back as an error. supabase-js
 *     returns success with an empty list, so a naive script sees "no error" and
 *     wrongly concludes it worked. Every check here confirms the file's real
 *     state afterwards using a service_role client, which bypasses RLS.
 *   - The "legitimate use" checks matter as much as the tampering ones: policies
 *     that block everything would look like a pass while breaking the app.
 *
 * Usage (PowerShell - keys stay in this shell only, never on disk):
 *
 *   $env:DEV_SUPABASE_URL = 'https://orvlxrdzerorpiiudwhh.supabase.co'
 *   $env:DEV_SUPABASE_ANON_KEY = '<dev anon / publishable key>'
 *   $env:DEV_SUPABASE_SERVICE_ROLE_KEY = '<dev service_role key>'
 *   node scripts/verify-storage-policies.mjs
 *
 * Both keys are on the dev project's API settings page. The service_role key is
 * used only to provision and clean up the throwaway accounts and to read ground
 * truth - never to perform the tampering, which would prove nothing since
 * service_role bypasses RLS by design.
 *
 * Exit code is 0 when every check behaves correctly, 1 otherwise.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const PROD_REF = 'jrorzmwsqxynwbmuqsoq';

const url = process.env.DEV_SUPABASE_URL;
const anonKey = process.env.DEV_SUPABASE_ANON_KEY;
const serviceKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing environment variables. Set all three:');
  console.error('  DEV_SUPABASE_URL, DEV_SUPABASE_ANON_KEY, DEV_SUPABASE_SERVICE_ROLE_KEY');
  console.error('See the comment at the top of this file.');
  process.exit(1);
}

if (url.includes(PROD_REF)) {
  console.error(`Refusing to run: DEV_SUPABASE_URL points at production (${PROD_REF}).`);
  console.error('This script creates users and writes files. Point it at the dev project.');
  process.exit(1);
}

// Easy mistake to make when copying the snippet out of a chat or the header
// comment: the angle-bracket placeholders get pasted literally, and Supabase
// then reports a bare "Invalid API key" that gives no hint why.
for (const [name, value] of [
  ['DEV_SUPABASE_URL', url],
  ['DEV_SUPABASE_ANON_KEY', anonKey],
  ['DEV_SUPABASE_SERVICE_ROLE_KEY', serviceKey],
]) {
  if (value.includes('<') || value.includes('>')) {
    console.error(`${name} still contains placeholder text: ${value}`);
    console.error('Replace it with the real value from the dev project\'s API keys page.');
    process.exit(1);
  }
}

// A bare project ref with no domain resolves to nothing, and the failure surfaces
// deep inside the client as an unhelpful "fetch failed".
let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  console.error(`DEV_SUPABASE_URL is not a valid URL: ${url}`);
  process.exit(1);
}
if (!hostname.includes('.')) {
  console.error(`DEV_SUPABASE_URL looks incomplete: ${url}`);
  console.error(`It needs the full host, e.g. https://${hostname}.supabase.co`);
  process.exit(1);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, clientOptions);

/** Tiny payload. Supabase validates the declared content type, not the bytes. */
const PROBE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const CONTENT_TYPE = 'image/jpeg';

const createdObjects = [];
const createdUsers = [];
const results = [];

function record(group, name, outcome, ok) {
  results.push({ group, name, outcome, ok });
}

async function makeUser(label) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `storage-probe-${label}-${suffix}@bootwatch.invalid`;
  const password = `Probe!${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create account ${label}: ${error.message}`);
  createdUsers.push(data.user.id);

  const client = createClient(url, anonKey, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`could not sign in account ${label}: ${signInError.message}`);

  return { id: data.user.id, client };
}

/** Ground truth, read with service_role so RLS cannot hide the answer. */
async function fileExists(bucket, path) {
  const cut = path.lastIndexOf('/');
  const folder = path.slice(0, cut);
  const file = path.slice(cut + 1);
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100, search: file });
  if (error) throw new Error(`could not list ${bucket}/${folder}: ${error.message}`);
  return (data ?? []).some((entry) => entry.name === file);
}

async function upload(client, bucket, path) {
  const { error } = await client.storage
    .from(bucket)
    .upload(path, PROBE_BYTES, { contentType: CONTENT_TYPE, upsert: false });
  return error;
}

async function main() {
  const ref = new URL(url).hostname.split('.')[0];
  console.log('\nBootWatch Storage policy probe');
  console.log(`  project : ${ref}`);
  console.log('  method  : account B attacks account A using an ordinary user token\n');

  console.log('Provisioning two throwaway accounts...');
  const a = await makeUser('a');
  const b = await makeUser('b');
  console.log(`  account A : ${a.id}`);
  console.log(`  account B : ${b.id}\n`);

  const stamp = Date.now();
  const aPhoto = `${a.id}/probe-${stamp}.jpg`;
  const aPhotoForDelete = `${a.id}/probe-del-${stamp}.jpg`;
  const aAvatar = `${a.id}/avatar-probe-${stamp}.jpg`;
  const intruder = `${a.id}/intruder-${stamp}.jpg`;

  // ── Legitimate use: the app must keep working ─────────────────────────────
  for (const [bucket, path, label] of [
    ['sighting-photos', aPhoto, 'A uploads a sighting photo to its own folder'],
    ['sighting-photos', aPhotoForDelete, 'A uploads a second sighting photo'],
    ['avatars', aAvatar, 'A uploads an avatar to its own folder'],
  ]) {
    const error = await upload(a.client, bucket, path);
    if (!error) createdObjects.push([bucket, path]);
    const present = await fileExists(bucket, path);
    record('Legitimate use (must be allowed)', label, present ? 'allowed' : `blocked: ${error?.message ?? 'file absent'}`, present);
  }

  // ── Cross-account tampering: must all be blocked ──────────────────────────
  {
    const { error } = await b.client.storage.from('sighting-photos').remove([aPhoto]);
    const stillThere = await fileExists('sighting-photos', aPhoto);
    record(
      'Cross-account tampering (must be blocked)',
      "B deletes A's sighting photo",
      stillThere ? 'blocked' : 'SUCCEEDED - file is gone',
      stillThere,
    );
    if (error && stillThere) { /* an explicit error is fine; the file survived */ }
  }

  {
    await b.client.storage.from('avatars').remove([aAvatar]);
    const stillThere = await fileExists('avatars', aAvatar);
    record(
      'Cross-account tampering (must be blocked)',
      "B deletes A's avatar",
      stillThere ? 'blocked' : 'SUCCEEDED - file is gone',
      stillThere,
    );
  }

  {
    await upload(b.client, 'sighting-photos', intruder);
    const landed = await fileExists('sighting-photos', intruder);
    if (landed) createdObjects.push(['sighting-photos', intruder]);
    record(
      'Cross-account tampering (must be blocked)',
      "B writes a file into A's folder",
      landed ? 'SUCCEEDED - file was written' : 'blocked',
      !landed,
    );
  }

  // ── Owner's own delete must still work after the fix ──────────────────────
  {
    await a.client.storage.from('sighting-photos').remove([aPhotoForDelete]);
    const gone = !(await fileExists('sighting-photos', aPhotoForDelete));
    record('Legitimate use (must be allowed)', 'A deletes its own sighting photo', gone ? 'allowed' : 'BLOCKED', gone);
  }

  {
    await a.client.storage.from('avatars').remove([aAvatar]);
    const gone = !(await fileExists('avatars', aAvatar));
    record('Legitimate use (must be allowed)', 'A deletes its own avatar', gone ? 'allowed' : 'BLOCKED', gone);
  }
}

async function cleanup() {
  const byBucket = new Map();
  for (const [bucket, path] of createdObjects) {
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(path);
  }
  for (const [bucket, paths] of byBucket) {
    await admin.storage.from(bucket).remove(paths).catch(() => {});
  }
  for (const id of createdUsers) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\nCleaned up ${createdUsers.length} throwaway account(s) and their probe files.`);
}

let failed = false;
try {
  await main();
} catch (err) {
  console.error(`\nProbe aborted: ${err.message}`);
  failed = true;
} finally {
  await cleanup();
}

if (results.length > 0) {
  let lastGroup = null;
  for (const r of results) {
    if (r.group !== lastGroup) {
      console.log(`\n${r.group}`);
      lastGroup = r.group;
    }
    const mark = r.ok ? 'OK' : 'PROBLEM';
    console.log(`  ${r.name.padEnd(46)} ${r.outcome.padEnd(28)} ${mark}`);
  }
}

// Set exitCode and let the process end on its own rather than calling
// process.exit(). The Supabase client's HTTP keep-alive sockets are still
// closing at this point, and forcing exit trips a libuv assertion on Windows
// (`!(handle->flags & UV_HANDLE_CLOSING)` in src\win\async.c).
const holes = results.filter((r) => !r.ok);
console.log('');
if (failed) {
  console.log('Probe did not finish - results above are incomplete.');
  process.exitCode = 1;
} else if (holes.length === 0) {
  console.log('All checks behaved correctly: owners can manage their own files, and');
  console.log('a second account cannot touch them.');
  process.exitCode = 0;
} else {
  console.log(`${holes.length} check(s) did not behave correctly:`);
  for (const h of holes) console.log(`  - ${h.name}: ${h.outcome}`);
  console.log('\nIf the tampering checks succeeded, apply supabase/storage_setup.sql to this');
  console.log('project and re-run.');
  process.exitCode = 1;
}
