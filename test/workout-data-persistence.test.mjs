import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicReplace, withTargetLock } from '../src/workout-data/workspace.mjs';
import { ResourceRequestError } from '../src/workout-data/resources.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'workout-data-persistence-'));
}

function temporaryEntries(directory) {
  return fs.readdirSync(directory).filter((entry) => entry.includes('.workout-data-'));
}

test('withTargetLock rejects an existing stale lock without removing it', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const lock = `${target}.lock`;
  writeFileSync(lock, 'other process\n');
  utimesSync(lock, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));

  await assert.rejects(
    withTargetLock(target, async () => assert.fail('locked action must not run')),
    (error) => error instanceof ResourceRequestError && error.code === 'conflict',
  );

  assert.equal(readFileSync(lock, 'utf8'), 'other process\n');
});

test('withTargetLock removes only the lock it acquired after its action', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  let lockWasPresent = false;

  const value = await withTargetLock(target, async () => {
    lockWasPresent = fs.existsSync(`${target}.lock`);
    return 'written';
  });

  assert.equal(value, 'written');
  assert.equal(lockWasPresent, true);
  assert.equal(fs.existsSync(`${target}.lock`), false);
});

test('withTargetLock leaves a replacement lock owned by another writer', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const lock = `${target}.lock`;

  await withTargetLock(target, async () => {
    fs.unlinkSync(lock);
    writeFileSync(lock, 'replacement owner\n');
  });

  assert.equal(readFileSync(lock, 'utf8'), 'replacement owner\n');
});

test('withTargetLock removes its lock when writing the token throws', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const failingFs = { ...fs, writeSync: () => { throw new Error('lock write failed'); } };

  await assert.rejects(withTargetLock(target, async () => assert.fail('action must not run'), failingFs), /lock write failed/);

  assert.equal(fs.existsSync(`${target}.lock`), false);
});

test('withTargetLock removes its lock when a token write makes no progress', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const partialFs = { ...fs, writeSync: () => 0 };

  await assert.rejects(withTargetLock(target, async () => assert.fail('action must not run'), partialFs), /Unable to write lock/);

  assert.equal(fs.existsSync(`${target}.lock`), false);
});

test('withTargetLock closes and removes its new lock when identity capture fails', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'programs', 'plan', 'mesocycle-1', 'sessions.yaml');
  let closed = false;
  const failingFs = {
    ...fs,
    fstatSync: () => { throw new Error('identity capture failed'); },
    closeSync: (descriptor) => {
      closed = true;
      return fs.closeSync(descriptor);
    },
  };

  await assert.rejects(withTargetLock(target, async () => assert.fail('action must not run'), failingFs), /identity capture failed/);

  assert.equal(closed, true);
  assert.equal(fs.existsSync(`${target}.lock`), false);
  assert.equal(fs.existsSync(join(directory, 'programs')), false);
});

test('withTargetLock supports a new mesocycle target and retains its directories after atomic replacement', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'programs', 'plan', 'mesocycle-1', 'sessions.yaml');

  await withTargetLock(target, async () => atomicReplace(target, 'sessions: []\n'));

  assert.equal(readFileSync(target, 'utf8'), 'sessions: []\n');
  assert.equal(fs.existsSync(`${target}.lock`), false);
});

test('withTargetLock removes directories it created when its action fails', async () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'programs', 'plan', 'mesocycle-1', 'sessions.yaml');

  await assert.rejects(withTargetLock(target, async () => { throw new Error('validation failed'); }), /validation failed/);

  assert.equal(fs.existsSync(join(directory, 'programs')), false);
});

test('atomicReplace preserves target mode and leaves no temporary artifact', () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  writeFileSync(target, 'old: value\n', { mode: 0o640 });
  fs.chmodSync(target, 0o640);

  atomicReplace(target, 'new: value\n');

  assert.equal(readFileSync(target, 'utf8'), 'new: value\n');
  assert.equal(statSync(target).mode & 0o777, 0o640);
  assert.deepEqual(temporaryEntries(directory), []);
});

test('atomicReplace removes its temporary file and newly created directories when writing fails', () => {
  const directory = temporaryDirectory();
  const targetDirectory = join(directory, 'programs', 'plan', 'mesocycle-1');
  const target = join(targetDirectory, 'sessions.yaml');
  const failingFs = { ...fs, writeSync: () => { throw new Error('disk full'); } };

  assert.throws(() => atomicReplace(target, 'sessions: []\n', failingFs), /disk full/);

  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(targetDirectory), false);
  assert.equal(fs.existsSync(join(directory, 'programs')), false);
  assert.deepEqual(temporaryEntries(directory), []);
});

test('atomicReplace leaves original bytes unchanged and removes its temporary file when fsync fails', () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const original = 'old: value\n';
  writeFileSync(target, original);
  let fsyncCalls = 0;
  const failingFs = {
    ...fs,
    fsyncSync: (descriptor) => {
      fsyncCalls += 1;
      if (fsyncCalls === 1) throw new Error('fsync failed');
      return fs.fsyncSync(descriptor);
    },
  };

  assert.throws(() => atomicReplace(target, 'new: value\n', failingFs), /fsync failed/);

  assert.equal(readFileSync(target, 'utf8'), original);
  assert.deepEqual(temporaryEntries(directory), []);
});

test('atomicReplace leaves original bytes unchanged and removes its temporary file when rename fails', () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  const original = 'old: value\n';
  writeFileSync(target, original);
  const failingFs = { ...fs, renameSync: () => { throw new Error('rename failed'); } };

  assert.throws(() => atomicReplace(target, 'new: value\n', failingFs), /rename failed/);

  assert.equal(readFileSync(target, 'utf8'), original);
  assert.deepEqual(temporaryEntries(directory), []);
});

test('atomicReplace never deletes a colliding temporary file it did not create', () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  let collidingTemporaryPath;
  const collisionFs = {
    ...fs,
    openSync: (path, flags, mode) => {
      if (flags === 'wx' && path.includes('.workout-data-')) {
        collidingTemporaryPath = path;
        writeFileSync(path, 'another writer\n');
        const error = new Error('already exists');
        error.code = 'EEXIST';
        throw error;
      }
      return fs.openSync(path, flags, mode);
    },
  };

  assert.throws(() => atomicReplace(target, 'new: value\n', collisionFs), /already exists/);

  assert.equal(readFileSync(collidingTemporaryPath, 'utf8'), 'another writer\n');
  assert.equal(fs.existsSync(target), false);
});

test('atomicReplace succeeds when the post-rename directory fsync fails', () => {
  const directory = temporaryDirectory();
  const target = join(directory, 'profile.yaml');
  writeFileSync(target, 'old: value\n');
  let fsyncCalls = 0;
  const directoryFsyncFailure = {
    ...fs,
    fsyncSync: (descriptor) => {
      fsyncCalls += 1;
      if (fsyncCalls === 2) throw new Error('directory fsync failed');
      return fs.fsyncSync(descriptor);
    },
  };

  assert.doesNotThrow(() => atomicReplace(target, 'new: value\n', directoryFsyncFailure));

  assert.equal(readFileSync(target, 'utf8'), 'new: value\n');
  assert.deepEqual(temporaryEntries(directory), []);
});
