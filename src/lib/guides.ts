// Game guides (Ali's change list 2, ADC-LOG-764 item 4): how to score and the rules of the four
// games, written by us in our own words for Diwaniyatna, in Arabic and English. Nothing here is
// copied from another app, book or site. House rules differ from table to table, so every guide
// says where to agree first instead of pretending there is one true rule.
import type { Game, RulePack } from './api';
import type { Lang } from './i18n';

export interface GuidePart {
  h: string;
  p?: string;
  list?: string[];
}
export interface Guide {
  score: GuidePart[];
  rules: GuidePart[];
}

export const GUIDE_GAMES: Game[] = ['kout', 'baloot', 'tarneeb', 'trix'];

/** The guide a score sheet links to. */
export function gameOfPack(pack: RulePack): Game {
  if (pack.startsWith('kout')) return 'kout';
  if (pack.startsWith('tarneeb')) return 'tarneeb';
  return pack as Game;
}

const en: Record<Game, Guide> = {
  kout: {
    rules: [
      {
        h: 'Teams and seats',
        p: 'Kout is a Kuwaiti trick game for two teams: six players (three against three) or four players (two against two). Seats alternate between the teams, so the players on either side of you are opponents.',
      },
      {
        h: 'The cards',
        p: 'In the six-player game everyone gets nine cards from a pack that includes jokers. The four-player game uses a shorter pack. Tables differ on the exact pack and on how the jokers may be played, so settle both before the first deal.',
      },
      {
        h: 'Bidding',
        list: [
          'Starting next to the dealer, each player passes (taf) or bids how many tricks his team will take, always higher than the bid before.',
          'The lowest bid is five (bab); the highest is every trick (bawan).',
          'If everyone passes, the dealer must play for five.',
        ],
      },
      {
        h: 'Hukm and play',
        list: [
          'The winning bidder names the trump suit (hukm) and leads the first trick.',
          'Follow the suit that was led if you can. If you can’t, you may trump or throw any card.',
          'The highest trump takes the trick; with no trump in it, the highest card of the suit led takes it.',
          'The jokers rank above the trumps.',
        ],
      },
    ],
    score: [
      {
        h: 'What a round is worth',
        list: [
          'Only the bid is scored. Make it and your team scores the number you bid: 5, 6, 7 or 8.',
          'Bawan (every trick) made scores 36 in most diwaniyas.',
          'Miss your bid and the other team scores double it: 10 for a failed five, 14 for a failed seven.',
          'A forced five (everyone passed to the dealer) is worth five to whichever team wins it, never doubled.',
        ],
      },
      {
        h: 'Winning the game',
        p: 'The usual target is 101, or 51 for a shorter game. Many tables also end it at once when a team reaches 51 while the other still has nothing, or when bawan is made in the first round. Agree the target before you start.',
      },
      {
        h: 'On the Diwaniyatna score sheet',
        p: 'After each round, type what each team earned that round: for a made seven, 7 and 0; for a failed seven, 0 and 14. The running totals show how close each team is to the target. When a team gets there, finish the game and it goes to the league.',
      },
    ],
  },
  baloot: {
    rules: [
      {
        h: 'Teams and cards',
        p: 'Four players in two teams, partners sitting opposite. Baloot uses 32 cards, the 7 up to the Ace of each suit, and everyone ends up with eight.',
      },
      {
        h: 'Sun or Hokm',
        list: [
          'After the first cards are dealt, one card is turned face up and the players in turn may buy it or pass.',
          'Sun means no trump. Hokm means the buyer’s team plays with a trump suit.',
          'The buyer takes the face-up card, and the rest of the deal brings everyone to eight cards.',
        ],
      },
      {
        h: 'Play',
        list: [
          'Follow the suit that was led if you can. In Hokm, if you can’t follow, you must trump when you are able (tables differ on over-trumping).',
          'Plain suits rank Ace, 10, King, Queen, Jack, 9, 8, 7.',
          'The trump suit in Hokm ranks Jack, 9, Ace, 10, King, Queen, 8, 7.',
        ],
      },
    ],
    score: [
      {
        h: 'Card points',
        list: [
          'Ace 11, Ten 10, King 4, Queen 3, Jack 2. Nines, eights and sevens are worth nothing, except in the trump suit.',
          'In the Hokm trump suit the Jack is worth 20 and the Nine 14.',
          'Whoever takes the last trick adds 10.',
        ],
      },
      {
        h: 'Turning card points into game points',
        list: [
          'A Sun round has 130 card points in it and is worth 26 game points.',
          'A Hokm round has 162 card points in it and is worth 16 game points.',
          'Each team’s share is its card points turned the same way, rounded as your table agrees.',
        ],
      },
      {
        h: 'Declarations and the buyer’s risk',
        list: [
          'Runs of three or more cards in a suit and four of a kind are declared for bonus points; holding the King and Queen of trump in Hokm (baloot) adds 2 game points. Values vary a little, so agree them first.',
          'The buying team must take more than half of the round. If it doesn’t, the other team takes the whole round, declarations included.',
        ],
      },
      {
        h: 'On the Diwaniyatna score sheet',
        p: 'Enter each team’s game points for the round, declarations included. The first team to 152 wins: finish the game and it goes to the league.',
      },
    ],
  },
  tarneeb: {
    rules: [
      {
        h: 'Teams and cards',
        p: 'Four players in two teams, partners sitting opposite, with the full 52-card pack: thirteen cards each, Ace high.',
      },
      {
        h: 'Bidding (Tarneeb 31 and 61)',
        list: [
          'Each player in turn passes or bids how many of the 13 tricks his team will take, from 7 up to 13, higher than the bid before.',
          'The highest bidder names the trump suit (the tarneeb) and leads.',
        ],
      },
      {
        h: 'Play',
        list: [
          'Follow the suit that was led if you can; if not, trump or throw any card.',
          'The highest trump takes the trick; otherwise the highest card of the suit led.',
        ],
      },
      {
        h: 'Tarneeb 41',
        list: [
          'Each player bids for himself, from 2 tricks up, and hearts are always trump.',
          'If the four bids add up to less than 11, the cards are dealt again.',
          'Partners still help each other, but every player keeps his own score.',
        ],
      },
    ],
    score: [
      {
        h: 'Tarneeb 31 and 61',
        list: [
          'If the bidding team takes at least its bid, it scores the tricks it took.',
          'If it falls short, it loses the amount it bid, and in most diwaniyas the other team scores the tricks it took.',
          'The first team to 31 (or 61 for a long game) wins.',
        ],
      },
      {
        h: 'Tarneeb 41',
        list: [
          'Make your bid and it is added to your score; miss it and it is taken away. Many tables count bigger bids double, so agree that first.',
          'A team wins when one partner reaches 41 while the other partner’s score is above zero.',
        ],
      },
      {
        h: 'On the Diwaniyatna score sheet',
        p: 'The sheet keeps one total per team. For 31 and 61, enter each team’s score for the round. For 41, enter each team’s two players added together, and keep an eye on each player’s own total at the table. Finish when a team wins and it goes to the league.',
      },
    ],
  },
  trix: {
    rules: [
      {
        h: 'Players and cards',
        p: 'Four players, each playing for himself (some diwaniyas play in pairs), with the full 52-card pack, thirteen cards each.',
      },
      {
        h: 'Kingdoms and contracts',
        list: [
          'A game has four kingdoms, one for each player. In his kingdom the king picks the order of five contracts and each is played once.',
          'The five contracts: the King of Hearts, the Queens, the Diamonds, the Collections (every trick counts) and Trix.',
        ],
      },
      {
        h: 'Play',
        list: [
          'In the four trick contracts there is no trump: follow the suit that was led if you can, and try not to take the cards the contract punishes.',
          'Trix is a laying-out game: starting from the Jacks, players build each suit up and down on the table. The first to get rid of all his cards finishes first.',
        ],
      },
    ],
    score: [
      {
        h: 'What each contract costs or pays',
        list: [
          'King of Hearts: minus 75 for whoever takes it.',
          'Queens: minus 25 for each queen you take.',
          'Diamonds: minus 10 for each diamond you take.',
          'Collections: minus 15 for each trick you take.',
          'Trix: plus 200, 150, 100 and 50 by the order players finish.',
        ],
      },
      {
        h: 'A quick check',
        p: 'Without doubling, each kingdom adds up to zero across the four players (minus 500 in the trick contracts, plus 500 in Trix). If your kingdom doesn’t, someone mistyped.',
      },
      {
        h: 'Doubling and winning',
        p: 'Many tables let a player double the King of Hearts or a Queen: it then costs twice as much, and the player who doubled collects when someone else takes it. Agree it first. After all four kingdoms the highest total wins.',
      },
      {
        h: 'On the Diwaniyatna score sheet',
        p: 'Trix has one column per player. Enter every contract as one round, so a kingdom is five rounds and the game twenty. Finish after the fourth kingdom and it goes to the league.',
      },
    ],
  },
};

