import { env } from 'vscode';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';

const algorithm = 'aes-256-cbc';
const keyLength = 32;
const saltLength = 16;
const ivLength = 16;

export class CryptoService {
    public static encrypt(text: string): string {
        const iv = randomBytes(ivLength);
        const salt = randomBytes(saltLength);
        const secretKey = scryptSync(env.machineId, salt, keyLength);
        const cipher = createCipheriv(algorithm, secretKey, iv);
        const encrypted = cipher.update(Buffer.from(text, "utf8"));

        return Buffer.from(JSON.stringify({
            iv: iv.toString('hex'),
            salt: salt.toString("hex"),
            text: Buffer.concat([encrypted, cipher.final()]).toString('hex')
        })).toString("base64");
    }

    public static decrypt(encrypted: string): string {
        const data = JSON.parse(Buffer.from(encrypted, "base64").toString("utf8"));
        const secretKey = scryptSync(env.machineId, Buffer.from(data.salt, "hex"), keyLength);
        const decipher = createDecipheriv(algorithm, secretKey, Buffer.from(data.iv, "hex"));
        const decrypted = decipher.update(Buffer.from(data.text, "hex"));

        return Buffer.concat([decrypted, decipher.final()]).toString("utf8");
    }
}
