// Generates the built-in "Huddle Buddies" sticker pack: round sprout-topped buddies with a caption tag.
// Output: apps/web/public/stickers/<slug>.svg (ids/names live in packages/shared/src/stickers.ts).
// Run: node scripts/gen-stickers.cjs
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'apps', 'web', 'public', 'stickers');
const INK = '#2b2340';

// [slug, body colour, eyes, mouth, prop, caption, animated] — keep in sync with BUILTIN_STICKERS in
// packages/shared/src/stickers.ts (same slugs, same order). Animated ones also get a <slug>-still.svg frame.
const STICKERS = [
  // Greetings
  ['wave', '#7c8cff', 'happy', 'grin', 'wave', 'hi!', 1],
  ['hello', '#5bb8ff', 'dot', 'grin', 'wave', 'hello!', 1],
  ['heya', '#ffb84d', 'wink', 'smile', 'wave', 'hey!', 1],
  ['welcome', '#4cc9a6', 'happy', 'open', 'wave', 'welcome!', 1],
  ['bye', '#b18cff', 'closed', 'smile', 'wave', 'bye!', 1],
  ['gm', '#ffcf4a', 'happy', 'smile', 'sun', 'good morning', 0],
  ['gn', '#6b7fd7', 'closed', 'o', 'moon', 'good night', 0],
  // Reactions
  ['lol', '#ff8a65', 'laugh', 'open', 'tears', 'lol', 1],
  ['omg', '#ff9ecb', 'wide', 'big', 'cheeks', 'omg', 0],
  ['wow', '#b18cff', 'wide', 'big', 'burst', 'wow', 0],
  ['nice', '#5bb8ff', 'wink', 'smile', 'thumb', 'nice!', 0],
  ['gg', '#ffb84d', 'dot', 'grin', 'trophy', 'gg', 0],
  ['yes', '#2fbf71', 'happy', 'grin', 'check', 'yes!', 0],
  ['no', '#ff6b6b', 'dot', 'flat', 'cross', 'nope', 0],
  ['hmm', '#6fcf97', 'side', 'flat', 'think', 'hmm', 0],
  ['facepalm', '#ffa07a', 'none', 'wobble', 'palm', 'facepalm', 0],
  ['mindblown', '#9b7bff', 'wide', 'big', 'boom', 'mind blown', 1],
  ['oops', '#ffa07a', 'wide', 'wobble', 'sweat', 'oops', 0],
  // Feelings
  ['love', '#ff6b8b', 'heart', 'smile', 'hearts', 'love it', 1],
  ['happy', '#ffd23f', 'happy', 'grin', 'sparkle', 'happy', 0],
  ['sad', '#7fa7d9', 'sad', 'frown', 'tear', 'sad', 1],
  ['angry', '#ff5a5a', 'angry', 'frown', 'anger', 'grr', 0],
  ['sleepy', '#8fa3c7', 'closed', 'o', 'zzz', 'zzz', 1],
  ['yay', '#ff9f43', 'happy', 'open', 'handsup', 'yay!', 1],
  ['nervous', '#9ad1d4', 'wide', 'wobble', 'sweat', 'eep', 0],
  ['cool', '#56d1c9', 'none', 'smile', 'shades', 'cool', 0],
  ['aww', '#ffb3c7', 'shiny', 'o', 'blush', 'aww', 0],
  // Celebrate
  ['party', '#f78fb3', 'happy', 'open', 'hat', 'party!', 1],
  ['congrats', '#9b7bff', 'happy', 'grin', 'balloons', 'congrats!', 1],
  ['birthday', '#ff8fab', 'happy', 'grin', 'cake', 'hbd!', 0],
  ['cheers', '#ffb84d', 'happy', 'open', 'glass', 'cheers!', 0],
  ['winner', '#ffd23f', 'dot', 'grin', 'medal', 'winner', 0],
  ['woohoo', '#4cc9a6', 'laugh', 'open', 'confetti', 'woohoo', 1],
  ['lit', '#ff7a45', 'wink', 'grin', 'fire', 'lit', 1],
  ['hundred', '#5bb8ff', 'happy', 'grin', 'hundred', '100', 0],
  // Everyday
  ['brb', '#4cc9a6', 'dot', 'smile', 'dash', 'brb', 1],
  ['omw', '#9b7bff', 'dot', 'grin', 'rocket', 'omw', 1],
  ['coffee', '#c08a5b', 'happy', 'smile', 'mug', 'coffee?', 1],
  ['snack', '#ffa94d', 'happy', 'open', 'donut', 'snack', 0],
  ['gametime', '#7c8cff', 'dot', 'grin', 'gamepad', 'game time', 0],
  ['study', '#6fcf97', 'dot', 'flat', 'book', 'study', 0],
  ['working', '#8fa3c7', 'dot', 'flat', 'laptop', 'working', 0],
  ['ok', '#56d1c9', 'happy', 'smile', 'okring', 'ok!', 0],
  // Thanks & Support
  ['thanks', '#f78fb3', 'happy', 'smile', 'sparkle', 'thanks!', 0],
  ['sorry', '#a3b4e0', 'sad', 'wobble', 'flower', 'sorry', 0],
  ['hug', '#ff9ecb', 'closed', 'smile', 'hug', 'hug', 0],
  ['yougotthis', '#ff9f43', 'wink', 'grin', 'flex', 'you got this', 0],
  ['highfive', '#5bb8ff', 'happy', 'grin', 'highfive', 'high five', 1],
];

