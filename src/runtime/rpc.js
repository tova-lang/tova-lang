// RPC bridge — client calls to server functions are auto-routed via HTTP

const RPC_BASE = typeof window !== 'undefined'
  ? (window.__TOVA_RPC_BASE || '')
  : 'http://localhost:3000';

export async function rpc(functionName, args = []) {
  const url = `${RPC_BASE}/rpc/${functionName}`;

  // Convert positional args to object if needed
  let body;
  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    body = args[0];
  } else if (args.length > 0) {
    // Send as array, server will handle positional mapping
    body = { __args: args };
  } else {
    body = {};
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RPC call to '${functionName}' failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    if (error.message.includes('RPC call')) throw error;
    throw new Error(`RPC call to '${functionName}' failed: ${error.message}`);
  }
}

// Configure RPC base URL
export function configureRPC(baseUrl) {
  if (typeof window !== 'undefined') {
    window.__TOVA_RPC_BASE = baseUrl;
  }
}
