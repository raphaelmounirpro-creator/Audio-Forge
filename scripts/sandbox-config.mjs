export function sandboxXml(mappings, options = {}) {
  const memoryMb = options.memoryMb ?? 6144;
  if (!Number.isInteger(memoryMb) || memoryMb < 512 || memoryMb > 16384)
    throw new Error("Mémoire Sandbox invalide.");
  const clipboard = options.clipboardRedirection ?? false;
  if (typeof clipboard !== "boolean")
    throw new Error("Option du presse-papiers invalide.");
  const escape = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  return `<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <MemoryInMB>${memoryMb}</MemoryInMB>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <ClipboardRedirection>${clipboard ? "Enable" : "Disable"}</ClipboardRedirection>
  <MappedFolders>
${mappings.map((m) => `    <MappedFolder><HostFolder>${escape(m.host)}</HostFolder><SandboxFolder>${escape(m.guest)}</SandboxFolder><ReadOnly>${m.readOnly ? "true" : "false"}</ReadOnly></MappedFolder>`).join("\n")}
  </MappedFolders>
  <LogonCommand><Command>${escape(options.command ?? "C:\\Inputs\\Node\\node.exe C:\\Inputs\\Source\\sandbox-build.mjs")}</Command></LogonCommand>
</Configuration>\n`;
}
