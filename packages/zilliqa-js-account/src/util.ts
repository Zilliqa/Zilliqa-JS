import { ReqMiddlewareFn, RPCMethod } from '@zilliqa-js/core';
import { bytes, validation } from '@zilliqa-js/util';
// tslint:disable-next-line
import { ZilliqaMessage } from 'proto';
import { TxReceipt, TxParams } from './types';

/**
 * encodeTransaction
 *
 * @deprecated
 * @param {TxParams} tx - JSON-encoded tx to convert to a byte array
 * @returns {Buffer} - Buffer of bytes
 */
export const encodeTransaction = (tx: TxParams): Buffer => {
  const codeHex = Buffer.from(tx.code || '').toString('hex');
  const dataHex = Buffer.from(tx.data || '').toString('hex');

  const encoded =
    bytes.intToHexArray(tx.version, 64).join('') +
    bytes.intToHexArray(tx.nonce || 0, 64).join('') +
    tx.toAddr +
    tx.pubKey +
    tx.amount.toString('hex', 64) +
    tx.gasPrice.toString('hex', 64) +
    tx.gasLimit.toString('hex', 64) +
    bytes.intToHexArray((tx.code && tx.code.length) || 0, 8).join('') + // size of code
    codeHex +
    bytes.intToHexArray((tx.data && tx.data.length) || 0, 8).join('') + // size of data
    dataHex;

  return Buffer.from(encoded, 'hex');
};

export const encodeTransactionProto = (tx: TxParams): Buffer => {
  const msg = ZilliqaMessage.ProtoTransactionCoreInfo.create({
    version: ZilliqaMessage.ByteArray.create({
      data: bytes.intToByteArray(tx.version, 32),
    }),
    nonce: ZilliqaMessage.ByteArray.create({
      data: bytes.intToByteArray(tx.nonce || 0, 32),
    }),
    toaddr: bytes.hexToByteArray(tx.toAddr),
    senderpubkey: ZilliqaMessage.ByteArray.create({
      data: bytes.hexToByteArray(tx.pubKey || '00'),
    }),
    amount: ZilliqaMessage.ByteArray.create({
      data: Uint8Array.from(tx.amount.toArrayLike(Buffer, undefined, 32)),
    }),
    gasprice: ZilliqaMessage.ByteArray.create({
      data: Uint8Array.from(tx.gasPrice.toArrayLike(Buffer, undefined, 32)),
    }),
    gaslimit: ZilliqaMessage.ByteArray.create({
      data: Uint8Array.from(tx.gasLimit.toArrayLike(Buffer, undefined, 32)),
    }),
    code: Uint8Array.from(
      [...(tx.code || '')].map((c) => <number>c.charCodeAt(0)),
    ),
    data: Uint8Array.from(
      [...(tx.data || '')].map((c) => <number>c.charCodeAt(0)),
    ),
  });

  return Buffer.from(
    ZilliqaMessage.ProtoTransactionCoreInfo.encode(msg).finish(),
  );
};

export const isTxReceipt = (x: unknown): x is TxReceipt => {
  return validation.isPlainObject(x) && validation.matchesObject(x, {});
};

export const isTxParams = (obj: unknown): obj is TxParams => {
  const validator = {
    version: [validation.required(validation.isNumber)],
    toAddr: [validation.required(validation.isAddress)],
    amount: [validation.required(validation.isBN)],
    gasPrice: [validation.required(validation.isBN)],
    gasLimit: [validation.required(validation.isBN)],
    code: [validation.isString],
    data: [validation.isString],
    receipt: [isTxReceipt],
    nonce: [validation.required(validation.isNumber)],
    signature: [validation.required(validation.isSignature)],
  };

  return validation.matchesObject(obj, validator);
};

export const formatOutgoingTx: ReqMiddlewareFn<[TxParams]> = (req) => {
  if (
    req.payload.method === RPCMethod.CreateTransaction &&
    isTxParams(req.payload.params[0])
  ) {
    const txConfig = req.payload.params[0];

    const ret = {
      ...req,
      payload: {
        ...req.payload,
        params: [
          {
            ...txConfig,
            amount: txConfig.amount.toString(),
            gasLimit: txConfig.gasLimit.toString(),
            gasPrice: txConfig.gasPrice.toString(),
          },
        ],
      },
    };

    return ret;
  }

  return req;
};

export async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}