/** Mixes a #rrggbb colour towards black (t < 0) or white (t > 0). */
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

const EYES = {
  dot: `<circle cx="126" cy="166" r="11" fill="${INK}"/><circle cx="194" cy="166" r="11" fill="${INK}"/><circle cx="130" cy="162" r="4" fill="#fff"/><circle cx="198" cy="162" r="4" fill="#fff"/>`,
  happy: `<path d="M112 170q14-18 28 0M180 170q14-18 28 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`,
  laugh: `<path d="M112 156l24 12-24 12M208 156l-24 12 24 12" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  wink: `<circle cx="126" cy="166" r="11" fill="${INK}"/><circle cx="130" cy="162" r="4" fill="#fff"/><path d="M182 168q12-12 26 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`,
  heart: [126, 194].map((x) => `<path transform="translate(${x} 166)" d="M0 12C-16 2-18-10-9-13-4-15 0-11 0-8 0-11 4-15 9-13 18-10 16 2 0 12Z" fill="#e8365d"/>`).join(''),
  closed: `<path d="M112 168q14 10 28 0M180 168q14 10 28 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  side: `<circle cx="132" cy="166" r="11" fill="${INK}"/><circle cx="200" cy="166" r="11" fill="${INK}"/><path d="M114 144l24-6M184 138l24 4" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
  wide: `<circle cx="126" cy="164" r="17" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="194" cy="164" r="17" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="126" cy="166" r="7" fill="${INK}"/><circle cx="194" cy="166" r="7" fill="${INK}"/>`,
  sad: `<circle cx="126" cy="170" r="10" fill="${INK}"/><circle cx="194" cy="170" r="10" fill="${INK}"/><path d="M110 150l26-8M210 150l-26-8" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
  angry: `<circle cx="128" cy="170" r="10" fill="${INK}"/><circle cx="192" cy="170" r="10" fill="${INK}"/><path d="M108 144l32 14M212 144l-32 14" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`,
  none: '',
  shiny: `<circle cx="126" cy="166" r="16" fill="${INK}"/><circle cx="194" cy="166" r="16" fill="${INK}"/><circle cx="132" cy="159" r="6" fill="#fff"/><circle cx="200" cy="159" r="6" fill="#fff"/><circle cx="121" cy="172" r="3" fill="#fff"/><circle cx="189" cy="172" r="3" fill="#fff"/>`,
};

const MOUTHS = {
  smile: `<path d="M144 200q16 16 32 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  grin: `<path d="M138 196h44q0 26-22 26t-22-26Z" fill="${INK}"/><path d="M148 212q12 8 24 0" fill="none" stroke="#ff7a93" stroke-width="7" stroke-linecap="round"/>`,
  open: `<path d="M136 194h48q0 32-24 32t-24-32Z" fill="${INK}"/><ellipse cx="160" cy="216" rx="12" ry="6" fill="#ff7a93"/>`,
  o: `<ellipse cx="160" cy="206" rx="8" ry="10" fill="${INK}"/>`,
  big: `<ellipse cx="160" cy="210" rx="15" ry="19" fill="${INK}"/>`,
  flat: `<path d="M146 206h26" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  frown: `<path d="M144 212q16-16 32 0" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  wobble: `<path d="M140 208q5-8 10 0t10 0 10 0 10 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
};

const star = (x, y, r, fill) =>
  `<path transform="translate(${x} ${y})" d="M0 ${-r}Q${r * 0.2} ${-r * 0.2} ${r} 0Q${r * 0.2} ${r * 0.2} 0 ${r}Q${-r * 0.2} ${r * 0.2} ${-r} 0Q${-r * 0.2} ${-r * 0.2} 0 ${-r}Z" fill="${fill}"/>`;
const heart = (x, y, s, fill, cls = '') =>
  `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0 12C-16 2-18-10-9-13-4-15 0-11 0-8 0-11 4-15 9-13 18-10 16 2 0 12Z" fill="${fill}" stroke="#fff" stroke-width="2"/>`;

/** Props drawn over (or behind, for 'back') the body. Hands use the body colour. */
function prop(kind, color) {
  const hand = (x, y, r = 17) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="${shade(color, -0.35)}" stroke-width="4"/>`;
  switch (kind) {
    case 'wave':
      return `<g class="wave">${hand(262, 128)}<path d="M286 96q12 10 10 26M296 84q18 16 14 40" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity=".6"/></g>`;
    case 'trophy':
      return `<g class="bob2"><path d="M44 92h48v14q0 30-24 30t-24-30Z" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><path d="M44 100h-10q0 18 14 20M92 100h10q0 18-14 20" fill="none" stroke="${INK}" stroke-width="4"/><rect x="58" y="136" width="20" height="10" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><rect x="50" y="146" width="36" height="10" rx="3" fill="${INK}"/>${star(68, 112, 8, '#fff')}</g>`;
    case 'dash':
      return `<g stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity=".55"><path class="dash" d="M14 150h28M6 180h34M18 210h24"/></g>${hand(262, 196)}`;
    case 'tears':
      return `<path class="drip" d="M98 172q-8 14 0 20 8-6 0-20Z" fill="#6ec6ff" stroke="#fff" stroke-width="2"/><path class="drip" d="M222 172q-8 14 0 20 8-6 0-20Z" fill="#6ec6ff" stroke="#fff" stroke-width="2"/>`;
    case 'thumb':
      return `<g class="bob2"><rect x="238" y="160" width="40" height="38" rx="12" fill="${color}" stroke="${shade(color, -0.35)}" stroke-width="4"/><rect x="244" y="126" width="16" height="42" rx="8" fill="${color}" stroke="${shade(color, -0.35)}" stroke-width="4"/></g>`;
    case 'sparkle':
      return `<g class="twinkle">${star(62, 96, 16, '#ffd23f')}${star(266, 112, 12, '#ffd23f')}${star(272, 70, 8, '#fff')}</g>${heart(160, 248, 1.3, '#ff4f79')}`;
    case 'rocket':
      return `<g class="zoom" transform="rotate(35 262 96)"><path d="M262 54q18 20 18 50h-36q0-30 18-50Z" fill="#f4f4fb" stroke="${INK}" stroke-width="4"/><circle cx="262" cy="84" r="7" fill="#5bb8ff" stroke="${INK}" stroke-width="3"/><path d="M244 104l-10 14h16M280 104l10 14h-16" fill="#ff6b8b" stroke="${INK}" stroke-width="3"/><path d="M254 106q8 22 16 0" fill="#ffb84d"/></g>`;
    case 'confetti': {
      const bits = [[40, 70, '#ff6b8b', 20], [86, 40, '#5bb8ff', -30], [236, 44, '#4cc9a6', 40], [282, 82, '#9b7bff', -15], [30, 140, '#ffb84d', 60], [292, 150, '#ff6b8b', 10]];
      return `<g class="twinkle">${bits.map(([x, y, c, r]) => `<rect x="${x}" y="${y}" width="16" height="8" rx="2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>${hand(64, 120)}${hand(256, 120)}`;
    }
    case 'hearts':
      return `<g class="float">${heart(56, 96, 1.4, '#ff4f79')}${heart(268, 80, 1.1, '#ff8fab')}${heart(282, 140, 0.8, '#ff4f79')}</g>`;
    case 'zzz':
      return `<g class="float" fill="${INK}" font-family="'Trebuchet MS', 'Segoe UI', Arial, sans-serif" font-weight="900"><text x="226" y="96" font-size="34">z</text><text x="252" y="70" font-size="26">z</text><text x="272" y="48" font-size="20">z</text></g>`;
    case 'mug':
      return `<g><path class="steam" d="M246 112q-8-12 0-24t0-24M266 112q-8-12 0-24t0-24" fill="none" stroke="#bbb" stroke-width="5" stroke-linecap="round"/><rect x="236" y="122" width="44" height="46" rx="8" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M280 132q16 0 16 14t-16 14" fill="none" stroke="${INK}" stroke-width="5"/><rect x="242" y="128" width="32" height="8" rx="3" fill="#8a5a33"/></g>${hand(240, 172, 15)}`;
    case 'think':
      return `${hand(204, 236, 16)}<text class="float" x="250" y="104" font-family="'Trebuchet MS', 'Segoe UI', Arial, sans-serif" font-size="58" font-weight="900" fill="${INK}" stroke="#fff" stroke-width="6" paint-order="stroke">?</text>`;
    case 'sweat':
      return `<path class="drip" d="M236 104q-14 20 0 30 14-10 0-30Z" fill="#6ec6ff" stroke="#fff" stroke-width="3"/>`;
    case 'blush':
      return `<g class="twinkle">${star(66, 104, 12, '#fff')}${star(258, 92, 14, '#fff')}${star(276, 130, 7, '#ffd23f')}</g>`;
    case 'check':
      return `<g class="bob2"><circle cx="262" cy="104" r="28" fill="#2fbf71" stroke="#fff" stroke-width="5"/><path d="M248 104l10 10 18-20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    case 'burst':
      return `<g class="twinkle" stroke="${INK}" stroke-width="6" stroke-linecap="round"><path d="M60 92l-16-14M48 130H26M70 62l-6-20M260 92l16-14M272 130h22M250 62l6-20"/></g>`;
    case 'sun':
      return `<g class="twinkle"><circle cx="262" cy="84" r="24" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><path d="M262 44v-12M262 136v-12M222 84h-12M314 84h-12M234 56l-8-8M290 56l8-8M234 112l-8 8M290 112l8 8" stroke="#ffb020" stroke-width="6" stroke-linecap="round"/></g>`;
    case 'moon':
      return `<path d="M276 52a32 32 0 1 0 24 52 26 26 0 1 1-24-52Z" fill="#ffe58a" stroke="${INK}" stroke-width="4"/>${star(58, 70, 10, '#ffe58a')}${star(84, 40, 6, '#fff')}<path d="M110 82q50-40 100 0" fill="#3f4fa8" stroke="${INK}" stroke-width="4"/><circle cx="214" cy="80" r="9" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
    case 'cheeks':
      return `${hand(70, 196)}${hand(250, 196)}<g stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M54 120l-14-10M266 120l14-10M160 54v-14"/></g>`;
    case 'cross':
      return `<g><circle cx="262" cy="104" r="28" fill="#ff4d4d" stroke="#fff" stroke-width="5"/><path d="M250 92l24 24M274 92l-24 24" stroke="#fff" stroke-width="7" stroke-linecap="round"/></g>`;
    case 'palm':
      return `<g><rect x="96" y="140" width="128" height="46" rx="23" fill="${color}" stroke="${shade(color, -0.35)}" stroke-width="5"/><path d="M118 146v-12M140 144v-14M162 144v-14M184 146v-12" stroke="${shade(color, -0.35)}" stroke-width="4" stroke-linecap="round"/></g>`;
    case 'boom':
      return `<g class="pop"><path d="M160 20l14 26 28-14-6 30 30 4-24 18 18 22-30-4-6 26-24-18-24 18-6-26-30 4 18-22-24-18 30-4-6-30 28 14Z" fill="#ffd23f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="160" cy="62" r="12" fill="#ff7a45"/></g>`;
    case 'tear':
      return `<path class="drip" d="M118 182q-10 16 0 24 10-8 0-24Z" fill="#6ec6ff" stroke="#fff" stroke-width="2"/>`;
    case 'anger':
      return `<g class="twinkle" stroke="#d62b2b" stroke-width="6" stroke-linecap="round"><path d="M240 96q6 10 0 20M252 92q10 0 18 6M248 112q10 0 16 6M264 94q-2 12 4 20"/></g><g fill="#ccc" opacity=".9"><circle cx="58" cy="96" r="14"/><circle cx="44" cy="80" r="10"/><circle cx="36" cy="62" r="7"/></g>`;
    case 'shades':
      return `<g><path d="M100 152h50q4 30-24 30t-26-30ZM170 152h50q2 30-26 30t-24-30Z" fill="${INK}"/><path d="M96 156h128" stroke="${INK}" stroke-width="6"/><path d="M112 158l10-2M182 158l10-2" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>${star(268, 96, 12, '#fff')}`;
    case 'hat':
      return `<g class="bob2"><path d="M128 92l32-70 32 70Z" fill="#5bb8ff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M140 66h40M134 80h52" stroke="#ffd23f" stroke-width="6"/><circle cx="160" cy="22" r="10" fill="#ff6b8b" stroke="${INK}" stroke-width="3"/></g>${prop('confetti', color)}`;
    case 'balloons':
      return `<g class="float"><path d="M62 136q-6 40 10 80M266 120q8 40-8 96" fill="none" stroke="${INK}" stroke-width="3"/><ellipse cx="62" cy="104" rx="26" ry="32" fill="#ff6b8b" stroke="${INK}" stroke-width="4"/><ellipse cx="266" cy="88" rx="26" ry="32" fill="#ffd23f" stroke="${INK}" stroke-width="4"/><ellipse cx="54" cy="94" rx="6" ry="10" fill="#fff" opacity=".6"/><ellipse cx="258" cy="78" rx="6" ry="10" fill="#fff" opacity=".6"/></g>`;
    case 'cake':
      return `<g><rect x="226" y="150" width="68" height="44" rx="6" fill="#fff4e0" stroke="${INK}" stroke-width="4"/><path d="M226 166q8 10 17 0t17 0 17 0 17 0" fill="none" stroke="#ff8fab" stroke-width="6"/><rect x="256" y="124" width="8" height="26" fill="#5bb8ff" stroke="${INK}" stroke-width="3"/><path d="M260 104q-8 10 0 18 8-8 0-18Z" fill="#ffb020"/></g>`;
    case 'glass':
      return `<g transform="rotate(12 262 140)"><path d="M240 100h44l-6 64h-32Z" fill="#ffe58a" stroke="${INK}" stroke-width="4"/><path d="M242 112h40" stroke="#fff" stroke-width="8"/><circle cx="256" cy="134" r="4" fill="#fff"/><circle cx="268" cy="146" r="3" fill="#fff"/></g>${hand(246, 178, 15)}${star(296, 92, 10, '#ffd23f')}`;
    case 'medal':
      return `<g class="bob2"><path d="M136 230l-10-36h20l14 28 14-28h20l-10 36" fill="#5bb8ff" stroke="${INK}" stroke-width="4"/><circle cx="160" cy="240" r="22" fill="#ffd23f" stroke="${INK}" stroke-width="4"/>${star(160, 240, 10, '#fff')}</g>`;
    case 'fire':
      return `<g class="flicker"><path d="M262 154q-34 0-34-30 0-22 22-42 0 18 12 22 0-24 18-40 0 22 10 36 8 12 6 26-2 28-34 28Z" fill="#ff7a45" stroke="${INK}" stroke-width="4"/><path d="M262 148q-14 0-14-14 0-10 10-18 2 10 8 10 0-8 6-14 6 10 6 18 0 18-16 18Z" fill="#ffd23f"/></g>`;
    case 'hundred':
      return `<g transform="rotate(-10 260 100)"><text x="260" y="116" text-anchor="middle" font-family="'Trebuchet MS', 'Segoe UI', Arial, sans-serif" font-size="54" font-weight="900" fill="#ff4d4d" stroke="#fff" stroke-width="6" paint-order="stroke">100</text><path d="M222 126h80M226 136h72" stroke="#ff4d4d" stroke-width="5" stroke-linecap="round"/></g>`;
    case 'donut':
      return `<g><circle cx="262" cy="150" r="30" fill="#e0a060" stroke="${INK}" stroke-width="4"/><path d="M236 144a26 26 0 0 1 52 0q-6 10-12 2t-14 4-14-4-12-2Z" fill="#ff8fab"/><circle cx="262" cy="150" r="9" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M248 136l4 3M270 134l-2 4M280 146l3 3M246 154l4-2" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>${hand(236, 182, 14)}`;
    case 'gamepad':
      return `<g><path d="M110 222h100q24 0 22 26-2 22-20 18l-22-12h-60l-22 12q-18 4-20-18-2-26 22-26Z" fill="#3b3550" stroke="#fff" stroke-width="4"/><path d="M128 238v16M120 246h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="190" cy="240" r="5" fill="#ff6b8b"/><circle cx="202" cy="252" r="5" fill="#5bb8ff"/></g>`;
    case 'book':
      return `<g><path d="M100 226q30-14 60 0 30-14 60 0v34q-30-14-60 0-30-14-60 0Z" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M160 226v34" stroke="${INK}" stroke-width="4"/><path d="M114 236q16-6 32 0M174 236q16-6 32 0" stroke="#bbb" stroke-width="3"/></g>${star(262, 96, 10, '#ffd23f')}`;
    case 'laptop':
      return `<g><rect x="104" y="206" width="112" height="56" rx="6" fill="#d8dbe8" stroke="${INK}" stroke-width="4"/><rect x="88" y="258" width="144" height="12" rx="5" fill="#b8bccc" stroke="${INK}" stroke-width="4"/><circle cx="160" cy="232" r="7" fill="#fff"/></g>`;
    case 'okring':
      return `<g class="bob2"><circle cx="262" cy="120" r="20" fill="none" stroke="${shade(color, -0.35)}" stroke-width="16"/><circle cx="262" cy="120" r="20" fill="none" stroke="${color}" stroke-width="9"/><path d="M276 98l14-26M284 108l18-20" stroke="${color}" stroke-width="12" stroke-linecap="round"/></g>`;
    case 'flower':
      return `<g transform="translate(262 120)"><path d="M0 18v40" stroke="#2fa35b" stroke-width="5"/>${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-14" rx="10" ry="15" fill="#ff9ecb" stroke="${INK}" stroke-width="3" transform="rotate(${r})"/>`).join('')}<circle r="9" fill="#ffd23f" stroke="${INK}" stroke-width="3"/></g>${hand(246, 186, 14)}`;
    case 'hug':
      return `${heart(160, 226, 1.6, '#ff4f79')}<path d="M70 200q30 40 72 30M250 200q-30 40-72 30" fill="none" stroke="${shade(color, -0.35)}" stroke-width="22" stroke-linecap="round"/><path d="M70 200q30 40 72 30M250 200q-30 40-72 30" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`;
    case 'flex':
      return `<g><path d="M262 196q-20-6-20-30t26-48" fill="none" stroke="${shade(color, -0.35)}" stroke-width="30" stroke-linecap="round"/><path d="M262 196q-20-6-20-30t26-48" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round"/><ellipse cx="248" cy="150" rx="18" ry="14" fill="${shade(color, 0.25)}"/></g>${star(60, 96, 14, '#ffd23f')}`;
    case 'highfive':
      return `<g class="wave"><rect x="240" y="78" width="46" height="52" rx="16" fill="${color}" stroke="${shade(color, -0.35)}" stroke-width="4"/><path d="M248 80v-22M260 78v-28M272 78v-24M284 86l8-18" stroke="${shade(color, -0.35)}" stroke-width="10" stroke-linecap="round"/><path d="M248 80v-22M260 78v-28M272 78v-24M284 86l8-18" stroke="${color}" stroke-width="6" stroke-linecap="round"/></g><g class="twinkle" stroke="#ffb020" stroke-width="5" stroke-linecap="round"><path d="M300 50l12-10M306 74h14M290 30l4-14"/></g>`;
    case 'handsup':
      return `<g class="bob2">${hand(56, 96)}${hand(264, 96)}</g><g class="twinkle">${star(160, 40, 14, '#ffd23f')}${star(96, 52, 8, '#ff6b8b')}${star(226, 52, 8, '#5bb8ff')}</g>`;
    default:
      return '';
  }
}

