// Built-in unicode emoji dataset: categories → [emoji, name, ...keywords].
import { customReactionId, emojiToken, normalizeReactionKey, type CustomEmojiRef, type GuildEmoji } from '@huddle/shared';
import { useGuildStore } from '../stores/guilds';
export interface EmojiEntry { e: string; n: string; k: string }
export interface EmojiCategory { id: string; label: string; icon: string; emoji: EmojiEntry[] }

const RAW: [string, string, string, string][] = [
  ['people', 'Smileys & People', '😀', `
😀 grinning happy smile|😃 smiley happy|😄 smile happy joy|😁 grin teeth|😆 laughing lol|😅 sweat_smile relief|🤣 rofl rolling laughing|😂 joy tears laughing|🙂 slight_smile|🙃 upside_down|😉 wink|😊 blush happy|😇 innocent halo angel|🥰 smiling_hearts love|😍 heart_eyes love|🤩 star_struck wow|😘 kissing_heart|😗 kissing|😚 kissing_closed_eyes|😋 yum tasty|😛 tongue|😜 winking_tongue|🤪 zany crazy|😝 squinting_tongue|🤑 money_mouth|🤗 hug hugging|🤭 hand_over_mouth oops|🤫 shush quiet|🤔 thinking hmm|🤐 zipper_mouth|🤨 raised_eyebrow sus|😐 neutral|😑 expressionless|😶 no_mouth|😏 smirk|😒 unamused|🙄 eye_roll|😬 grimace awkward|😮‍💨 exhale|🤥 lying|😌 relieved|😔 pensive sad|😪 sleepy|🤤 drool|😴 sleeping zzz|😷 mask sick|🤒 thermometer sick|🤕 bandage hurt|🤢 nauseated|🤮 vomit|🤧 sneeze|🥵 hot|🥶 cold freezing|🥴 woozy|😵 dizzy|🤯 exploding_head mind_blown|🤠 cowboy|🥳 party partying celebrate|🥸 disguise|😎 sunglasses cool|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 slight_frown|☹️ frown|😮 open_mouth wow|😯 hushed|😲 astonished|😳 flushed|🥺 pleading puppy|😦 frowning_open|😧 anguished|😨 fearful|😰 anxious_sweat|😥 sad_relieved|😢 cry sad tear|😭 sob crying|😱 scream|😖 confounded|😣 persevere|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph huff|😡 rage angry|😠 angry mad|🤬 cursing|😈 smiling_imp devil|👿 imp|💀 skull dead|☠️ skull_crossbones|💩 poop|🤡 clown|👹 ogre|👻 ghost|👽 alien|🤖 robot|😺 smiley_cat|😸 grin_cat|😹 joy_cat|😻 heart_eyes_cat|😼 smirk_cat|😽 kissing_cat|🙀 scream_cat|😿 crying_cat|😾 pouting_cat|🙈 see_no_evil monkey|🙉 hear_no_evil|🙊 speak_no_evil
👋 wave hello bye|🤚 raised_back_of_hand|🖐️ hand_splayed|✋ raised_hand high_five|🖖 vulcan|👌 ok_hand|🤌 pinched_fingers|🤏 pinching|✌️ victory peace|🤞 crossed_fingers luck|🤟 love_you|🤘 rock_on metal|🤙 call_me|👈 point_left|👉 point_right|👆 point_up|👇 point_down|☝️ index_up|👍 thumbsup +1 like yes|👎 thumbsdown -1 no|✊ fist|👊 punch|🤛 left_fist|🤜 right_fist|👏 clap applause|🙌 raised_hands hooray|👐 open_hands|🤲 palms_up|🤝 handshake deal|🙏 pray please thanks|✍️ writing|💅 nail_polish|🤳 selfie|💪 muscle strong flex|🧠 brain|👀 eyes look|👁️ eye|👅 tongue_out|👄 lips|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👨 man|👩 woman|🧓 older_person|👴 old_man|👵 old_woman|🙋 raising_hand|🤷 shrug|🤦 facepalm|🙇 bow|💁 tipping_hand|🙅 no_gesture|🙆 ok_gesture|🧑‍💻 technologist coder|🧑‍🎨 artist|🧑‍🚀 astronaut|🧑‍🍳 cook|🦸 superhero|🧙 mage wizard|🧛 vampire|🧟 zombie|🧞 genie|🧜 merperson|🧚 fairy|💃 dancer|🕺 man_dancing|👯 people_with_bunny_ears|🏃 runner|🚶 walking|🧘 yoga`],
  ['nature', 'Animals & Nature', '🐻', `
🐶 dog puppy|🐱 cat kitten|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦅 eagle|🦉 owl|🦇 bat|🐺 wolf|🐗 boar|🐴 horse|🦄 unicorn|🐝 bee|🐛 bug|🦋 butterfly|🐌 snail|🐞 ladybug|🐜 ant|🕷️ spider|🦂 scorpion|🐢 turtle|🐍 snake|🦎 lizard|🦖 t_rex dinosaur|🦕 sauropod|🐙 octopus|🦑 squid|🦐 shrimp|🦀 crab|🐡 blowfish|🐠 tropical_fish|🐟 fish|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🐅 tiger2|🐆 leopard|🦓 zebra|🦍 gorilla|🐘 elephant|🦒 giraffe|🦘 kangaroo|🐪 camel|🐄 cow2|🐎 racehorse|🐖 pig2|🐑 sheep|🐐 goat|🦌 deer|🐕 dog2|🐈 cat2|🐓 rooster|🦃 turkey|🦚 peacock|🦜 parrot|🦢 swan|🦩 flamingo|🐇 rabbit2|🦝 raccoon|🦦 otter|🦥 sloth|🐿️ chipmunk|🦔 hedgehog|🐉 dragon|🌵 cactus|🎄 christmas_tree|🌲 evergreen|🌳 tree|🌴 palm_tree|🌱 seedling|🌿 herb|☘️ shamrock|🍀 four_leaf_clover luck|🍁 maple_leaf|🍂 fallen_leaf autumn|🍃 leaves|🍄 mushroom|🌾 rice|💐 bouquet|🌷 tulip|🌹 rose|🥀 wilted_rose|🌺 hibiscus|🌸 cherry_blossom|🌼 blossom|🌻 sunflower|🌞 sun_with_face|🌝 full_moon_face|🌛 moon_face|🌙 crescent_moon|🌎 earth_americas|🌍 earth_africa|🌏 earth_asia|🪐 planet|💫 dizzy_star|⭐ star|🌟 star2 glow|✨ sparkles|⚡ zap lightning|☄️ comet|💥 boom|🔥 fire lit hot|🌪️ tornado|🌈 rainbow|☀️ sunny|🌤️ partly_sunny|⛅ cloudy|🌧️ rain|⛈️ storm|❄️ snowflake|☃️ snowman|🌊 wave ocean|💧 droplet|☔ umbrella`],
  ['food', 'Food & Drink', '🍔', `
🍏 green_apple|🍎 apple|🍐 pear|🍊 orange tangerine|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍈 melon|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🍆 eggplant|🥑 avocado|🥦 broccoli|🥬 leafy_green|🥒 cucumber|🌶️ hot_pepper|🌽 corn|🥕 carrot|🧄 garlic|🧅 onion|🥔 potato|🥐 croissant|🥯 bagel|🍞 bread|🥖 baguette|🧀 cheese|🥚 egg|🍳 cooking|🥞 pancakes|🧇 waffle|🥓 bacon|🥩 steak|🍗 poultry_leg|🍖 meat|🌭 hotdog|🍔 hamburger burger|🍟 fries|🍕 pizza|🥪 sandwich|🌮 taco|🌯 burrito|🥗 salad|🍝 spaghetti pasta|🍜 ramen noodles|🍲 stew|🍛 curry|🍣 sushi|🍱 bento|🥟 dumpling|🍤 fried_shrimp|🍙 rice_ball|🍚 rice|🍘 rice_cracker|🍥 fish_cake|🥠 fortune_cookie|🍢 oden|🍡 dango|🍧 shaved_ice|🍨 ice_cream|🍦 icecream soft|🥧 pie|🧁 cupcake|🍰 cake|🎂 birthday cake|🍮 custard|🍭 lollipop|🍬 candy|🍫 chocolate|🍿 popcorn|🍩 doughnut donut|🍪 cookie|🌰 chestnut|🥜 peanuts|🍯 honey|🥛 milk|☕ coffee|🍵 tea|🧃 juice_box|🥤 cup_with_straw|🧋 bubble_tea boba|🍶 sake|🍺 beer|🍻 beers cheers|🥂 champagne_glass toast|🍷 wine|🥃 tumbler|🍸 cocktail|🍹 tropical_drink|🍾 champagne|🧊 ice|🥄 spoon|🍴 fork_and_knife|🍽️ plate`],
  ['activity', 'Activities', '⚽', `
⚽ soccer football|🏀 basketball|🏈 american_football|⚾ baseball|🥎 softball|🎾 tennis|🏐 volleyball|🏉 rugby|🥏 frisbee|🎱 8ball pool|🏓 ping_pong|🏸 badminton|🏒 hockey|🥅 goal|⛳ golf|🏹 bow_and_arrow|🎣 fishing|🥊 boxing|🥋 martial_arts|🎽 running_shirt|🛹 skateboard|⛸️ ice_skate|🎿 ski|🏂 snowboarder|🏋️ weight_lifting|🤸 cartwheel|⛹️ basketball_player|🏆 trophy win|🥇 first_place gold|🥈 second_place silver|🥉 third_place bronze|🏅 medal|🎖️ military_medal|🎗️ reminder_ribbon|🎫 ticket|🎟️ admission_tickets|🎪 circus|🎭 performing_arts theater|🎨 art palette|🎬 clapper movie|🎤 microphone sing|🎧 headphones music|🎼 score|🎹 piano|🥁 drum|🎷 saxophone|🎺 trumpet|🎸 guitar|🎻 violin|🎲 dice game|♟️ chess|🎯 dart bullseye target|🎳 bowling|🎮 video_game controller gaming|🕹️ joystick|🧩 puzzle|🎰 slot_machine|🎉 tada party celebrate hooray|🎊 confetti|🎈 balloon|🎁 gift present|🎀 ribbon|🪅 pinata|🎆 fireworks|🎇 sparkler|🧨 firecracker`],
  ['travel', 'Travel & Places', '✈️', `
🚗 car|🚕 taxi|🚙 suv|🚌 bus|🏎️ race_car|🚓 police_car|🚑 ambulance|🚒 fire_engine|🚚 truck|🚜 tractor|🛴 scooter|🚲 bike bicycle|🛵 motor_scooter|🏍️ motorcycle|🚨 rotating_light siren|🚔 oncoming_police|🚍 oncoming_bus|🚘 oncoming_car|🚖 oncoming_taxi|🚡 aerial_tramway|🚂 steam_locomotive train|🚆 train2|🚇 metro|🚊 tram|🚝 monorail|🚄 bullettrain|✈️ airplane plane|🛫 departure|🛬 arrival|🚀 rocket launch ship|🛸 ufo|🚁 helicopter|⛵ sailboat|🚤 speedboat|🛳️ cruise_ship|⚓ anchor|⛽ fuel|🚧 construction|🚦 traffic_light|🗺️ map|🗿 moai|🗽 statue_of_liberty|🗼 tokyo_tower|🏰 castle|🏯 japanese_castle|🏟️ stadium|🎡 ferris_wheel|🎢 roller_coaster|🎠 carousel|⛲ fountain|🏖️ beach|🏝️ island|🏜️ desert|🌋 volcano|⛰️ mountain|🏔️ snow_mountain|🗻 mount_fuji|🏕️ camping|⛺ tent|🏠 house home|🏡 house_garden|🏢 office|🏥 hospital|🏦 bank|🏨 hotel|🏪 store|🏫 school|⛪ church|🕌 mosque|🌅 sunrise|🌄 sunrise_mountains|🌠 shooting_star|🎇 sparkler2|🌃 night_city|🌆 city_dusk|🌉 bridge_night|🌌 milky_way`],
  ['objects', 'Objects', '💡', `
⌚ watch|📱 phone mobile|💻 laptop computer|⌨️ keyboard|🖥️ desktop|🖨️ printer|🖱️ mouse_computer|💾 floppy save|💿 cd|📷 camera|📸 camera_flash|📹 video_camera|🎥 movie_camera|📞 telephone|☎️ phone_classic|📺 tv|📻 radio|🎙️ studio_microphone|⏰ alarm_clock|⏳ hourglass|📡 satellite|🔋 battery|🔌 plug|💡 bulb idea|🔦 flashlight|🕯️ candle|🧯 extinguisher|💸 money_wings|💵 dollar|💰 moneybag|💳 credit_card|💎 gem diamond|⚖️ scales|🧰 toolbox|🔧 wrench|🔨 hammer|⚒️ hammer_pick|🛠️ tools|⛏️ pick|🔩 nut_bolt|⚙️ gear settings|🧱 bricks|⛓️ chains|🧲 magnet|🔫 water_pistol|💣 bomb|🔪 knife|🗡️ dagger|⚔️ swords|🛡️ shield|🔮 crystal_ball|🧿 nazar|📿 beads|💈 barber|🔭 telescope|🔬 microscope|🩹 adhesive_bandage|💊 pill|💉 syringe|🧬 dna|🦠 microbe|🧪 test_tube|🌡️ thermometer|🧹 broom|🧺 basket|🧻 roll_of_paper|🚽 toilet|🛁 bathtub|🔑 key|🗝️ old_key|🚪 door|🛋️ couch|🛏️ bed|🧸 teddy_bear|🖼️ frame|🛍️ shopping_bags|🛒 shopping_cart|✉️ envelope|📩 envelope_arrow|📨 incoming_envelope|📧 email|💌 love_letter|📦 package box|🏷️ label tag|📪 mailbox_closed|📬 mailbox_mail|📜 scroll|📃 page_curl|📄 page|📑 bookmark_tabs|📊 bar_chart|📈 chart_up|📉 chart_down|🗒️ notepad|🗓️ calendar_spiral|📆 calendar|📅 date|🗑️ wastebasket|📇 card_index|🗃️ card_box|🗳️ ballot|🗄️ cabinet|📋 clipboard|📁 folder|📂 open_folder|🗂️ dividers|🗞️ newspaper_rolled|📰 newspaper|📓 notebook|📔 notebook_deco|📒 ledger|📕 book_red|📗 book_green|📘 book_blue|📙 book_orange|📚 books|📖 open_book|🔖 bookmark|🔗 link|📎 paperclip|📐 triangular_ruler|📏 ruler|📌 pushpin pin|📍 round_pushpin|✂️ scissors|🖊️ pen|🖋️ fountain_pen|✒️ nib|🖌️ paintbrush|🖍️ crayon|📝 memo note|✏️ pencil|🔍 mag search|🔎 mag_right|🔏 lock_pen|🔐 closed_lock_key|🔒 lock|🔓 unlock`],
  ['symbols', 'Symbols', '❤️', `
❤️ heart love red|🧡 orange_heart|💛 yellow_heart|💚 green_heart|💙 blue_heart|💜 purple_heart|🖤 black_heart|🤍 white_heart|🤎 brown_heart|💔 broken_heart|❣️ heart_exclamation|💕 two_hearts|💞 revolving_hearts|💓 heartbeat|💗 heartpulse|💖 sparkling_heart|💘 cupid|💝 gift_heart|💟 heart_decoration|☮️ peace_symbol|✝️ cross|☪️ star_and_crescent|🕉️ om|☯️ yin_yang|♈ aries|♉ taurus|♊ gemini|♋ cancer|♌ leo|♍ virgo|♎ libra|♏ scorpius|♐ sagittarius|♑ capricorn|♒ aquarius|♓ pisces|⚛️ atom|☢️ radioactive|☣️ biohazard|📴 mobile_off|📳 vibration|🆚 vs|💯 100 hundred perfect|💢 anger|♨️ hotsprings|🚫 no_entry_sign|⛔ no_entry|📛 name_badge|❌ x cross no|⭕ o circle|🛑 stop|❗ exclamation|❕ grey_exclamation|❓ question|❔ grey_question|‼️ bangbang|⁉️ interrobang|⚠️ warning|🚸 children_crossing|🔱 trident|⚜️ fleur_de_lis|🔰 beginner|♻️ recycle|✅ white_check_mark done yes|☑️ ballot_box_check|✔️ check_mark|➕ plus|➖ minus|➗ divide|✖️ multiply|♾️ infinity|💲 heavy_dollar|💱 currency_exchange|©️ copyright|®️ registered|™️ tm|🔚 end|🔙 back|🔛 on|🔝 top|🔜 soon|➡️ arrow_right|⬅️ arrow_left|⬆️ arrow_up|⬇️ arrow_down|↗️ arrow_upper_right|↘️ arrow_lower_right|↙️ arrow_lower_left|↖️ arrow_upper_left|↕️ arrow_up_down|↔️ left_right|🔄 arrows_counterclockwise|🔃 arrows_clockwise|🎵 musical_note|🎶 notes|〰️ wavy_dash|➰ curly_loop|🔴 red_circle|🟠 orange_circle|🟡 yellow_circle|🟢 green_circle|🔵 blue_circle|🟣 purple_circle|⚫ black_circle|⚪ white_circle|🟥 red_square|🟧 orange_square|🟨 yellow_square|🟩 green_square|🟦 blue_square|🟪 purple_square|⬛ black_square|⬜ white_square|🔶 large_orange_diamond|🔷 large_blue_diamond|🔺 red_triangle|🔻 red_triangle_down|💠 diamond_dot|🔘 radio_button|🔔 bell|🔕 no_bell|📣 mega|📢 loudspeaker|💬 speech_balloon|💭 thought_balloon|🗯️ anger_bubble|♠️ spades|♣️ clubs|♥️ hearts|♦️ diamonds|🃏 joker|🀄 mahjong|🕐 clock1|🕒 clock3|🕕 clock6|🕘 clock9|🕛 clock12`],
  ['flags', 'Flags', '🏁', `
🏁 checkered_flag finish|🚩 triangular_flag|🎌 crossed_flags|🏴 black_flag|🏳️ white_flag|🏳️‍🌈 rainbow_flag pride|🏳️‍⚧️ transgender_flag|🏴‍☠️ pirate_flag|🇺🇸 flag_us usa|🇬🇧 flag_gb uk|🇨🇦 flag_ca canada|🇦🇺 flag_au australia|🇮🇳 flag_in india|🇳🇵 flag_np nepal|🇯🇵 flag_jp japan|🇰🇷 flag_kr korea|🇨🇳 flag_cn china|🇩🇪 flag_de germany|🇫🇷 flag_fr france|🇪🇸 flag_es spain|🇮🇹 flag_it italy|🇧🇷 flag_br brazil|🇲🇽 flag_mx mexico|🇳🇱 flag_nl netherlands|🇸🇪 flag_se sweden|🇳🇴 flag_no norway|🇫🇮 flag_fi finland|🇵🇱 flag_pl poland|🇺🇦 flag_ua ukraine|🇹🇷 flag_tr turkey|🇿🇦 flag_za south_africa|🇳🇬 flag_ng nigeria|🇪🇬 flag_eg egypt|🇦🇷 flag_ar argentina|🇮🇪 flag_ie ireland|🇵🇹 flag_pt portugal|🇸🇬 flag_sg singapore|🇳🇿 flag_nz new_zealand`],
];

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map(([id, label, icon, body]) => ({
  id, label, icon,
  emoji: body.trim().split(/\||\n/).map((s) => s.trim()).filter(Boolean).map((item) => {
    const [e, ...rest] = item.split(' ');
    return { e, n: rest[0] || '', k: rest.join(' ') };
  }),
}));

