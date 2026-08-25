#!/usr/bin/env node
/**
 * Shoprex backup and restore.
 *
 * Phase 8 deliverable: "database backup/recovery test". A backup nobody has
 * ever restored is not a backup — it is a file. So this is one script with
 * three verbs, and the third is the one that matters:
 *
 *   node scripts/backup.js backup  [--out <dir>]
 *   node scripts/backup.js restore --file <dump> [--url <target>] [--force]
 *   node scripts/backup.js verify  [--keep]
 *
 * `verify` is the actual test: it takes a real backup of the configured
 * database, restores it into a scratch database beside it, counts the rows in
 * every tenant-bearing table on both sides, and fails loudly if any of them
 * disagree. It never writes to the database it read from.
 *
 * ## Why `pg_dump` in custom format
 *
 * `-Fc` gives a compressed archive that `pg_restore` can load selectively and
 * in parallel, and — unlike a plain SQL file — it cannot be half-applied by a
 * shell redirect that ran out of disk. `--no-owner --no-privileges` so a dump
 * taken as `postgres` locally restores as whatever role the pilot host uses;
 * role names are deployment detail, and a backup that only restores onto an
 * identically-named role is a backup with a hidden dependency.
 *
 * ## What this deliberately does not do
 *
 * No schedule, no offsite copy, no encryption, no retention policy. Those are
 * decisions about where a pilot is hosted, and the owner has not made them
 * yet — see PROGRESS.md §8. This is the mechanism and the proof that it works;
 * the operational policy sits on top of it.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/** Tables whose row counts must survive a round trip. */
const COUNTED_TABLES = [
  'businesses',
  'branches',
  'users',
  'branch_assignments',
  'devices',
  'device_enrollment_tokens',
  'audit_events',
  'products',
  'product_units',
  'unit_relationships',
  'barcodes',
  'stock_receipts',
  'stock_receipt_lines',
  'stock_movements',
  'physical_stock',
  'payment_methods',
  'sales',
  'sale_lines',
  'sale_payments',
];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith('--')) {
      const key = token.slice(2);

      // Bare flags take no value; everything else consumes the next token.
      if (key === 'force' || key === 'keep') {
        args[key] = true;
      } else {
        index += 1;
        args[key] = argv[index];
      }
    } else {
      args._.push(token);
    }
  }

  return args;
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    fail('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  }

  return url;
}

/**
 * Splits a connection string into the pieces the postgres CLI tools want.
 *
 * The password goes in the environment as PGPASSWORD rather than onto the
 * command line, where it would sit in the shell history and in `ps` output for
 * anyone on the machine to read.
 */