// Animation for animated stickers (still frames leave it out). Inside an <img>, the SVG honours the OS reduced-motion setting itself.
const STYLE = `<style>
.buddy{animation:bob 2.4s ease-in-out infinite;transform-origin:160px 270px}
.wave{animation:wave 1.1s ease-in-out infinite;transform-origin:236px 168px}
.twinkle{animation:twinkle 1.6s ease-in-out infinite}
.float{animation:float 2.2s ease-in-out infinite}
.drip{animation:drip 1.4s ease-in infinite}
.bob2{animation:float 1.8s ease-in-out infinite}
.dash{animation:dash .7s linear infinite}
.zoom{animation:float 1s ease-in-out infinite}
.steam{animation:twinkle 2s ease-in-out infinite}
@keyframes bob{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.97)}}
@keyframes wave{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(22deg)}}
@keyframes twinkle{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(18px);opacity:0}}
@keyframes dash{0%{transform:translateX(0)}100%{transform:translateX(-10px)}}
.pop{animation:pop 1.2s ease-in-out infinite;transform-origin:160px 70px}
.flicker{animation:flicker .6s ease-in-out infinite alternate;transform-origin:262px 150px}
@keyframes pop{0%,100%{transform:scale(.9)}50%{transform:scale(1.08)}}
@keyframes flicker{from{transform:scale(1,1)}to{transform:scale(.94,1.06)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
`;