const ar: Record<Game, Guide> = {
  kout: {
    rules: [
      {
        h: 'الفرق والجلسة',
        p: 'الكوت لعبة لمّات كويتية بين فريقين: ستة لاعبين (ثلاثة ضد ثلاثة) أو أربعة (اثنان ضد اثنين). الجلسة بالتناوب بين الفريقين، فاللذان بجانبك من الخصم.',
      },
      {
        h: 'الورق',
        p: 'في لعبة الستة يأخذ كل لاعب تسع ورقات من ورق فيه جوكرية. لعبة الأربعة تُلعب بورق أقل. الديوانيات تختلف في الورق بالضبط وفي متى يُلعب الجوكر، فاتفقوا عليهما قبل أول توزيع.',
      },
      {
        h: 'الطلب',
        list: [
          'يبدأ من بجانب الموزّع: كل لاعب إما يطوف (طاف) أو يطلب عدد اللمّات التي سيأخذها فريقه، وكل طلب أعلى من الذي قبله.',
          'أقل طلب خمسة (باب)، وأعلاه كل اللمّات (بوان).',
          'إذا طاف الجميع يلزم الموزّع أن يلعب على خمسة.',
        ],
      },
      {
        h: 'الحكم واللعب',
        list: [
          'صاحب أعلى طلب يختار الحكم (الورقة الرابحة) ويبدأ أول لمّة.',
          'تنزل من نفس الورقة المطلوبة إن كانت معك، وإن لم تكن تقطع بالحكم أو ترمي أي ورقة.',
          'أعلى حكم يأخذ اللمّة، وإن لم يكن فيها حكم فأعلى ورقة من الورقة المطلوبة.',
          'الجوكرية أعلى من الحكم.',
        ],
      },
    ],
    score: [
      {
        h: 'كم تساوي الجولة',
        list: [
          'لا يُحسب إلا الطلب. إن أخذ الفريق طلبه سجّل رقم الطلب: ٥ أو ٦ أو ٧ أو ٨.',
          'البوان إذا تمّ يُحسب ٣٦ في أغلب الديوانيات.',
          'إن لم يأخذ الفريق طلبه يسجّل الفريق الآخر ضعف الطلب: ١٠ لخمسة لم تتم، و١٤ لسبعة لم تتم.',
          'الخمسة الملزومة (طاف الجميع على الموزّع) تُحسب خمسة لمن يكسبها، ولا تتضاعف.',
        ],
      },
      {
        h: 'الفوز باللعبة',
        p: 'الهدف المعتاد ١٠١، أو ٥١ للعبة أقصر. وكثير من الديوانيات تنهيها فوراً إذا وصل فريق إلى ٥١ والآخر صفر، أو إذا تمّ بوان في أول جولة. اتفقوا على الهدف قبل البداية.',
      },
      {
        h: 'في ورقة التسجيل في ديوانيتنا',
        p: 'بعد كل جولة اكتب ما كسبه كل فريق فيها: سبعة تمّت تعني ٧ و٠، وسبعة لم تتم تعني ٠ و١٤. المجموع أولاً بأول يبيّن من اقترب من الهدف، وحين يصل فريق أنهِ اللعبة فتدخل الدوري.',
      },
    ],
  },
  baloot: {
    rules: [
      {
        h: 'الفرق والورق',
        p: 'أربعة لاعبين في فريقين، وكل شريكين متقابلان. البلوت يُلعب بـ٣٢ ورقة، من السبعة إلى الإكَه في كل نوع، وكل لاعب ينتهي معه ثماني ورقات.',
      },
      {
        h: 'صن أو حكم',
        list: [
          'بعد توزيع أول الورق تُكشف ورقة، واللاعبون بالدور إما يشترونها أو يمرّرون.',
          'الصن بلا حكم، والحكم يعني أن فريق المشتري يلعب بنوع رابح.',
          'المشتري يأخذ الورقة المكشوفة، ويُكمَّل التوزيع حتى يصير مع كل لاعب ثماني ورقات.',
        ],
      },
      {
        h: 'اللعب',
        list: [
          'تنزل من النوع المطلوب إن كان معك. وفي الحكم إن لم يكن معك تقطع بالحكم إن قدرت (والديوانيات تختلف في التكبير على حكم سابق).',
          'ترتيب الأنواع العادية: الإكَه، العشرة، الشايب، البنت، الولد، التسعة، الثمانية، السبعة.',
          'ترتيب نوع الحكم: الولد، التسعة، الإكَه، العشرة، الشايب، البنت، الثمانية، السبعة.',
        ],
      },
    ],
    score: [
      {
        h: 'نقاط الورق',
        list: [
          'الإكَه ١١، العشرة ١٠، الشايب ٤، البنت ٣، الولد ٢. التسعة والثمانية والسبعة بلا نقاط إلا في الحكم.',
          'في نوع الحكم يساوي الولد ٢٠ والتسعة ١٤.',
          'من يأخذ آخر لمّة يضيف ١٠.',
        ],
      },
      {
        h: 'من نقاط الورق إلى نقاط اللعبة',
        list: [
          'جولة الصن فيها ١٣٠ نقطة ورق وتساوي ٢٦ نقطة لعبة.',
          'جولة الحكم فيها ١٦٢ نقطة ورق وتساوي ١٦ نقطة لعبة.',
          'نصيب كل فريق هو نقاط ورقه محوّلة بالطريقة نفسها، مع تقريب تتفقون عليه.',
        ],
      },
      {
        h: 'المشاريع ومخاطرة المشتري',
        list: [
          'السرى (ثلاث ورقات متتالية أو أكثر من نوع واحد) والأربع المتشابهة تُعلن لنقاط إضافية، والبلوت (الشايب والبنت من الحكم معاً) يضيف نقطتين. القيم تختلف قليلاً، فاتفقوا عليها أولاً.',
          'على فريق المشتري أن يأخذ أكثر من نصف الجولة، وإن لم يفعل أخذ الفريق الآخر الجولة كلها مع المشاريع.',
        ],
      },
      {
        h: 'في ورقة التسجيل في ديوانيتنا',
        p: 'اكتب نقاط اللعبة لكل فريق في الجولة مع المشاريع. أول فريق يصل إلى ١٥٢ يفوز: أنهِ اللعبة فتدخل الدوري.',
      },
    ],
  },
  tarneeb: {
    rules: [
      {
        h: 'الفرق والورق',
        p: 'أربعة لاعبين في فريقين، وكل شريكين متقابلان، بالورق الكامل ٥٢ ورقة: ثلاث عشرة ورقة لكل لاعب، والإكَه أعلى ورقة.',
      },
      {
        h: 'الطلب (طرنيب ٣١ و٦١)',
        list: [
          'كل لاعب بالدور يمرّر أو يطلب عدد اللمّات التي سيأخذها فريقه من ١٣، من ٧ إلى ١٣، وكل طلب أعلى من الذي قبله.',
          'صاحب أعلى طلب يختار نوع الطرنيب (الحكم) ويبدأ اللعب.',
        ],
      },
      {
        h: 'اللعب',
        list: [
          'تنزل من النوع المطلوب إن كان معك، وإن لم يكن تقطع بالطرنيب أو ترمي أي ورقة.',
          'أعلى طرنيب يأخذ اللمّة، وإلا فأعلى ورقة من النوع المطلوب.',
        ],
      },
      {
        h: 'طرنيب ٤١',
        list: [
          'كل لاعب يطلب لنفسه، من لمّتين فأكثر، والطرنيب دائماً الكُبّة (القلوب).',
          'إذا كان مجموع الطلبات الأربعة أقل من ١١ يُعاد التوزيع.',
          'الشريكان يساعدان بعضهما، لكن لكل لاعب حسابه.',
        ],
      },
    ],
    score: [
      {
        h: 'طرنيب ٣١ و٦١',
        list: [
          'إذا أخذ فريق الطلب طلبه على الأقل سجّل عدد اللمّات التي أخذها.',
          'وإن نقص خسر قيمة طلبه، وفي أغلب الديوانيات يسجّل الفريق الآخر لمّاته.',
          'أول فريق يصل إلى ٣١ (أو ٦١ للعبة الطويلة) يفوز.',
        ],
      },
      {
        h: 'طرنيب ٤١',
        list: [
          'إذا أخذت طلبك يُضاف إلى حسابك، وإن نقصت يُخصم منه. كثير من الديوانيات تضاعف الطلبات الكبيرة، فاتفقوا على ذلك أولاً.',
          'يفوز الفريق حين يصل أحد الشريكين إلى ٤١ وحساب شريكه فوق الصفر.',
        ],
      },
      {
        h: 'في ورقة التسجيل في ديوانيتنا',
        p: 'الورقة تحفظ مجموعاً واحداً لكل فريق. في ٣١ و٦١ اكتب نتيجة كل فريق في الجولة. وفي ٤١ اكتب مجموع لاعبي كل فريق معاً، وانتبهوا لحساب كل لاعب على الطاولة. حين يفوز فريق أنهِ اللعبة فتدخل الدوري.',
      },
    ],
  },
  trix: {
    rules: [
      {
        h: 'اللاعبون والورق',
        p: 'أربعة لاعبين، كل واحد لنفسه (وبعض الديوانيات تلعبها شراكة)، بالورق الكامل ٥٢ ورقة: ثلاث عشرة ورقة لكل لاعب.',
      },
      {
        h: 'الممالك والعقود',
        list: [
          'اللعبة أربع ممالك، مملكة لكل لاعب. في مملكته يختار الملك ترتيب العقود الخمسة، وكل عقد يُلعب مرة واحدة.',
          'العقود الخمسة: شايب الكُبّة، والبنات، والديناري، واللطوش (كل لمّة تُحسب)، والتركس.',
        ],
      },
      {
        h: 'اللعب',
        list: [
          'في عقود اللمّات الأربعة لا حكم: تنزل من النوع المطلوب إن كان معك، وتحاول ألا تأخذ ما يعاقب عليه العقد.',
          'التركس لعبة رصّ: من الأولاد يبني اللاعبون كل نوع صعوداً ونزولاً على الطاولة، وأول من يُنهي ورقه يخرج أولاً.',
        ],
      },
    ],
    score: [
      {
        h: 'كم يكلّف كل عقد أو يربح',
        list: [
          'شايب الكُبّة: ناقص ٧٥ لمن يأخذه.',
          'البنات: ناقص ٢٥ عن كل بنت تأخذها.',
          'الديناري: ناقص ١٠ عن كل ديناري تأخذه.',
          'اللطوش: ناقص ١٥ عن كل لمّة تأخذها.',
          'التركس: زائد ٢٠٠ و١٥٠ و١٠٠ و٥٠ حسب ترتيب الخروج.',
        ],
      },
      {
        h: 'تأكّد سريع',
        p: 'بلا دبل، مجموع كل مملكة بين اللاعبين الأربعة صفر (ناقص ٥٠٠ في عقود اللمّات، وزائد ٥٠٠ في التركس). إن لم يكن صفراً فهناك خطأ في الكتابة.',
      },
      {
        h: 'الدبل والفوز',
        p: 'كثير من الديوانيات تسمح بدبل شايب الكُبّة أو البنت: يصير عقابها ضعفاً، ومن دبّل يأخذ القيمة إن أخذها غيره. اتفقوا عليه أولاً. بعد الممالك الأربع يفوز صاحب أعلى مجموع.',
      },
      {
        h: 'في ورقة التسجيل في ديوانيتنا',
        p: 'للتركس عمود لكل لاعب. اكتب كل عقد كجولة، فالمملكة خمس جولات واللعبة عشرون. أنهِ اللعبة بعد المملكة الرابعة فتدخل الدوري.',
      },
    ],
  },
};

export const GUIDES: Record<Lang, Record<Game, Guide>> = { ar, en };
