export function validateCodeSignature(info, version) {
  if (info.status !== "Valid")
    throw new Error("Signature Authenticode absente ou invalide.");
  if (
    !/(?:^|[,\s])(?:CN|O)=SignPath Foundation(?:,|$)/i.test(info.subject ?? "")
  )
    throw new Error("Éditeur SignPath Foundation non vérifié.");
  if (info.timestamped !== true)
    throw new Error("Horodatage Authenticode absent.");
  if (info.productName !== "AudioForge")
    throw new Error("Nom de produit inattendu.");
  if (![version, `${version}.0`].includes(info.productVersion))
    throw new Error("Version de produit inattendue.");
  return true;
}