/** animate = false gives a still frame: no <style>, so nothing moves. */
function svg([, color, eyes, mouth, kind, caption], animate) {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.35);
  const body = 'M160 78C236 78 270 126 270 184 270 242 226 270 160 270 94 270 50 242 50 184 50 126 84 78 160 78Z';
  const fontSize = caption.length > 8 ? 26 : 32;
  const tagW = Math.round(34 + caption.length * fontSize * 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="${caption}">
${animate ? STYLE : ''}<g class="buddy">
<path d="M160 80q-4-30 18-44" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/>
<path d="${body}" fill="#fff" stroke="#fff" stroke-width="18" stroke-linejoin="round"/>
<ellipse cx="122" cy="272" rx="26" ry="14" fill="${dark}" stroke="#fff" stroke-width="6"/>
<ellipse cx="198" cy="272" rx="26" ry="14" fill="${dark}" stroke="#fff" stroke-width="6"/>
<path d="M160 80q-4-30 18-44" fill="none" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>
<path d="M178 36q26-12 38 6-24 14-38-6Z" fill="#5fd38d" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/>
<path d="${body}" fill="${color}" stroke="${dark}" stroke-width="5"/>
<ellipse cx="124" cy="112" rx="34" ry="14" fill="${light}" opacity=".7" transform="rotate(-20 124 112)"/>
<ellipse cx="102" cy="198" rx="15" ry="9" fill="#ff7a93" opacity=".45"/>
<ellipse cx="218" cy="198" rx="15" ry="9" fill="#ff7a93" opacity=".45"/>
${EYES[eyes]}
${MOUTHS[mouth]}
</g>
${prop(kind, color)}
<g transform="rotate(-6 160 290)">
<rect x="${160 - tagW / 2}" y="264" width="${tagW}" height="50" rx="25" fill="#fff" stroke="${INK}" stroke-width="5"/>
<text x="160" y="299" text-anchor="middle" font-family="'Trebuchet MS', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${INK}">${caption}</text>
</g>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const s of STICKERS) {
  fs.writeFileSync(path.join(OUT, `${s[0]}.svg`), svg(s, !!s[6]));
  if (s[6]) fs.writeFileSync(path.join(OUT, `${s[0]}-still.svg`), svg(s, false));
}
console.log(`wrote ${STICKERS.length} stickers (${STICKERS.filter((s) => s[6]).length} animated + still frames) to ${path.relative(process.cwd(), OUT)}`);
