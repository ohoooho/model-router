// packages/cli/src/license/taoxian-license.ts
// Taoxian License v1.2 verifier — TypeScript port of taoxian/installer/src/license.rs
// 协议: 跟 dopple/bin/taoxian-keygen v1.2 + bin/verify-license.sh v1.2 同协议互通
//
// 文件头 (11 字节): magic(4B="TXLC") + version(1B=0x01) + algorithm(2B LE=0x0001=RS256) + payload_len(4B LE u32)
// TLV: 每条 = [type:1B][length:2B LE u16][value:N B]
//   0x01 customer_id (变长 UTF-8)
//   0x02 hwid        (v1.2 砍, parser 看到 = 报错)
//   0x03 exp_mode    (1B, v1.2 only 0x00=permanent)
//   0x04 scopes      (8B bitmask u64 LE, 仅低 8 位有效)
//   0x05 issued_at   (8B unix timestamp u64 LE)
//   0x06 taoxian_version (1B u8)
//   0xFF end_marker  (0B)
// 签名: 256B PKCS#1 v1.5 + SHA-256 (RS256), 覆盖范围 = magic||version||algorithm||payload_len||payload
//
// 老板 2026-08-15 08:45 拍板: v1.2 砍 L1, 只留 L2 (成交 > 反作弊), 永远不绑机器

import { createVerify } from "node:crypto";
import { readFileSync } from "node:fs";

// ==================== 协议常量 ====================
export const MAGIC = Buffer.from("TXLC", "utf8"); // 4B
export const VERSION = 0x01;
export const ALGO_RS256 = 0x0001;
export const SIGNATURE_LEN = 256;
export const MIN_SIZE = 11 + SIGNATURE_LEN; // 11B header + 256B signature (payload 可为 0)

// TLV 编号 (跟 license.rs 完全一致)
export const TAG_CUSTOMER = 0x01;
export const TAG_HWID = 0x02; // v1.2 砍, parser 看到 = 拒绝
export const TAG_EXP_MODE = 0x03;
export const TAG_SCOPES = 0x04;
export const TAG_ISSUED_AT = 0x05;
export const TAG_TAOXIAN_VERSION = 0x06;
export const TAG_END_MARKER = 0xff;

// 默认 pubkey 路径 (跟 Rust 版 include_bytes!("../keys/taoxian-license.pub") 一致)
const DEFAULT_PUBKEY_PATHS = [
  "/etc/taoxian/license.pub",
  "/root/.taoxian/keys/taoxian-license.pub",
  process.env.TAOXIAN_LICENSE_PUBKEY || "",
].filter(Boolean);

// ==================== License 数据结构 ====================
export interface License {
  customerId: string;
  expMode: number; // 0 = permanent (v1.2 only)
  scopes: bigint; // u64 bitmask
  issuedAt: number; // unix timestamp (sec)
  taoxianVersion: number;
}

// ==================== 头部解析 ====================
function parseHeader(data: Buffer): { version: number; algorithm: number; payloadLen: number } {
  if (data.length < 11) throw new Error(`license too short: ${data.length} bytes (min 11)`);
  if (data.compare(MAGIC, 0, 4, 0, 4) !== 0) {
    throw new Error(`invalid magic: ${data.subarray(0, 4).toString("hex")} (expected TXLC)`);
  }
  const version = data.readUInt8(4);
  if (version !== VERSION) {
    throw new Error(`unsupported version: ${version} (v1.2 only supports 0x01)`);
  }
  const algorithm = data.readUInt16LE(5);
  if (algorithm !== ALGO_RS256) {
    throw new Error(`unsupported algorithm: ${algorithm} (v1.2 only RS256)`);
  }
  const payloadLen = data.readUInt32LE(7);
  return { version, algorithm, payloadLen };
}

