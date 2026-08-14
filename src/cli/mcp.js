export async function mcpCommand(options = {}) {
    // Keep the relatively heavy MCP SDK off the startup path for every other CLI command.
    const { runContextMcpServer } = await import('../context/mcp.js');
    await runContextMcpServer({ dataDir: options.dataDir || process.env.DATA_DIR || './data' });
}
