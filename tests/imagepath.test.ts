// Pictures with spaces in their path (from Pro: a picture such as "![Org chart draft](/Users/x/The Northwind Studio/Office/org-chart.png)"
// showed as raw text): the markdown is made whole before it is read, and the address markdown leaves goes back to the file, Mac and Windows.
import { marked } from 'marked';
import { imagePaths, imageFile, fileUrl } from '../shared/imagepath.ts';
import { clientBriefing } from '../shared/types.ts';
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !got ? '' : `: ${got}`}`); if (!ok) failed++; };
const src = (text: string) => /<img src="([^"]*)"/.exec(marked.parse(imagePaths(text), { async: false }) as string)?.[1] ?? null;
const file = (text: string, base = '/base') => { const s = src(text); return s === null ? null : imageFile(s, base); };

const mac = '/Users/u/The Northwind Studio/Office/org-chart.png';
check('a Mac path with spaces is an image, the file found', file(`![Org chart draft](${mac})`) === mac, String(file(`![Org chart draft](${mac})`)));
check('...the same path in <...>, as agents are told to write it', file(`![Org chart draft](<${mac}>)`) === mac);
check('...and with %20 for the spaces', file('![x](/Users/x/The%20Northwind%20Studio/a.png)') === '/Users/x/The Northwind Studio/a.png');
check('a path with no spaces is left as markdown reads it', imagePaths('![x](/Users/x/a.png)') === '![x](/Users/x/a.png)' && file('![x](/Users/x/a.png)') === '/Users/x/a.png');
check('a relative path with spaces, against the agent\'s folder', file('![x](shots/first draft.png)', '/Users/x/My Company') === '/Users/x/My Company/shots/first draft.png');
const win = 'C:\\Users\\x\\The Northwind Studio\\Office\\org chart.png';
check('a Windows path with spaces and backslashes', file(`![Org](${win})`) === 'C:/Users/x/The Northwind Studio/Office/org chart.png', String(file(`![Org](${win})`)));
check('...with no spaces too (markdown would eat some backslashes)', file('![x](C:\\Users\\x\\Desktop\\a.png)') === 'C:/Users/x/Desktop/a.png');
check('...with slashes, in <...>', file('![x](<C:/Users/x/My Pictures/a.jpg>)') === 'C:/Users/x/My Pictures/a.jpg');
check('...not read as an address scheme (the sanitizer drops "c:")', /^\//.test(src(`![Org](${win})`) ?? ''), String(src(`![Org](${win})`)));
check('a relative path on Windows, against its folder', file('![x](<shots/a b.png>)', 'C:\\Users\\x\\Acme Co') === 'C:/Users/x/Acme Co/shots/a b.png', String(file('![x](<shots/a b.png>)', 'C:\\Users\\x\\Acme Co')));
check('web pictures, data pictures and a title are left alone', ['![x](https://a.com/a b.png)', '![x](data:image/png;base64,AAAA)', '![x](/a/b.png "A title")'].every((t) => imagePaths(t) === t));
check('text that is not a picture is left alone', imagePaths('See [my notes](/Users/x/My Notes/a.md) and ![x](/a b/c.txt)') === 'See [my notes](/Users/x/My Notes/a.md) and ![x](/a b/c.txt)');
check('code stays exactly as written', imagePaths('`![x](/a b/c.png)` and\n```\n![x](/a b/c.png)\n```\n') === '`![x](/a b/c.png)` and\n```\n![x](/a b/c.png)\n```\n');
check('two pictures in one line, each found', (marked.parse(imagePaths(`![a](${mac}) and ![b](/x y/z.jpg)`), { async: false }) as string).match(/<img/g)?.length === 2);
check('file addresses: spaces encoded, # and ? too, a Windows drive with its third slash', fileUrl('/Users/x/The Northwind Studio/a#1?.png') === 'file:///Users/x/The%20Northwind%20Studio/a%231%3F.png' && fileUrl('C:/Users/x/My Pictures/a.png') === 'file:///C:/Users/x/My%20Pictures/a.png', `${fileUrl('/Users/x/The Northwind Studio/a#1?.png')} ${fileUrl('C:/Users/x/My Pictures/a.png')}`);
check('a folder whose real name holds %2F (Grok files its sessions so) keeps it', imageFile('/g/sessions/%252Fhome%252Fx/a.png', '') === '/g/sessions/%2Fhome%2Fx/a.png', imageFile('/g/sessions/%252Fhome%252Fx/a.png', ''));
check('the briefing tells agents to put a path with spaces in angle brackets', /a path with spaces goes in angle brackets: !\[name\]\(<path with spaces>\)/.test(clientBriefing(false)));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