// ==================== TLV 解析 ====================
function parseTlv(payload: Buffer): License {
  let offset = 0;
  let customerId = "";
  let expMode: number | null = null;
  let scopes = 0n;
  let issuedAt = 0;
  let taoxianVersion = 0;

  while (offset < payload.length) {
    if (offset + 3 > payload.length) {
      throw new Error(`TLV truncated at offset ${offset}`);
    }
    const tag = payload.readUInt8(offset);
    const len = payload.readUInt16LE(offset + 1);
    const valueStart = offset + 3;
    const valueEnd = valueStart + len;
    if (valueEnd > payload.length) {
      throw new Error(`TLV value out of bounds at offset ${offset} (len ${len}, avail ${payload.length - valueStart})`);
    }
    const value = payload.subarray(valueStart, valueEnd);

    switch (tag) {
      case TAG_CUSTOMER:
        customerId = value.toString("utf8");
        break;
      case TAG_HWID:
        // v1.2: 砍 L1, 看到 HWID TLV = 拒绝
        throw new Error("v1.2 license rejected: contains deprecated HWID TLV (0x02)");
      case TAG_EXP_MODE:
        expMode = value.readUInt8(0);
        break;
      case TAG_SCOPES:
        scopes = value.readBigUInt64LE(0);
        break;
      case TAG_ISSUED_AT:
        issuedAt = Number(value.readBigUInt64LE(0));
        break;
      case TAG_TAOXIAN_VERSION:
        taoxianVersion = value.readUInt8(0);
        break;
      case TAG_END_MARKER:
        if (len !== 0) {
          throw new Error(`END_MARKER must have length 0, got ${len}`);
        }
        offset = valueEnd;
        break;
      default:
        // v1.2: 未知 TLV 跳过 (跟 bash 版兼容)
        break;
    }
    offset = valueEnd;
  }

  if (customerId === "") throw new Error("license missing required TLV: customer_id (0x01)");
  if (expMode === null) throw new Error("license missing required TLV: exp_mode (0x03)");

  return {
    customerId,
    expMode,
    scopes,
    issuedAt,
    taoxianVersion,
  };
}

// ==================== 公钥加载 ====================
export function loadPubkeyPem(): string {
  for (const p of DEFAULT_PUBKEY_PATHS) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      // 试下一个
    }
  }
  throw new Error(
    `taoxian license pubkey not found in: ${DEFAULT_PUBKEY_PATHS.join(", ")}`
  );
}

// ==================== 验签主函数 ====================
export interface VerifyResult {
  ok: boolean;
  license?: License;
  error?: string;
}

/**
 * 验签 (脱机, 跟 install.sh --license 一样的逻辑)
 * @param data license.bin 完整字节 (header + payload + signature)
 * @param pubkeyPem PEM 格式 RSA-2048 公钥
 */
export function verify(data: Buffer, pubkeyPem: string): VerifyResult {
  try {
    if (data.length < MIN_SIZE) {
      return { ok: false, error: `license too short: ${data.length} bytes (min ${MIN_SIZE})` };
    }

    const { payloadLen } = parseHeader(data);
    const expectedTotal = 11 + payloadLen + SIGNATURE_LEN;
    if (data.length !== expectedTotal) {
      return {
        ok: false,
        error: `license length mismatch: got ${data.length}, expected ${expectedTotal} (header 11 + payload ${payloadLen} + signature ${SIGNATURE_LEN})`,
      };
    }

    const sigOffset = data.length - SIGNATURE_LEN;
    const toVerify = data.subarray(0, sigOffset);
    const signatureBytes = data.subarray(sigOffset);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(toVerify);
    if (!verifier.verify(pubkeyPem, signatureBytes)) {
      return { ok: false, error: "signature verification failed" };
    }

    const payload = data.subarray(11, 11 + payloadLen);
    const license = parseTlv(payload);

    // v1.2 业务约束: exp_mode 必须 0 (permanent)
    if (license.expMode !== 0) {
      return {
        ok: false,
        error: `unsupported exp_mode: ${license.expMode} (v1.2 only supports 0=permanent)`,
      };
    }

    return { ok: true, license };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 一行验签 (从文件读 + 默认 pubkey 路径), 失败抛错
 */
export function verifyLicenseFile(licensePath: string): License {
  const data = readFileSync(licensePath);
  const pubkey = loadPubkeyPem();
  const result = verify(data, pubkey);
  if (!result.ok) {
    throw new Error(`taoxian license verification failed: ${result.error}`);
  }
  if (!result.license) throw new Error("internal: verify returned ok without license");
  return result.license;
}
