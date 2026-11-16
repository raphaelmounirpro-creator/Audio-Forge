import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCodeSignature } from "../../scripts/code-signature.mjs";
const valid = {
  status: "Valid",
  subject: "CN=SignPath Foundation, O=SignPath Foundation, C=AT",
  timestamped: true,
  productName: "AudioForge",
  productVersion: "0.1.0",
};
test("accepte uniquement une signature valide, horodatée, du bon éditeur et du bon produit", () => {
  assert.equal(validateCodeSignature(valid, "0.1.0"), true);
  assert.equal(
    validateCodeSignature({ ...valid, productVersion: "0.1.0.0" }, "0.1.0"),
    true,
  );
});
test("refuse absence de signature, faux éditeur, autre version et horodatage manquant", () => {
  for (const changes of [
    { status: "NotSigned" },
    { status: "UnknownError" },
    { subject: "CN=SignPath Foundation Fake" },
    { subject: "CN=Other Publisher" },
    { timestamped: false },
    { timestamped: "false" },
    { productName: "Other" },
    { productVersion: "9.9.9" },
  ])
    assert.throws(() =>
      validateCodeSignature({ ...valid, ...changes }, "0.1.0"),
    );
});
