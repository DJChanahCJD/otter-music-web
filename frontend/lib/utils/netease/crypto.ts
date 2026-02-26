import * as crypto from 'crypto';

const NONCE = '0CoJUm6Qyw8W8jud';
const PUB_KEY = '010001';
const MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const EAPI_KEY = 'e82ckenh8dichen8';

function createSecretKey(size: number): string {
  const result = [];
  const choice = '012345679abcdef'.split('');
  for (let i = 0; i < size; i += 1) {
    const index = Math.floor(Math.random() * choice.length);
    result.push(choice[index]);
  }
  return result.join('');
}

function aesEncrypt(text: string, secKey: string, algo: 'AES-CBC' | 'AES-ECB', ivString: string = '0102030405060708'): Buffer {
  const key = Buffer.from(secKey, 'utf-8');
  const iv = algo === 'AES-CBC' ? Buffer.from(ivString, 'utf-8') : null;
  const algorithm = algo === 'AES-CBC' ? 'aes-128-cbc' : 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, key, iv || Buffer.alloc(0));
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
}

function rsaEncrypt(text: string, pubKey: string, modulus: string): string {
  const reversedText = text.split('').reverse().join('');
  const modulusBigInt = BigInt('0x' + modulus);
  const pubKeyBigInt = BigInt('0x' + pubKey);
  const textBigInt = BigInt('0x' + Buffer.from(reversedText).toString('hex'));
  const encrypted = textBigInt ** pubKeyBigInt % modulusBigInt;
  return encrypted.toString(16).padStart(256, '0');
}

export function weapi(object: unknown) {
  const text = JSON.stringify(object);
  const secKey = createSecretKey(16);
  const enc1 = aesEncrypt(text, NONCE, 'AES-CBC');
  const b64enc1 = enc1.toString('base64');
  const enc2 = aesEncrypt(b64enc1, secKey, 'AES-CBC');
  const b64enc2 = enc2.toString('base64');
  const encSecKey = rsaEncrypt(secKey, PUB_KEY, MODULUS);
  return {
    params: b64enc2,
    encSecKey: encSecKey,
  };
}

export function eapi(url: string, object: unknown) {
  const text = typeof object === 'object' ? JSON.stringify(object) : String(object);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = crypto.createHash('md5').update(message).digest('hex');
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const enc = aesEncrypt(data, EAPI_KEY, 'AES-ECB');
  return {
    params: enc.toString('hex').toUpperCase(),
  };
}