export const ALL_EMOJI: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emoji);

export function searchEmoji(q: string, limit = 80): EmojiEntry[] {
  const s = q.toLowerCase().replace(/^:/, '').replace(/:$/, '');
  if (!s) return [];
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const e of ALL_EMOJI) {
    if (e.n.startsWith(s)) starts.push(e);
    else if (e.k.includes(s)) contains.push(e);
  }
  return [...starts, ...contains].slice(0, limit);
}

const RECENT_KEY = 'huddle.recentEmoji';
export function getRecentEmoji(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
export function pushRecentEmoji(e: string) {
  const list = [e, ...getRecentEmoji().filter((x) => x !== e)].slice(0, 24);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  recentVersion++;
  for (const l of recentListeners) l();
}

// Quick reactions (message hover toolbar): the first few recent emoji, topped up with defaults.
const QUICK_DEFAULTS = ['👍', '❤️', '😂'];
let recentVersion = 0;
const recentListeners = new Set<() => void>();
export function subscribeRecentEmoji(fn: () => void): () => void {
  recentListeners.add(fn);
  return () => { recentListeners.delete(fn); };
}
export const recentEmojiVersion = () => recentVersion;

/** Recent emoji usable as one-click reactions (custom emoji we can't resolve any more are skipped). */
export function getQuickReactions(n = 3): string[] {
  const out = getRecentEmoji().filter((e) => {
    const id = customReactionId(normalizeReactionKey(e));
    return !id || !!findCustomEmoji(id);
  });
  for (const d of QUICK_DEFAULTS) if (!out.includes(d)) out.push(d);
  return out.slice(0, n);
}

// ---- custom server emoji ----
// Tokens are <:name:id> / <a:name:id> (see @huddle/shared emojis.ts). The composer only converts
// ":name:" for emoji of the channel's own server; rendering resolves ids across every server we're in.

/** Looks up a custom emoji by id across all joined servers. */
export function findCustomEmoji(id: string): GuildEmoji | undefined {
  for (const list of Object.values(useGuildStore.getState().emojis)) {
    const e = list.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

export function searchCustomEmoji(guildId: string | null | undefined, q: string, limit = 80): GuildEmoji[] {
  if (!guildId) return [];
  const list = useGuildStore.getState().emojis[guildId] || [];
  const s = q.toLowerCase().replace(/^:/, '').replace(/:$/, '');
  if (!s) return list.slice(0, limit);
  const starts = list.filter((e) => e.name.toLowerCase().startsWith(s));
  const contains = list.filter((e) => !e.name.toLowerCase().startsWith(s) && e.name.toLowerCase().includes(s));
  return [...starts, ...contains].slice(0, limit);
}

/** Converts ":name:" into <:name:id> tokens for the server's emoji. Skips code spans/blocks and existing tokens. */
export function encodeCustomEmoji(text: string, guildId: string | null | undefined): string {
  const list = guildId ? useGuildStore.getState().emojis[guildId] : undefined;
  if (!list?.length) return text;
  const byName = new Map(list.map((e) => [e.name.toLowerCase(), e]));
  const convert = (s: string) => s.replace(/(<a?:[A-Za-z0-9_]{2,32}:\d+>)|:([A-Za-z0-9_]{2,32}):/g, (all, tok: string | undefined, name: string | undefined) => {
    if (tok || !name) return all;
    const e = byName.get(name.toLowerCase());
    return e ? emojiToken(e) : all;
  });
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, idx) => (idx % 2 ? part : convert(part))).join('');
}

/** Reaction info for a reaction key or a picked emoji (unicode or token). */
export function reactionEmojiInfo(key: string, custom?: CustomEmojiRef | null): { key: string; custom: CustomEmojiRef | null; label: string } {
  const norm = normalizeReactionKey(key);
  const id = customReactionId(norm);
  if (!id) return { key: norm, custom: null, label: key };
  const known = findCustomEmoji(id);
  const ref = custom ?? (known ? { id, name: known.name, animated: known.animated, url: known.url } : null);
  return { key: norm, custom: ref, label: ref ? `:${ref.name}:` : ':emoji:' };
}
