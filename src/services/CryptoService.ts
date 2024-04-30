import { env } from 'vscode';
import * as crypto from 'crypto';

const algorithm = 'aes-256-cbc';

export class CryptoService {
    public static encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const salt = crypto.randomBytes(32);
        const secretKey = crypto.scryptSync(env.machineId, salt, 32);

        const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

        let encrypted = cipher.update(Buffer.from(text, "utf8"));
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        return Buffer.from(JSON.stringify({
            iv: iv.toString('hex'),
            salt: salt.toString("hex"),
            text: encrypted.toString('hex')
        })).toString("base64");
    }

    public static decrypt(encrypted: string) {
        const data = JSON.parse(Buffer.from(encrypted, "base64").toString("utf-8"));
        const secretKey = crypto.scryptSync(env.machineId, Buffer.from(data.salt, "hex"), 32);

        const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(data.iv, "hex"));

        let decrypted = decipher.update(Buffer.from(data.text, "hex"));
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString("utf-8");
    }
}