function connection(url) {
  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function run(command, argv, { env = {}, input } = {}) {
  return execFileSync(command, argv, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function psql(target, sql) {
  return run(
    'psql',
    [
      '--host', target.host,
      '--port', target.port,
      '--username', target.user,
      '--dbname', target.database,
      '--no-align',
      '--tuples-only',
      '--quiet',
      '--command', sql,
    ],
    { env: { PGPASSWORD: target.password } },
  ).trim();
}

/** Row counts for every table that holds a shop's data. */
function countRows(target, schema) {
  const counts = {};

  for (const table of COUNTED_TABLES) {
    const exists = psql(
      target,
      `SELECT to_regclass('${schema}.${table}') IS NOT NULL`,
    );

    // A table the schema has not reached yet counts as absent on both sides
    // rather than as a mismatch, so this script survives being run against an
    // older migration state.
    counts[table] = exists === 't' ? Number(psql(target, `SELECT count(*) FROM ${schema}.${table}`)) : null;
  }

  return counts;
}

function backup(args) {
  const url = requireDatabaseUrl();
  const target = connection(url);
  const outDir = args.out || path.join(__dirname, '..', 'backups');

  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `shoprex-${target.database}-${stamp}.dump`);

  console.log(`Backing up ${target.database} on ${target.host}:${target.port} …`);

  run(
    'pg_dump',
    [
      '--host', target.host,
      '--port', target.port,
      '--username', target.user,
      '--dbname', target.database,
      '--format', 'custom',
      '--no-owner',
      '--no-privileges',
      '--file', file,
    ],
    { env: { PGPASSWORD: target.password } },
  );

  const size = fs.statSync(file).size;

  console.log(`Wrote ${file} (${(size / 1024).toFixed(1)} KB)`);
  console.log('\nA backup nobody has restored is a file, not a backup.');
  console.log('Prove this one: node scripts/backup.js verify');

  return file;
}

function restore(args) {
  if (!args.file) {
    fail('restore needs --file <dump>. Run `node scripts/backup.js backup` first.');
  }

  if (!fs.existsSync(args.file)) {
    fail(`No such dump: ${args.file}`);
  }

  const url = args.url || requireDatabaseUrl();
  const target = connection(url);

  // Restoring over a live database is the one operation here that destroys
  // data, so it is never the default and never implied.
  if (!args.url && !args.force) {
    fail(
      `This would restore over ${target.database}, the database DATABASE_URL points at.\n` +
        '  Pass --url to restore somewhere else, or --force if that is genuinely what you want.',
    );
  }

  console.log(`Restoring ${args.file} into ${target.database} …`);

  try {
    run(
      'pg_restore',
      [
        '--host', target.host,
        '--port', target.port,
        '--username', target.user,
        '--dbname', target.database,
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        args.file,
      ],
      { env: { PGPASSWORD: target.password } },
    );
  } catch (error) {
    // pg_restore exits non-zero for warnings as well as errors — a DROP of
    // something that was not there is normal with --clean. Report and continue
    // to the count check rather than hiding it or panicking about it.
    console.warn('pg_restore reported warnings:');
    console.warn(String(error.stdout || '') + String(error.stderr || ''));
  }

  console.log('Restored.');
}

/**
 * The deliverable: back up, restore elsewhere, and prove the data came back.
 */
function verify(args) {
  const url = requireDatabaseUrl();
  const source = connection(url);
  const scratchName = `${source.database}_restore_check`;

  const admin = { ...source, database: 'postgres' };
  const scratch = { ...source, database: scratchName };

  console.log('1. Counting rows in the live database …');
  const before = countRows(source, source.schema);

  console.log('2. Taking a backup …');
  const file = backup({ out: args.out });

  console.log(`3. Creating a scratch database ${scratchName} …`);
  psql(admin, `DROP DATABASE IF EXISTS "${scratchName}"`);
  psql(admin, `CREATE DATABASE "${scratchName}"`);

  try {
    console.log('4. Restoring the backup into it …');
    restore({ file, url: `postgresql://${encodeURIComponent(source.user)}:${encodeURIComponent(source.password)}@${source.host}:${source.port}/${scratchName}` });

    console.log('5. Counting rows in the restored copy …');
    const after = countRows(scratch, source.schema);

    const mismatches = COUNTED_TABLES.filter((table) => before[table] !== after[table]);

    console.log('\n  table                      live   restored');
    console.log('  ------------------------------------------');

    for (const table of COUNTED_TABLES) {
      const live = before[table] === null ? '—' : String(before[table]);
      const copy = after[table] === null ? '—' : String(after[table]);
      const flag = before[table] === after[table] ? ' ' : '✗';

      console.log(`  ${flag} ${table.padEnd(24)} ${live.padStart(4)}   ${copy.padStart(8)}`);
    }

    if (mismatches.length > 0) {
      fail(`RECOVERY FAILED. These tables did not come back: ${mismatches.join(', ')}`);
    }

    const total = COUNTED_TABLES.reduce((sum, table) => sum + (before[table] || 0), 0);

    console.log(`\n  Recovery verified: ${total} rows across ${COUNTED_TABLES.length} tables.`);
    console.log(`  Backup: ${file}`);
  } finally {
    if (args.keep) {
      console.log(`\n  Left ${scratchName} in place (--keep).`);
    } else {
      psql(admin, `DROP DATABASE IF EXISTS "${scratchName}"`);
      console.log(`\n  Dropped ${scratchName}.`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verb = args._[0];

  try {
    if (verb === 'backup') {
      backup(args);
    } else if (verb === 'restore') {
      restore(args);
    } else if (verb === 'verify') {
      verify(args);
    } else {
      console.log('Usage:');
      console.log('  node scripts/backup.js backup  [--out <dir>]');
      console.log('  node scripts/backup.js restore --file <dump> [--url <target>] [--force]');
      console.log('  node scripts/backup.js verify  [--keep] [--out <dir>]');
      process.exit(verb ? 1 : 0);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail(
        'pg_dump, pg_restore, or psql was not found on PATH.\n' +
          '  They ship with PostgreSQL; on Windows they live in\n' +
          '  C:\\Program Files\\PostgreSQL\\17\\bin.',
      );
    }

    fail(String(error.stderr || error.message));
  }
}

main();
