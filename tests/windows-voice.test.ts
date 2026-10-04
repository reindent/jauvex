// Windows (T-283): who listens on whisper-server's port, read from netstat's table (Windows has neither lsof nor ps). A listening socket is
// told by its remote address (0.0.0.0:0, [::]:0), not by its state's word: that word is in the system's language (LISTENING, ABHÖREN...).
const { netstatListeners } = await import('../electron/voice.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const table = ['', 'Active Connections', '', '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1012',
  '  TCP    127.0.0.1:4399         0.0.0.0:0              LISTENING       5120',
  '  TCP    127.0.0.1:4399         127.0.0.1:50123        ESTABLISHED     5120',
  '  TCP    127.0.0.1:50123        127.0.0.1:4399         ESTABLISHED     9988',
  '  TCP    [::]:4399              [::]:0                 LISTENING       5120',
  '  TCP    [::1]:43990            [::]:0                 LISTENING       7777',
  '  TCP    0.0.0.0:4400           0.0.0.0:0              ABHÖREN         6200',
  '  UDP    0.0.0.0:4399           *:*                                    4444', ''].join('\r\n');
const got = (port: number) => JSON.stringify(netstatListeners(table, port));
check('the process listening on the port, once (IPv4 and IPv6); its connections and a client of it are not listeners', got(4399) === '[5120]', got(4399));
check('a port that only begins the same (43990) is another port', !netstatListeners(table, 4399).includes(7777) && got(43990) === '[7777]', got(43990));
check('on a Windows in another language (ABHÖREN) the listener is still found', got(4400) === '[6200]', got(4400));
check('UDP is not counted, and a free port has nobody', !netstatListeners(table, 4399).includes(4444) && got(5555) === '[]', got(5555));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
