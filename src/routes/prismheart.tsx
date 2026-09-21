import { createFileRoute } from "@tanstack/react-router";
import { Heart, Home, RotateCcw, Sparkles, Star, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/prismheart")({
  head: () => {
    const seo = seoHead({
      path: "/prismheart",
      title: "Prism Heart",
      description:
        "A magical girl visual novel. Choose your path, bond with your friends, and decide the fate of the city of Astralis.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: PrismHeartPage,
});

type Lang = "bg" | "en" | "zh";
type SpeakerId = "lumi" | "glint" | "mia" | "kael" | "shade";
type EndId = "starlight" | "courage" | "friendship" | "gloom";

interface Localized {
  bg: string;
  en: string;
  zh: string;
}

interface ChoiceOption {
  label: Localized;
  bond: number;
  courage: number;
  speaker: SpeakerId;
  reaction: Localized;
}

interface Scene {
  tag: Localized;
  speaker: SpeakerId;
  text: Localized;
  inner?: Localized;
  choices: ChoiceOption[];
}

const SPEAKERS: Record<SpeakerId, { name: Localized; emoji: string; color: string }> = {
  lumi: {
    name: { bg: "Луми", en: "Lumi", zh: "露米" },
    emoji: "✨",
    color: "#fdf4ff",
  },
  glint: {
    name: { bg: "Блясък", en: "Glint", zh: "闪光" },
    emoji: "🌟",
    color: "#fde68a",
  },
  mia: {
    name: { bg: "Миа", en: "Mia", zh: "米娅" },
    emoji: "🎀",
    color: "#f9a8d4",
  },
  kael: {
    name: { bg: "Кейл", en: "Kael", zh: "凯尔" },
    emoji: "🐾",
    color: "#7dd3fc",
  },
  shade: {
    name: { bg: "Сянката", en: "The Shade", zh: "暗影" },
    emoji: "🌑",
    color: "#c4b5fd",
  },
};

const ENDINGS: Record<EndId, { title: Localized; emoji: string; color: string; text: Localized }> =
  {
    starlight: {
      title: { bg: "ЗВЕЗДЕН ФИНАЛ", en: "STARLIGHT ENDING", zh: "星光结局" },
      emoji: "👑",
      color: "#fde68a",
      text: {
        bg: "Светлината над Астралис пулсира в пет цвята. Ти, Миа, Кейл и Блясък заедно връщате Призмените сърца. Сянката не е победена завинаги — но от този ден никой не е сам.",
        en: "The light above Astralis pulses in five colors. You, Mia, Kael and Glint return the Prism Hearts together. The Shade is not defeated forever — but from this day on, no one walks alone.",
        zh: "阿斯特拉利斯上空的星光泛起五种色彩。你、米娅、凯尔和闪光一起归还了棱镜之心。暗影并未被永久击败——但从这一天起，没有人再独自前行。",
      },
    },
    courage: {
      title: { bg: "ФИНАЛ НА СМЕЛОСТТА", en: "BRAVE ENDING", zh: "勇者结局" },
      emoji: "⚔️",
      color: "#7dd3fc",
      text: {
        bg: "Самичка, с разтреперани колене, ти връщаш четирите сърца. Градът светва. Миа и Кейл те гледат отдалече — уважение, но и малка тъга, че не си ги пуснала близо.",
        en: "Alone, knees trembling, you return all four hearts. The city lights up. Mia and Kael watch you from afar — with respect, and a little sadness that you never let them near.",
        zh: "独自一人，双膝颤抖，你归还了全部四颗心。城市亮了起来。米娅和凯尔远远望着你——带着敬意，也带着一丝你从未让他们靠近的忧伤。",
      },
    },
    friendship: {
      title: { bg: "ФИНАЛ НА ПРИЯТЕЛСТВОТО", en: "FRIENDSHIP ENDING", zh: "友情结局" },
      emoji: "💞",
      color: "#f9a8d4",
      text: {
        bg: "Приятелството надделява. Сянката се оттегля, когато петте сърца пеят в един тон — но тя ще се върне. Някой трябва да стане малко по-смел, и знаеш, че ще е време за това.",
        en: "Friendship wins the day. The Shade retreats as the five hearts sing in unison — but it will return. Someone must grow a little braver, and you know your time is coming.",
        zh: "友情赢得了胜利。当五颗心齐声歌唱时，暗影退去了——但它终将归来。总要有人变得更勇敢一点，而你知道那时刻即将到来。",
      },
    },
    gloom: {
      title: { bg: "МРАЧЕН ФИНАЛ", en: "GLOOM ENDING", zh: "暗夜结局" },
      emoji: "🌘",
      color: "#a78bfa",
      text: {
        bg: "Астралис потъва в синкав здрач. Останки от звезди падат като сняг. Но в кутията ти винаги свети една искра — защото историите не свършват с мрак.",
        en: "Astralis sinks into a blue twilight. Star-dust falls like snow. But in your box a single spark always glows — because stories never end in darkness.",
        zh: "阿斯特拉利斯沉入湛蓝暮色。星尘如雪花飘落。但你的盒子里总有一点微光——因为故事不会以黑暗终结。",
      },
    },
  };

const SCENES: Scene[] = [
  {
    tag: { bg: "ПРОЛОГ", en: "PROLOGUE", zh: "序幕" },
    speaker: "lumi",
    text: {
      bg: "Градът Астралис тоне в сянка. Когато звездната фея Блясък се разби в прозореца ти снощи, знаеше, че обикновените дни са свършили. Дворът на Сянката открадна петте Призмени сърца — и с тях цвета и смелостта на града.",
      en: "The city of Astralis sinks into shadow. When the star fairy Glint crashed through your window last night, you knew your ordinary days were over. The Shade Court stole the five Prism Hearts — and with them, the city's color and courage.",
      zh: "阿斯特拉利斯城沉入阴影。昨夜星光精灵闪光撞进你的窗户时，你就知道平常的日子结束了。暗影庭院偷走了五颗棱镜之心——连同这座城市的色彩与勇气。",
    },
    inner: {
      bg: "„Аз съм Луми. А сега… съм и последната надежда на града.“",
      en: "“I am Lumi. And now… the city's last hope, too.”",
      zh: "“我是露米。而现在……也是这座城市最后的希望。”",
    },
    choices: [
      {
        label: { bg: "Започни приключението", en: "Begin the adventure", zh: "开始冒险" },
        bond: 1,
        courage: 1,
        speaker: "glint",
        reaction: {
          bg: "„Смелост и приятелство — и двете ще са ти нужни. Да тръгваме!“",
          en: "“Courage and friendship — you'll need them both. Let's go!”",
          zh: "“勇气与友情——你两者都需要。出发吧！”",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 01", en: "SCENE 01", zh: "场景 01" },
    speaker: "mia",
    text: {
      bg: "По пътя към звездния приют се натъкваш на съученичката си Миа, трепереща под арка от мрак. „Луми! Светлината изчезва от града. Страх ме е да се прибера сама.“",
      en: "On the way to the star shelter you run into your classmate Mia, trembling under a dark arch. “Lumi! The light is leaving the city. I'm scared to walk home alone.”",
      zh: "在去星光庇护所的路上，你遇到了同学米娅，她在一座黑暗拱门下瑟瑟发抖。“露米！光正在离开这座城市。我不敢一个人回家。”",
    },
    choices: [
      {
        label: {
          bg: "Хвани я за ръка: „Заедно сме по-силни.“",
          en: "Take her hand: “Together we're stronger.”",
          zh: "握住她的手：“在一起我们就更强大。”",
        },
        bond: 2,
        courage: 1,
        speaker: "mia",
        reaction: {
          bg: "Миа вдига брадичка. „…Добре, но ти се грижеш за мен, нали?“",
          en: "Mia lifts her chin. “…Okay, but you're taking care of me, right?”",
          zh: "米娅抬起下巴。“……好吧，但你要保护我，对吧？”",
        },
      },
      {
        label: {
          bg: "Застани пред нея: „Аз ще пазя светлината.“",
          en: "Step in front of her: “I'll guard the light.”",
          zh: "挡在她面前：“我会守护光芒。”",
        },
        courage: 2,
        bond: 1,
        speaker: "mia",
        reaction: {
          bg: "Миа примигва. „Колко си смела, Луми…“",
          en: "Mia blinks. “You're so brave, Lumi…”",
          zh: "米娅眨了眨眼。“露米，你好勇敢……”",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 02", en: "SCENE 02", zh: "场景 02" },
    speaker: "glint",
    text: {
      bg: "В училищния двор сянка обгръща кленовото дърво и се превръща в създание с очи от празнота. „Това е кошмарен плъх, Луми! Не откъсвай поглед от него.“",
      en: "In the schoolyard, shadow wraps the maple tree and twists into a creature with eyes of nothing. “That's a nightmare rat, Lumi! Don't take your eyes off it.”",
      zh: "校园里，阴影缠绕枫树，化作一只眼底空无一物的生物。“那是噩梦鼠，露米！别移开目光。”",
    },
    choices: [
      {
        label: {
          bg: "Атакувай право в мрака",
          en: "Strike straight into the dark",
          zh: "直击黑暗",
        },
        courage: 2,
        bond: 1,
        speaker: "glint",
        reaction: {
          bg: "„Блясък! Ти го прогони… но Миа? Да проверим.“",
          en: "“A flash! You chased it off… but Mia? Let's check.”",
          zh: "“闪光！你赶走了它……但米娅呢？我们去看看。”",
        },
      },
      {
        label: {
          bg: "Прикрий Миа зад себе си",
          en: "Shield Mia behind you",
          zh: "把米娅护在身后",
        },
        bond: 2,
        courage: 1,
        speaker: "glint",
        reaction: {
          bg: "„Умно! Когато сърцата се пазят взаимно, мракът отслабва.“",
          en: "“Smart! When hearts guard each other, the dark weakens.”",
          zh: "“聪明！当心互相守护时，黑暗就会变弱。”",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 03", en: "SCENE 03", zh: "场景 03" },
    speaker: "kael",
    text: {
      bg: "В кулоарите срещаш Кейл с празна кутия за колекция. „Търся третото сърце в библиотеката. Сам съм по-бърз — нямам нужда от компания.“",
      en: "In the hallway you meet Kael with an empty collector's box. “I'm hunting the third heart in the library. I'm faster alone — I don't need company.”",
      zh: "走廊里你遇到了凯尔，他抱着一个空的收藏盒。“我要去图书馆找第三颗心。独自行动更快——我不需要同伴。”",
    },
    choices: [
      {
        label: {
          bg: "„Мога да пазя гръб, докато търсиш.“",
          en: "“I can watch your back while you search.”",
          zh: "“你寻找时，我来替你警戒。”",
        },
        bond: 2,
        courage: 1,
        speaker: "kael",
        reaction: {
          bg: "Кейл се изчервява. „…Че кога намерих приятел в края на света? Е, ела.“",
          en: "Kael reddens. “…Since when did I find a friend at the end of the world? Fine. Come on.”",
          zh: "凯尔脸红了。“……我什么时候在世界尽头也有朋友了？算了，来吧。”",
        },
      },
      {
        label: {
          bg: "„Нямам нужда от никого.“",
          en: "“I don't need anyone.”",
          zh: "“我不需要任何人。”",
        },
        courage: 2,
        bond: 1,
        speaker: "kael",
        reaction: {
          bg: "Кейл свива рамене. „Както искаш, луда героице.“",
          en: "Kael shrugs. “Suit yourself, crazy heroine.”",
          zh: "凯尔耸耸肩。“随你吧，疯狂的女英雄。”",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 04", en: "SCENE 04", zh: "场景 04" },
    speaker: "lumi",
    text: {
      bg: "До фонтана плаче дете — гълъбът му е потънал в локва сянка. „Госпожице! Той ще изчезне като цветовете!“",
      en: "By the fountain a child is crying — their dove has sunk into a puddle of shadow. “Miss! It'll disappear like the colors!”",
      zh: "喷泉旁有孩子在哭泣——他们的鸽子沉入了一滩阴影。“小姐！它会像那些颜色一样消失的！”",
    },
    inner: {
      bg: "Може да спася гълъба — или да проследя дирята на сърцето, която се губи на север.",
      en: "I could save the dove — or follow the heart's trail fading to the north.",
      zh: "我可以救那只鸽子——或者追踪向北消失的心之痕迹。",
    },
    choices: [
      {
        label: {
          bg: "Спаси гълъба първо",
          en: "Rescue the dove first",
          zh: "先救鸽子",
        },
        bond: 2,
        courage: 1,
        speaker: "lumi",
        reaction: {
          bg: "Детските очи се отварят широко. „Ти си магьосницата на звездите! Ще кажа на всички!“",
          en: "The child's eyes go wide. “You're the star magician! I'm telling everyone!”",
          zh: "孩子的眼睛睁大了。“你是星光魔法师！我要告诉所有人！”",
        },
      },
      {
        label: {
          bg: "Следи дирята от разлято сърце",
          en: "Follow the trail of spilled heart",
          zh: "追踪洒落的心之痕迹",
        },
        courage: 2,
        bond: 1,
        speaker: "lumi",
        reaction: {
          bg: "Гълъбът се понася нагоре и изстива — нещо е сгрешено, но следата води нататък.",
          en: "The dove lifts off and goes cold — something is wrong, but the trail leads onward.",
          zh: "鸽子腾空而起又变得冰冷——有什么不对，但痕迹指向了前方。",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 05", en: "SCENE 05", zh: "场景 05" },
    speaker: "shade",
    text: {
      bg: "В кулата с часовника те чака вестоносецът на Сянката. „Едно сърце е достатъчно, за да угаси целия град. Отдай силата си на мрака и ще си тръгна.“",
      en: "In the clock tower, the Shade's messenger waits for you. “One heart is enough to dim the whole city. Give your power to the dark and I will leave.”",
      zh: "钟楼里，暗影的信使在等你。“只需一颗心，就足以让整座城市黯淡。将你的力量献给黑暗，我便离开。”",
    },
    choices: [
      {
        label: {
          bg: "„Светлината ми идва от моите приятели. Никога.“",
          en: "“My light comes from my friends. Never.”",
          zh: "“我的光芒来自朋友们。绝不。”",
        },
        bond: 2,
        courage: 1,
        speaker: "shade",
        reaction: {
          bg: "Сянката се дръпва. „Топла дума… как ефективно срещу мрака. Продължай да я вярваш.“",
          en: "The Shade recoils. “A warm word… how effective against darkness. Keep believing it.”",
          zh: "暗影退缩了。“多么温暖的话语……对黑暗竟如此有效。继续相信它吧。”",
        },
      },
      {
        label: {
          bg: "„Не ми трябва никой — вземи го.“ (залъгваш го)",
          en: "“I don't need anyone — take it.” (you bait it closer)",
          zh: "“我不需要任何人——拿去吧。”（你引诱它靠近）",
        },
        courage: 2,
        bond: 1,
        speaker: "shade",
        reaction: {
          bg: "Хвърляш се напред и грабваш сърцето от дланта му. Дързост, която дори Сянката не очакваше.",
          en: "You lunge forward and snatch the heart from its palm. A boldness even the Shade didn't expect.",
          zh: "你猛冲上前，从它掌中夺回了那颗心。这份果敢连暗影都未曾预料。",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 06", en: "SCENE 06", zh: "场景 06" },
    speaker: "mia",
    text: {
      bg: "Миа и Кейл спорят пред портите: тя иска да съберат приятели за разсъмване, той — да ударят сега, без колебание. „Казваме му нещо!“",
      en: "Mia and Kael argue before the gates: she wants to gather friends by dawn, he wants to strike now, without hesitation. “Say something to them!”",
      zh: "米娅和凯尔在门前争执：她想在黎明前汇合更多朋友，他则想立刻行动、毫不犹豫。“你倒是说句话呀！”",
    },
    choices: [
      {
        label: {
          bg: "Вмешай се и ги сдобри",
          en: "Step in and reconcile them",
          zh: "介入并调解他们",
        },
        bond: 2,
        courage: 1,
        speaker: "kael",
        reaction: {
          bg: "„Няма да пречупим града, ако сме заедно.“ Спорът затихва — гласовете се сливат в един план.",
          en: "“We won't break the city if we're together.” The argument fades — voices merge into one plan.",
          zh: "“只要我们在一起，就不会让城市破碎。”争执平息了——声音汇成了一个计划。",
        },
      },
      {
        label: {
          bg: "Реши ти: „Тръгваме сега, без колебание.“",
          en: "Decide it yourself: “We move now, without hesitation.”",
          zh: "由你决定：“现在就行动，毫不犹豫。”",
        },
        courage: 2,
        bond: 1,
        speaker: "mia",
        reaction: {
          bg: "„Тя е права, няма време.“ Въздишка. И двамата тръгват след теб.",
          en: "“She's right, there's no time.” A sigh. And both of them follow.",
          zh: "“她说得对，没时间了。”一声叹息。两人都跟上了你。",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 07", en: "SCENE 07", zh: "场景 07" },
    speaker: "shade",
    text: {
      bg: "Последната битка. Сянката се стяга в звяр от ръждясали игли, който затъмнява небето над площада. „Покажи ми колко струва мечтата ти, звездно момиче!“",
      en: "The final battle. The Shade coils into a beast of rusted needles that darkens the sky over the square. “Show me what your dream is worth, star girl!”",
      zh: "最终之战。暗影蜷成一头锈针巨兽，遮蔽广场上方的天空。“让我看看你的梦想值多少，星星女孩！”",
    },
    choices: [
      {
        label: {
          bg: "Извикай светлината на приятелите",
          en: "Call forth your friends' light",
          zh: "呼唤朋友的光芒",
        },
        bond: 2,
        courage: 1,
        speaker: "mia",
        reaction: {
          bg: "Пет Призмени сърца отекват в един тон. Тълпата ахва — звярът се разпилява като ситен дъжд.",
          en: "Five Prism Hearts ring in a single chord. The crowd gasps — the beast scatters like drizzle.",
          zh: "五颗棱镜之心齐鸣成一声和弦。人群惊呼——巨兽如蒙蒙细雨般散落。",
        },
      },
      {
        label: {
          bg: "Избухни с цялата си сила",
          en: "Detonate with all your strength",
          zh: "以全力爆发",
        },
        courage: 2,
        bond: 1,
        speaker: "kael",
        reaction: {
          bg: "Взрив от светлина разбива иглените вериги. Гребенът на Сянката се пропуква — победа, платена с адреналин.",
          en: "A burst of light shatters the needle-chains. The Shade's crest cracks — a victory paid in adrenaline.",
          zh: "一道光爆击碎了针链。暗影的冠脊裂开——这场胜利以肾上腺素为代价。",
        },
      },
    ],
  },
  {
    tag: { bg: "СЦЕНА 08", en: "SCENE 08", zh: "场景 08" },
    speaker: "glint",
    text: {
      bg: "Краят на всичко. Блясък вплита сиянието на петте сърца в една последна дума, обърната към теб. „Избрахме всичко, за да стигнем дотук. Какъв финал искаш да напишем?“",
      en: "The end of everything. Glint weaves the glow of the five hearts into one last word, turned to you. “We chose everything to get here. What ending do we write?”",
      zh: "一切的终点。闪光将五颗心的光芒织成最后一句话，转向你。“我们付出一切才走到这里。要写下怎样的结局？”",
    },
    choices: [
      {
        label: {
          bg: "„Този, в който никой не е сам.“",
          en: "“The one where nobody is alone.”",
          zh: "“是一个没有人孤独的结局。”",
        },
        bond: 2,
        courage: 0,
        speaker: "glint",
        reaction: {
          bg: "Блясък се усмихва. „Това е най-смелият избор.“",
          en: "Glint smiles. “That is the bravest choice.”",
          zh: "闪光微笑。“这是最勇敢的选择。”",
        },
      },
      {
        label: {
          bg: "„Този, в който светлината побеждава сама.“",
          en: "“The one where the light wins on its own.”",
          zh: "“是一个光芒独自取胜的结局。”",
        },
        courage: 2,
        bond: 0,
        speaker: "glint",
        reaction: {
          bg: "Блясък навежда глава. „…Тогава ме остави да гледам.“",
          en: "Glint bows its head. “…Then let me watch.”",
          zh: "闪光低下头。“……那就让我看着吧。”",
        },
      },
    ],
  },
];

function endingFor(bond: number, courage: number): EndId {
  if (bond >= 12 && courage >= 12) return "starlight";
  if (courage >= 12) return "courage";
  if (bond >= 12) return "friendship";
  return "gloom";
}

const SAVE_KEY = "prism-heart-progress";
const ENDINGS_KEY = "prism-heart-endings";

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function PrismHeartPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const audioRef = useRef<{ ctx: AudioContext | null }>({ ctx: null });

  const [phase, setPhase] = useState<"title" | "story" | "ending">("title");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [bond, setBond] = useState(0);
  const [courage, setCourage] = useState(0);
  const [reaction, setReaction] = useState<ChoiceOption | null>(null);
  const [lastEnding, setLastEnding] = useState<EndId | null>(null);
  const [unlocked, setUnlocked] = useState<EndId[]>([]);
  const [freshUnlock, setFreshUnlock] = useState<EndId | null>(null);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    const saved = loadJSON<{ scene: number; bond: number; courage: number } | null>(SAVE_KEY, null);
    setHasSave(Boolean(saved));
    setUnlocked(loadJSON<EndId[]>(ENDINGS_KEY, []));
  }, []);

  const tone = useCallback(
    (freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
      if (typeof window === "undefined") return;
      let ctx = audioRef.current.ctx;
      if (!ctx) {
        try {
          ctx = new AudioContext();
          audioRef.current.ctx = ctx;
        } catch {
          return;
        }
      }
      void ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    },
    [],
  );

  const continueRun = useCallback(() => {
    const saved = loadJSON<{ scene: number; bond: number; courage: number } | null>(SAVE_KEY, null);
    if (saved) {
      setSceneIdx(saved.scene);
      setBond(saved.bond);
      setCourage(saved.courage);
      setReaction(null);
      setPhase("story");
    }
  }, []);

  const startRun = useCallback(() => {
    tone(523, 0.1, "square", 0.04);
    setSceneIdx(0);
    setBond(0);
    setCourage(0);
    setReaction(null);
    setPhase("story");
    saveJSON(SAVE_KEY, { scene: 0, bond: 0, courage: 0 });
  }, [tone]);

  const pick = useCallback(
    (choice: ChoiceOption) => {
      tone(784, 0.08, "square", 0.04);
      tone(988, 0.14, "square", 0.04);
      setBond((b) => b + choice.bond);
      setCourage((c) => c + choice.courage);
      setReaction(choice);
    },
    [tone],
  );

  const advance = useCallback(() => {
    tone(440, 0.08, "triangle", 0.03);
    const nextIdx = sceneIdx + 1;
    if (nextIdx >= SCENES.length) {
      saveJSON(SAVE_KEY, null);
      const end = endingFor(bond, courage);
      setLastEnding(end);
      setPhase("ending");
      const current = loadJSON<EndId[]>(ENDINGS_KEY, []);
      if (!current.includes(end)) {
        const updated = [...current, end];
        saveJSON(ENDINGS_KEY, updated);
        setUnlocked(updated);
        setFreshUnlock(end);
        tone(659, 0.12, "square", 0.05);
        window.setTimeout(() => tone(784, 0.12, "square", 0.05), 120);
        window.setTimeout(() => tone(1047, 0.3, "square", 0.05), 240);
      }
      return;
    }
    setSceneIdx(nextIdx);
    setReaction(null);
    saveJSON(SAVE_KEY, { scene: nextIdx, bond, courage });
  }, [bond, courage, sceneIdx, tone]);

  const backToTitle = useCallback(() => {
    setPhase("title");
    setReaction(null);
    setHasSave(false);
  }, []);

  const resetAll = useCallback(() => {
    saveJSON(SAVE_KEY, null);
    setHasSave(false);
    setSceneIdx(0);
    setBond(0);
    setCourage(0);
    setReaction(null);
    setPhase("title");
  }, []);

  const scene = SCENES[sceneIdx];
  const speaker = scene ? SPEAKERS[scene.speaker] : null;
  const end = lastEnding ? ENDINGS[lastEnding] : null;
  const chosenSpeaker = reaction ? SPEAKERS[reaction.speaker] : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#170b28]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#e879f9]/25 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-[#c084fc]/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-56 w-56 rounded-full bg-[#7dd3fc]/15 blur-3xl" />
        <span className="absolute left-[12%] top-[18%] animate-pulse text-lg text-[#f9a8d4]/60">
          ✦
        </span>
        <span className="absolute right-[15%] top-[12%] animate-pulse text-sm text-[#a5f3fc]/60 [animation-delay:700ms]">
          ✦
        </span>
        <span className="absolute left-[22%] bottom-[22%] animate-pulse text-sm text-[#fde68a]/60 [animation-delay:1200ms]">
          ✦
        </span>
        <span className="absolute right-[24%] bottom-[16%] animate-pulse text-lg text-[#c4b5fd]/60 [animation-delay:400ms]">
          ✦
        </span>
      </div>

      <section className="relative mx-auto max-w-2xl px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">14 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : isZh ? "游戏" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[clamp(2.2rem,7vw,4rem)] font-bold leading-none text-[#f9a8d4] drop-shadow-[0_0_18px_rgba(232,121,249,0.45)]">
            PRISM HEART
          </h1>
          <span className="label-mono text-[0.62rem]">
            {isBg
              ? "МАГИЧНО МОМИЧЕ · ВИЗУАЛЕН РОМАН"
              : isZh
                ? "魔法少女 · 视觉小说"
                : "MAGICAL GIRL · VISUAL NOVEL"}
          </span>
        </div>

        <div className="mt-8 rounded-3xl border border-[#e879f9]/25 bg-[#1c0d30]/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[0.62rem] tracking-[0.2em] text-[#e879f9] uppercase">
              {isBg ? "СЮЖЕТ" : isZh ? "剧情" : "STORY"}
            </span>
            <div className="flex items-center gap-4 font-mono text-[0.62rem] tracking-[0.15em] uppercase">
              <span className="inline-flex items-center gap-1 text-[#f9a8d4]">
                <Heart className="size-3.5" fill="#f9a8d4" /> {bond}
              </span>
              <span className="inline-flex items-center gap-1 text-[#7dd3fc]">
                <Star className="size-3.5" fill="#7dd3fc" /> {courage}
              </span>
            </div>
          </div>

          {phase === "title" ? (
            <div className="mt-6 flex flex-col items-center gap-5 text-center">
              <span className="text-5xl">👑✨</span>
              <p className="max-w-md text-sm leading-relaxed text-foreground/85">
                {isBg
                  ? "Градът Астралис тоне в сянка, след като Дворът на Сянката открадна петте Призмени сърца. Ти си Луми — последната надежда на града. Избери пътя си: всеки избор кова връзките и смелостта ти, а финалът зависи от баланса между тях."
                  : isZh
                    ? "暗影庭院偷走了五颗棱镜之心，阿斯特拉利斯城沉入阴影。你是露米——这座城市最后的希望。选择你的道路：每一个选择都在塑造你的友情与勇气，结局取决于两者之间的平衡。"
                    : "The city of Astralis sinks into shadow after the Shade Court stole the five Prism Hearts. You are Lumi — the city's last hope. Choose your path: every choice forges your bonds and your courage, and the ending depends on their balance."}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[0.6rem] font-mono tracking-[0.15em] uppercase">
                <span className="inline-flex items-center gap-1 text-[#f9a8d4]">
                  <Heart className="size-3" fill="#f9a8d4" />{" "}
                  {isBg ? "връзка" : isZh ? "友情" : "bond"}
                </span>
                <span className="text-foreground/30">·</span>
                <span className="inline-flex items-center gap-1 text-[#7dd3fc]">
                  <Star className="size-3" fill="#7dd3fc" />{" "}
                  {isBg ? "смелост" : isZh ? "勇气" : "courage"}
                </span>
                <span className="text-foreground/30">·</span>
                <span className="text-muted-foreground">{SCENES.length - 1}</span>
                <span className="text-foreground/30">·</span>
                <span>{isBg ? "4 финала" : isZh ? "4 种结局" : "4 endings"}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {hasSave ? (
                  <button
                    type="button"
                    onClick={continueRun}
                    className="inline-flex items-center gap-2 rounded-full border border-[#e879f9]/50 bg-[#2a1240] px-7 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-[#fdb8e0] uppercase transition-all duration-200 hover:bg-[#e879f9]/15 hover:shadow-[0_0_18px_rgba(232,121,249,0.3)] active:translate-y-0.5"
                  >
                    <Sparkles className="size-4" />
                    {isBg ? "Продължи" : isZh ? "继续" : "CONTINUE"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startRun}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#e879f9] to-[#c084fc] px-7 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-[#1a0b29] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(232,121,249,0.55)] active:translate-y-0.5"
                >
                  {isBg ? "Започни" : isZh ? "开始" : "START"}
                </button>
              </div>

              {unlocked.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {Object.keys(ENDINGS)
                    .filter((id) => unlocked.includes(id as EndId))
                    .map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-black/20 px-3 py-1.5 font-mono text-[0.55rem] tracking-[0.15em] text-foreground/80 uppercase"
                      >
                        <span>{ENDINGS[id as EndId].emoji}</span>
                        {ENDINGS[id as EndId].title[lang]}
                      </span>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "story" && scene && speaker ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground uppercase">
                  {scene.tag[lang]} / {SCENES.length - 1}
                </span>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-black/20 px-3 py-1.5 font-mono text-[0.55rem] tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                  {isBg ? "Рестарт" : isZh ? "重来" : "RESET"}
                </button>
              </div>

              <div
                className="mt-4 flex items-center gap-3 rounded-2xl border border-white/5 bg-black/25 px-4 py-3"
                style={{ borderColor: `${speaker.color}55` }}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/5 text-2xl">
                  {speaker.emoji}
                </span>
                <div className="min-w-0">
                  <p
                    className="font-mono text-xs font-bold tracking-[0.2em]"
                    style={{ color: speaker.color }}
                  >
                    {speaker.name[lang]}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                    {scene.text[lang]}
                  </p>
                  {scene.inner ? (
                    <p className="mt-2 font-serif text-sm italic text-foreground/60">
                      {scene.inner[lang]}
                    </p>
                  ) : null}
                </div>
              </div>

              {reaction === null ? (
                <div className="mt-5 space-y-2.5">
                  {scene.choices.map((choice) => (
                    <button
                      key={choice.label.en}
                      type="button"
                      onClick={() => pick(choice)}
                      className="group w-full rounded-2xl border border-[#e879f9]/30 bg-black/25 px-4 py-3 text-left font-display text-sm text-foreground transition-all duration-200 hover:border-[#e879f9]/70 hover:bg-[#e879f9]/10 hover:shadow-[0_0_16px_rgba(232,121,249,0.2)] active:translate-y-0.5"
                    >
                      <span className="mr-2 text-[#e879f9] transition-transform group-hover:translate-x-0.5">
                        ›
                      </span>
                      {choice.label[lang]}
                      <span className="mt-1.5 flex items-center gap-3 font-mono text-[0.55rem] tracking-[0.15em] uppercase">
                        <span className="text-[#f9a8d4]">♥ +{choice.bond}</span>
                        <span className="text-[#7dd3fc]">✦ +{choice.courage}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[#c084fc]/40 bg-[#c084fc]/10 p-5">
                  <p className="font-serif text-base italic leading-relaxed text-foreground/90">
                    “{reaction.reaction[lang]}”
                  </p>
                  {chosenSpeaker ? (
                    <p
                      className="mt-2 font-mono text-xs tracking-[0.2em]"
                      style={{ color: chosenSpeaker.color }}
                    >
                      — {chosenSpeaker.emoji} {chosenSpeaker.name[lang]}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase">
                      {isBg ? "Връзка" : isZh ? "友情" : "Bond"}{" "}
                      <Heart className="inline size-3 text-[#f9a8d4]" fill="#f9a8d4" /> {bond}
                      <span className="mx-1 text-foreground/20">·</span>
                      {isBg ? "Смелост" : isZh ? "勇气" : "Courage"}{" "}
                      <Star className="inline size-3 text-[#7dd3fc]" fill="#7dd3fc" /> {courage}
                    </span>
                    <button
                      type="button"
                      onClick={advance}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#e879f9] to-[#c084fc] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#1a0b29] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(232,121,249,0.55)] active:translate-y-0.5"
                    >
                      {sceneIdx >= SCENES.length - 1
                        ? isBg
                          ? "Виж финала"
                          : isZh
                            ? "查看结局"
                            : "SEE THE ENDING"
                        : isBg
                          ? "Продължи"
                          : isZh
                            ? "继续"
                            : "NEXT"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {phase === "ending" && end ? (
            <div className="mt-6 flex flex-col items-center gap-4 text-center">
              {freshUnlock ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#fde68a]/50 bg-[#fde68a]/10 px-4 py-1.5 font-mono text-[0.6rem] font-bold tracking-[0.2em] text-[#fde68a] uppercase">
                  <Trophy className="size-3.5" />
                  {isBg ? "Нов финал!" : isZh ? "已解锁新结局！" : "NEW ENDING UNLOCKED!"}
                </span>
              ) : null}

              <span className="text-6xl">{end.emoji}</span>
              <h2
                className="font-display text-2xl font-bold tracking-wide"
                style={{ color: end.color }}
              >
                {end.title[lang]}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-5 font-mono text-[0.65rem] tracking-[0.15em] uppercase">
                <span className="inline-flex items-center gap-1.5 text-[#f9a8d4]">
                  <Heart className="size-4" fill="#f9a8d4" />{" "}
                  {isBg ? "Връзка" : isZh ? "友情" : "Bond"} {bond}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#7dd3fc]">
                  <Star className="size-4" fill="#7dd3fc" />{" "}
                  {isBg ? "Смелост" : isZh ? "勇气" : "Courage"} {courage}
                </span>
              </div>

              <p className="max-w-md font-serif text-base italic leading-relaxed text-foreground/90">
                {end.text[lang]}
              </p>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startRun}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#e879f9] to-[#c084fc] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#1a0b29] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(232,121,249,0.55)] active:translate-y-0.5"
                >
                  <RotateCcw className="size-4" />
                  {isBg ? "Играй отново" : isZh ? "再玩一次" : "PLAY AGAIN"}
                </button>
                <button
                  type="button"
                  onClick={backToTitle}
                  className="inline-flex items-center gap-2 rounded-full border border-[#e879f9]/40 bg-[#2a1240] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#fdb8e0] uppercase transition-all duration-200 hover:bg-[#e879f9]/15 active:translate-y-0.5"
                >
                  <Home className="size-4" />
                  {isBg ? "Заглавие" : isZh ? "标题画面" : "TITLE"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-[#e879f9]">{isBg ? "избор" : isZh ? "选择" : "choice"}</span> —{" "}
            {isBg ? "кова историята" : isZh ? "塑造故事" : "shapes the story"}
          </span>
          <span>
            <span className="text-[#e879f9]">{SCENES.length - 1}</span> —{" "}
            {isBg
              ? "разклонения преди финала"
              : isZh
                ? "最终结局前的分支"
                : "branch before the ending"}
          </span>
          <span>
            <span className="text-[#e879f9]">4</span> —{" "}
            {isBg ? "различни финала" : isZh ? "种不同结局" : "different endings"}
          </span>
        </div>
      </section>
    </main>
  );
}
