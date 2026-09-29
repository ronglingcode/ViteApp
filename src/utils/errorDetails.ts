/** Readable UI/Firestore diagnostics. Never log authorization or token values. */
export const sanitizeDiagnosticText = (text: string, ...secrets: (string | undefined)[]) => {
    let result = text;
    for (const secret of secrets) if (secret) result = result.replaceAll(secret, '[redacted]');
    result = result.replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
        .replace(/(["']?(?:access_?token|refresh_?token|client_?secret|appSecret|accountNumber)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}&]+)/gi, '$1[redacted]')
        .replace(/(\/accounts\/)[^/?\s"]+/gi, '$1[redacted]')
        .replace(/[\r\n\t]+/g, ' ');
    return result.length > 2000 ? result.slice(0, 2000) + ' [truncated]' : result;
};
export const describeError = (error: unknown, ...secrets: (string | undefined)[]): string => {
    const parts: string[] = [];
    const seen = new Set<unknown>();
    for (let cause = error; cause != null && !seen.has(cause);) {
        seen.add(cause);
        if (cause instanceof Error) {
            parts.push(`${cause.name}: ${cause.message}`);
            cause = cause.cause;
        } else {
            try { parts.push(typeof cause === 'string' ? cause : JSON.stringify(cause) ?? String(cause)); }
            catch { parts.push(String(cause)); }
            break;
        }
    }
    return sanitizeDiagnosticText(parts.join('; caused by '), ...secrets);
};
export const fetchBrokerResponse = async (operation: string, request: Promise<Response>): Promise<Response> => {
    try { return await request; }
    catch (error) { throw new Error(`${sanitizeDiagnosticText(operation)} failed`, { cause: error }); }
};
export const brokerResponseError = (operation: string, response: Response, body: unknown, ...secrets: (string | undefined)[]) =>
    new Error(sanitizeDiagnosticText(`${operation} HTTP ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`, ...secrets));

/** Keep status and response text when a proxy/broker returns HTML, text, or invalid JSON. */
export const readBrokerJson = async (response: Response, operation: string, ...secrets: (string | undefined)[]) => {
    let body: string;
    try { body = await response.text(); }
    catch (error) { throw new Error(`${operation} HTTP ${response.status}: reading response body failed`, { cause: error }); }
    try { return JSON.parse(body); }
    catch (error) {
        throw new Error(sanitizeDiagnosticText(`${operation} HTTP ${response.status}: response is not valid JSON: ${body || '(empty body)'}`, ...secrets),
            { cause: new Error(describeError(error, ...secrets)) });
    }
};
