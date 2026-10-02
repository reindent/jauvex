// The app's own colours (T-278): a palette the Jauvex agent gives, checked before it is put on: its base, the app's colours only, #rrggbb,
// and text that can be read; the variables it sets; the note the agent gets when the user picks Custom.
const { readPalette, cssVars, contrast, customThemeNote } = await import('../shared/palette.ts');
let failed = 0; const check = (name: string, ok: boolean, got = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got ? `: ${got}` : ''}`); if (!ok) failed++; };
const forest = readPalette('{"name": "Forest", "base": "dark", "colors": {"bg": "#0f1a14", "side": "#0b130e", "fg": "#e6efe8", "accent": "#6fcf97", "muted": "#8fa597"}}');
check('a palette as JSON text: its name, base and colours', forest.ok && forest.palette.name === 'Forest' && forest.palette.base === 'dark' && forest.palette.colors.bg === '#0f1a14', JSON.stringify(forest));
check('...and the variables it sets on the page', forest.ok && JSON.stringify(cssVars(forest.palette)) === JSON.stringify({ '--bg': '#0f1a14', '--side': '#0b130e', '--fg': '#e6efe8', '--accent': '#6fcf97', '--muted': '#8fa597' }));
const short = readPalette({ colors: { bg: '#FFF8F0', accent: '#2563EB' } });
check('as an object too; #rgb and capitals made #rrggbb; no base: a light background makes it light', short.ok && short.palette.base === 'light' && short.palette.colors.bg === '#fff8f0' && short.palette.colors.accent === '#2563eb', JSON.stringify(short));
const err = (r: ReturnType<typeof readPalette>) => (r.ok ? '' : r.error);
check('a colour that is not one of the app\'s is refused, naming them', /"sidebar" is not a colour of the app: bg, side/.test(err(readPalette({ colors: { sidebar: '#000000' } }))), err(readPalette({ colors: { sidebar: '#000000' } })));
check('a value that is not a colour is refused', /bg: "blue" is not a colour/.test(err(readPalette({ colors: { bg: 'blue' } }))));
check('text that would be hard to read is refused, saying which and by how much', /text on the chat would be hard to read: fg #777777 on bg #888888 is 1\.\d:1, it needs 4\.5:1/.test(err(readPalette({ base: 'light', colors: { bg: '#888888', fg: '#777777' } }))), err(readPalette({ base: 'light', colors: { bg: '#888888', fg: '#777777' } })));
check("...judged against the base's own colours for what it leaves: a dark chat under the light theme's dark text", /text on the chat would be hard to read/.test(err(readPalette({ base: 'light', colors: { bg: '#101010' } }))));
check('...the accent too', /the accent on the chat would be hard to read/.test(err(readPalette({ base: 'light', colors: { accent: '#f4f4f4' } }))));
check('not JSON, no colours, a wrong base: each says what to give', /not JSON/.test(err(readPalette('{bg: red'))) && /"colors" is missing/.test(err(readPalette({ name: 'x' }))) && /"base" is "light" or "dark"/.test(err(readPalette({ base: 'blue', colors: { accent: '#4f46e5' } }))));
check('contrast: black on white is 21:1, a colour on itself 1:1', Math.round(contrast('#000000', '#ffffff')) === 21 && contrast('#4f46e5', '#4f46e5') === 1);
check("the agent's note says what to do and carries the palette on now", /picked Custom/.test(customThemeNote(null)) && /three palette ideas/.test(customThemeNote(null)) && forest.ok && customThemeNote(forest.palette).includes('"Forest"'));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
