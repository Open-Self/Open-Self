export async function mcpCommand(options = {}) {
    // Keep the relatively heavy MCP SDK off the startup path for every other CLI command.
    const { runContextMcpServer } = await import('../context/mcp.js');
    await runContextMcpServer({
        ...options,
        policyFile: options.policy,
        clientId: options.client,
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
    });
}
