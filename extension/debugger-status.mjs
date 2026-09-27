// Read-only metadata. Never attach, detach, or send debugger commands here.
export async function debuggerStatus(api, liveTabs) {
  try {
    const targets = await api.getTargets();
    const live = new Set(liveTabs.map((t) => t.id));
    return {
      available: true,
      attached: [
        ...new Set(
          targets
            .filter((t) => t.type === 'page' && t.attached === true && live.has(t.tabId))
            .map((t) => t.tabId),
        ),
      ],
    };
  } catch {
    return { available: false, attached: [] };
  }
}
