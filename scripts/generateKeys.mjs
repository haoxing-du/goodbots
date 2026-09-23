// Generates JWT_PRIVATE_KEY and JWKS for Convex Auth and sets them on the current deployment.
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { execFileSync } from "node:child_process";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });

const set = (name, value) =>
  execFileSync("npx", ["convex", "env", "set", name, "--", value], { stdio: "inherit" });
set("JWT_PRIVATE_KEY", privateKey.trimEnd().replace(/\n/g, " "));
set("JWKS", jwks);
