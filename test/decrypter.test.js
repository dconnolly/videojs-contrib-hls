// see docs/hlse.md for instructions on how test data was generated
import QUnit from 'qunit';
import sinon from 'sinon';
import {decrypt, Decrypter, AsyncStream} from '../src/decrypter';

// see docs/hlse.md for instructions on how test data was generated
const stringFromBytes = function(bytes) {
  let result = '';

  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
};

const bytesToASCIIString = function(bytes) {
  return String.fromCharCode.apply(null, new Uint8Array(bytes));
};

QUnit.module('Decryption');

QUnit.test('decrypts a single AES-128 with PKCS7 block', function(assert) {
  let key = new Uint32Array([0, 0, 0, 0]);
  let iv = key;
  // the string "howdy folks" encrypted
  let encrypted = new Uint8Array([
    0xce, 0x90, 0x97, 0xd0,
    0x08, 0x46, 0x4d, 0x18,
    0x4f, 0xae, 0x01, 0x1c,
    0x82, 0xa8, 0xf0, 0x67
  ]);

  assert.expect(1);

  return decrypt(encrypted, key, iv).then(function(result) {
    QUnit.deepEqual(bytesToASCIIString(result),
                    'howdy folks',
                    'decrypted with a byte array key'
                   );
  }).catch(function(result) {
    console.log('decryption fail', result);
  });
});

QUnit.test('decrypts multiple AES-128 blocks with CBC', function(assert) {
  let key = new Uint32Array([0, 0, 0, 0]);
  let initVector = key;
  // the string "0123456789abcdef01234" encrypted
  let encrypted = new Uint8Array([
    0x14, 0xf5, 0xfe, 0x74,
    0x69, 0x66, 0xf2, 0x92,
    0x65, 0x1c, 0x22, 0x88,
    0xbb, 0xff, 0x46, 0x09,

    0x0b, 0xde, 0x5e, 0x71,
    0x77, 0x87, 0xeb, 0x84,
    0xa9, 0x54, 0xc2, 0x45,
    0xe9, 0x4e, 0x29, 0xb3
  ]);

  assert.expect(1);

  return decrypt(encrypted, key, initVector).then(function(result) {
    QUnit.deepEqual(stringFromBytes(result),
                    '0123456789abcdef01234',
                    'decrypted multiple blocks'
                   );
  });
});

QUnit.test(
'verify that the deepcopy works by doing two decrypts in the same test',
  function(assert) {
    let key = new Uint32Array([0, 0, 0, 0]);
    let initVector = key;

    // the string "howdy folks" encrypted
    let pkcs7Block = new Uint8Array([
      0xce, 0x90, 0x97, 0xd0,
      0x08, 0x46, 0x4d, 0x18,
      0x4f, 0xae, 0x01, 0x1c,
      0x82, 0xa8, 0xf0, 0x67
    ]);

    // the string "0123456789abcdef01234" encrypted
    let cbcBlocks = new Uint8Array([
      0x14, 0xf5, 0xfe, 0x74,
      0x69, 0x66, 0xf2, 0x92,
      0x65, 0x1c, 0x22, 0x88,
      0xbb, 0xff, 0x46, 0x09,

      0x0b, 0xde, 0x5e, 0x71,
      0x77, 0x87, 0xeb, 0x84,
      0xa9, 0x54, 0xc2, 0x45,
      0xe9, 0x4e, 0x29, 0xb3
    ]);

    let pkcs7Promise = decrypt(pkcs7Block, key, initVector);
    let cbcPromise = decrypt(cbcBlocks, key, initVector);

    assert.expect(2);
    return Promise.all([pkcs7Promise, cbcPromise]).then(function(results) {
      QUnit.deepEqual(stringFromBytes(results[0]),
                      'howdy folks',
                      'decrypted with a byte array key'
                     );
      QUnit.deepEqual(stringFromBytes(results[1]),
                      '0123456789abcdef01234',
                      'decrypted multiple blocks'
                     );
    });
  });

QUnit.module('Incremental Processing', {
  beforeEach() {
    this.clock = sinon.useFakeTimers();
  },
  afterEach() {
    this.clock.restore();
  }
});

QUnit.test('executes a callback after a timeout', function() {
  let asyncStream = new AsyncStream();
  let calls = '';

  asyncStream.push(function() {
    calls += 'a';
  });

  this.clock.tick(asyncStream.delay);
  QUnit.equal(calls, 'a', 'invoked the callback once');
  this.clock.tick(asyncStream.delay);
  QUnit.equal(calls, 'a', 'only invoked the callback once');
});

QUnit.test('executes callback in series', function() {
  let asyncStream = new AsyncStream();
  let calls = '';

  asyncStream.push(function() {
    calls += 'a';
  });
  asyncStream.push(function() {
    calls += 'b';
  });

  this.clock.tick(asyncStream.delay);
  QUnit.equal(calls, 'a', 'invoked the first callback');
  this.clock.tick(asyncStream.delay);
  QUnit.equal(calls, 'ab', 'invoked the second');
});

QUnit.module('Incremental Decryption', {
  beforeEach() {
    this.clock = sinon.useFakeTimers();
  },
  afterEach() {
    this.clock.restore();
  }
});

QUnit.test('asynchronously decrypts a 4-word block', function(assert) {
  let key = new Uint32Array([0, 0, 0, 0]);
  let initVector = key;
  // the string "howdy folks" encrypted
  let encrypted = new Uint8Array([0xce, 0x90, 0x97, 0xd0,
                                  0x08, 0x46, 0x4d, 0x18,
                                  0x4f, 0xae, 0x01, 0x1c,
                                  0x82, 0xa8, 0xf0, 0x67]);
  let decrypted;
  let decrypter = new Decrypter(encrypted,
                                key,
                                initVector,
                                function(error, result) {
                                  if (error) {
                                    throw new Error(error);
                                  }
                                  decrypted = result;
                                  console.log(stringFromBytes(decrypted));
                                });

  QUnit.ok(!decrypted, 'asynchronously decrypts');
  this.clock.tick(decrypter.asyncStream_.delay * 2);

  QUnit.ok(decrypted, 'completed decryption');
  QUnit.deepEqual(
    stringFromBytes(decrypted),
    'howdy folks',
    'decrypts and unpads the result'
  );
});

QUnit.test('breaks up input greater than the step value', function() {
  let encrypted = new Int32Array(Decrypter.STEP + 4);
  let done = false;
  let decrypter = new Decrypter(encrypted,
                                new Uint32Array(4),
                                new Uint32Array(4),
                                function() {
                                  done = true;
                                });

  this.clock.tick(decrypter.asyncStream_.delay * 2);
  QUnit.ok(!done, 'not finished after two ticks');

  this.clock.tick(decrypter.asyncStream_.delay);
  QUnit.ok(done, 'finished after the last chunk is decrypted');
});
