import aes from 'aes-js';
import hashjs from 'hash.js';
import pbkdf2 from 'pbkdf2';
import scrypt from 'scrypt.js';
import uuid from 'uuid';

import { bytes } from '@zilliqa-js/util';

import { randomBytes } from './random';
import {
  KeystoreV3,
  KDF,
  KDFParams,
  PBKDF2Params,
  ScryptParams,
} from './types';
import { getAddressFromPrivateKey } from './util';

/**
 * getDerivedKey
 *
 * NOTE: only scrypt and pbkdf2 are supported.
 *
 * @param {Buffer} key - the passphrase
 * @param {KDF} kdf - the key derivation function to be used
 * @param {KDFParams} params - params for the kdf
 *
 * @returns {Promise<Buffer>}
 */
async function getDerivedKey(
  key: Buffer,
  kdf: KDF,
  params: KDFParams,
): Promise<Buffer> {
  const salt = Buffer.from(params.salt, 'hex');

  if (kdf === 'pbkdf2') {
    const { c, dklen } = params as PBKDF2Params;
    return pbkdf2.pbkdf2Sync(key, salt, c, dklen, 'sha256');
  }

  if (kdf === 'scrypt') {
    const { n, r, p, dklen } = params as ScryptParams;
    return scrypt(key, salt, n, r, p, dklen);
  }

  throw new Error('Only pbkdf2 and scrypt are supported');
}

/**
 * encryptPrivateKey
 *
 * Encodes and encrypts an account in the format specified by
 * https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition.
 * However, note that, in keeping with the hash function used by Zilliqa's
 * core protocol, the MAC is generated using sha256 instead of keccak.
 *
 * NOTE: only scrypt and pbkdf2 are supported.
 *
 * @param {KDF} kdf - the key derivation function to be used
 * @param {string} privateKey - hex-encoded private key
 * @param {string} passphrase - a passphrase used for encryption
 *
 * @returns {Promise<string>}
 */
export const encryptPrivateKey = async (
  kdf: KDF,
  privateKey: string,
  passphrase: string,
): Promise<string> => {
  const address = getAddressFromPrivateKey(privateKey);
  const salt = randomBytes(32);
  const iv = Buffer.from(randomBytes(16), 'hex');
  const kdfparams = {
    salt,
    n: 8192,
    c: 262144,
    r: 8,
    p: 1,
    dklen: 32,
  };

  const derivedKey = await getDerivedKey(
    Buffer.from(passphrase),
    kdf,
    kdfparams,
  );
  const cipher = new aes.ModeOfOperation.ctr(
    derivedKey.slice(0, 16),
    new aes.Counter(iv),
  );
  const ciphertext = Buffer.from(
    cipher.encrypt(Buffer.from(privateKey, 'hex')),
  );

  return JSON.stringify({
    address,
    crypto: {
      cipher: 'aes-128-ctr',
      cipherparams: {
        iv: iv.toString('hex'),
      },
      ciphertext: ciphertext.toString('hex'),
      kdf,
      kdfparams,
      mac: hashjs
        .sha256()
        .update(Buffer.concat([derivedKey.slice(16, 32), ciphertext]), 'hex')
        .digest('hex'),
    },
    id: uuid.v4({ random: bytes.hexToIntArray(randomBytes(16)) }),
    version: 3,
  });
};

/**
 * decryptPrivateKey
 *
 * Recovers the private key from a keystore file using the given passphrase.
 *
 * @param {string} passphrase
 * @param {KeystoreV3} keystore
 * @returns {Promise<string>}
 */
export const decryptPrivateKey = async (
  passphrase: string,
  keystore: KeystoreV3,
): Promise<string> => {
  const ciphertext = Buffer.from(keystore.crypto.ciphertext, 'hex');
  const iv = Buffer.from(keystore.crypto.cipherparams.iv, 'hex');
  const kdfparams = keystore.crypto.kdfparams;

  const derivedKey = await getDerivedKey(
    Buffer.from(passphrase),
    keystore.crypto.kdf,
    kdfparams,
  );

  const mac = hashjs
    .sha256()
    .update(Buffer.concat([derivedKey.slice(16, 32), ciphertext]), 'hex')
    .digest('hex');

  // we need to do a byte-by-byte comparison to avoid non-constant time side
  // channel attacks.
  if (!bytes.isEqual(mac.toUpperCase(), keystore.crypto.mac.toUpperCase())) {
    return Promise.reject('Failed to decrypt.');
  }

  const cipher = new aes.ModeOfOperation.ctr(
    derivedKey.slice(0, 16),
    new aes.Counter(iv),
  );

  return Buffer.from(cipher.decrypt(ciphertext)).toString('hex');
};
