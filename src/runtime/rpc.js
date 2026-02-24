// RPC bridge — client calls to server functions are auto-routed via HTTP
// Includes CSRF protection, request timeouts, and interceptor middleware.

// ─── Configuration ────────────────────────────────────────

const _config = {
  base: typeof window !== 'undefined' ? (window.__TOVA_RPC_BASE || '') : 'http://localhost:3000',
  timeout: 30000, // 30s default timeout
  csrfHeader: 'X-Tova-CSRF',
  csrfToken: null, // auto-detected from meta tag or set manually
  credentials: 'same-origin', // fetch credentials mode
};

// Interceptor chains — each is { request?: fn, response?: fn, error?: fn }
const _interceptors = [];

// ─── CSRF Token Management ────────────────────────────────

function getCSRFToken() {
  if (_config.csrfToken) return _config.csrfToken;
  // Auto-detect from <meta name="csrf-token" content="..."> (server-rendered)
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) {
      _config.csrfToken = meta.getAttribute('content');
      return _config.csrfToken;
    }
  }
  return null;
}

// ─── Core RPC Function ────────────────────────────────────

export async function rpc(functionName, args = []) {
  const url = `${_config.base}/rpc/${functionName}`;

  // Convert positional args to object if needed
  let body;
  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    body = args[0];
  } else if (args.length > 0) {
    body = { __args: args };
  } else {
    body = {};
  }

  // Build headers
  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCSRFToken();
  if (csrf) {
    headers[_config.csrfHeader] = csrf;
  }

  // Build request options
  let requestOptions = {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: _config.credentials,
  };

  // Run request interceptors
  for (const interceptor of _interceptors) {
    if (interceptor.request) {
      const result = interceptor.request({ url, functionName, args, options: requestOptions });
      if (result && typeof result === 'object') {
        requestOptions = { ...requestOptions, ...result };
      }
    }
  }

  // AbortController for timeout
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (controller) {
    requestOptions.signal = controller.signal;
  }
  const timeoutId = controller && _config.timeout > 0
    ? setTimeout(() => controller.abort(), _config.timeout)
    : null;

  try {
    const response = await fetch(url, requestOptions);

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`RPC call to '${functionName}' failed: ${response.status} ${errorText}`);
      err.status = response.status;
      err.functionName = functionName;

      // Run error interceptors
      for (const interceptor of _interceptors) {
        if (interceptor.error) {
          const handled = interceptor.error(err, { url, functionName, args, response });
          if (handled === false) return undefined; // Interceptor suppressed the error
        }
      }

      throw err;
    }

    let data = await response.json();

    // Run response interceptors
    for (const interceptor of _interceptors) {
      if (interceptor.response) {
        const transformed = interceptor.response(data, { url, functionName, args, response });
        if (transformed !== undefined) data = transformed;
      }
    }

    return data.result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    // Wrap AbortError as timeout
    if (error.name === 'AbortError') {
      const err = new Error(`RPC call to '${functionName}' timed out after ${_config.timeout}ms`);
      err.code = 'TIMEOUT';
      err.functionName = functionName;

      for (const interceptor of _interceptors) {
        if (interceptor.error) {
          const handled = interceptor.error(err, { url, functionName, args });
          if (handled === false) return undefined;
        }
      }

      throw err;
    }

    if (error.message && error.message.includes('RPC call')) throw error;
    throw new Error(`RPC call to '${functionName}' failed: ${error.message}`);
  }
}

// ─── Configuration API ────────────────────────────────────

export function configureRPC(options) {
  if (typeof options === 'string') {
    // Backward compat: configureRPC('http://...')
    _config.base = options;
    if (typeof window !== 'undefined') window.__TOVA_RPC_BASE = options;
    return;
  }
  if (options.baseUrl !== undefined) {
    _config.base = options.baseUrl;
    if (typeof window !== 'undefined') window.__TOVA_RPC_BASE = options.baseUrl;
  }
  if (options.timeout !== undefined) _config.timeout = options.timeout;
  if (options.csrfToken !== undefined) _config.csrfToken = options.csrfToken;
  if (options.csrfHeader !== undefined) _config.csrfHeader = options.csrfHeader;
  if (options.credentials !== undefined) _config.credentials = options.credentials;
}

// ─── Interceptor API ──────────────────────────────────────
// Usage:
//   const unsub = addRPCInterceptor({
//     request({ url, functionName, args, options }) {
//       options.headers['Authorization'] = 'Bearer ' + token;
//       return options;
//     },
//     response(data, { functionName }) { ... },
//     error(err, { functionName }) { ... },
//   });
//   unsub(); // remove interceptor

export function addRPCInterceptor(interceptor) {
  _interceptors.push(interceptor);
  return () => {
    const idx = _interceptors.indexOf(interceptor);
    if (idx !== -1) _interceptors.splice(idx, 1);
  };
}

// ─── Set CSRF Token ───────────────────────────────────────

export function setCSRFToken(token) {
  _config.csrfToken = token;
}
