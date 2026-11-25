/**
 * Topic icons: names of MaterialCommunityIcons (@expo/vector-icons). A topic with an icon shows it in its color
 * instead of the color dot. `POPULAR` is a curated set with Russian and English keywords (the picker's default and the
 * first search results); search also covers every name in the icon font.
 */

export interface PopularIcon {
  name: string;
  /** Lowercase search words, Russian and English. */
  words: string;
}

const icon = (name: string, words: string): PopularIcon => ({ name, words: `${words} ${name}`.toLowerCase() });

export const POPULAR: readonly PopularIcon[] = [
  icon('book-open-variant', 'книга чтение читать страницы book read'),
  icon('book-open-page-variant', 'книга чтение страница book'),
  icon('bookshelf', 'книги полка библиотека library'),
  icon('book-education', 'учебник обучение учёба textbook'),
  icon('cards', 'карточки карты флэшкарты anki flashcards'),
  icon('cards-outline', 'карточки карты флэшкарты flashcards'),
  icon('card-text', 'карточка слова cards'),
  icon('flash', 'флэш быстро карточки flash'),
  icon('repeat', 'повторение повтор review'),
  icon('translate', 'язык перевод слова иностранный language'),
  icon('alphabetical-variant', 'алфавит буквы язык letters'),
  icon('alphabet-latin', 'латиница алфавит английский испанский latin'),
  icon('chat-outline', 'разговор общение диалог speaking'),
  icon('account-voice', 'речь произношение говорить speaking voice'),
  icon('school', 'учёба школа курс университет study'),
  icon('school-outline', 'учёба школа курс study'),
  icon('human-male-board', 'урок преподаватель лекция teacher'),
  icon('presentation', 'лекция презентация доклад lecture'),
  icon('play-box', 'видео лекция курс урок video'),
  icon('youtube', 'видео ютуб лекция youtube'),
  icon('video', 'видео запись лекция video'),
  icon('headphones', 'наушники аудио подкаст аудиокнига слушать audio'),
  icon('podcast', 'подкаст слушать аудио podcast'),
  icon('microphone', 'микрофон голос пение запись voice'),
  icon('music', 'музыка ноты music'),
  icon('guitar-acoustic', 'гитара музыка guitar'),
  icon('piano', 'пианино фортепиано музыка piano'),
  icon('violin', 'скрипка музыка violin'),
  icon('dumbbell', 'спорт гантели тренировка зал workout gym'),
  icon('weight-lifter', 'спорт штанга тренировка зал gym'),
  icon('run', 'бег пробежка спорт running'),
  icon('walk', 'ходьба прогулка шаги walk'),
  icon('hiking', 'поход прогулка hiking'),
  icon('bike', 'велосипед спорт bike'),
  icon('swim', 'плавание бассейн swim'),
  icon('yoga', 'йога растяжка yoga stretch'),
  icon('meditation', 'медитация дыхание спокойствие meditation'),
  icon('tennis', 'теннис спорт tennis'),
  icon('soccer', 'футбол спорт football'),
  icon('basketball', 'баскетбол спорт basketball'),
  icon('code-tags', 'код программирование разработка code'),
  icon('laptop', 'ноутбук компьютер работа laptop'),
  icon('console', 'терминал консоль код terminal'),
  icon('language-javascript', 'javascript js код программирование'),
  icon('language-typescript', 'typescript ts код программирование'),
  icon('language-python', 'python питон код программирование'),
  icon('math-integral', 'математика интеграл анализ math'),
  icon('calculator-variant', 'математика калькулятор задачи math'),
  icon('function-variant', 'функция математика math'),
  icon('sigma', 'сумма математика статистика math'),
  icon('flask', 'химия наука опыт science chemistry'),
  icon('atom', 'физика атом наука physics'),
  icon('dna', 'биология днк наука biology'),
  icon('earth', 'география мир земля geography'),
  icon('map', 'карта география история map'),
  icon('brain', 'мозг память логика brain'),
  icon('lightbulb-on-outline', 'идея мысль idea'),
  icon('pencil', 'письмо писать карандаш write'),
  icon('pen', 'ручка письмо писать pen'),
  icon('notebook-outline', 'тетрадь конспект заметки notes'),
  icon('note-text', 'заметки текст конспект notes'),
  icon('file-document', 'документ статья текст document'),
  icon('newspaper-variant-outline', 'новости статьи газета news'),
  icon('format-list-checks', 'задачи список дела tasks'),
  icon('checkbox-marked-outline', 'задача сделано галочка done task'),
  icon('keyboard', 'клавиатура печать набор keyboard'),
  icon('draw', 'рисование рисунок скетч draw'),
  icon('palette', 'рисование живопись краски art'),
  icon('brush', 'кисть рисование живопись brush'),
  icon('camera', 'фото фотография camera'),
  icon('chess-knight', 'шахматы задачи chess'),
  icon('puzzle', 'пазл головоломка задачи puzzle'),
  icon('gamepad-variant', 'игра игры gamepad'),
  icon('glasses', 'очки чтение учёба glasses'),
  icon('clock-outline', 'время часы clock'),
  icon('timer-outline', 'таймер помодоро время timer'),
  icon('target', 'цель мишень target'),
  icon('trophy', 'кубок победа достижение trophy'),
  icon('star', 'звезда избранное star'),
  icon('heart', 'сердце здоровье любовь heart'),
  icon('leaf', 'лист природа растения leaf'),
  icon('sprout', 'росток растения сад рост sprout'),
  icon('food-apple', 'еда яблоко питание food'),
  icon('chef-hat', 'готовка кулинария еда cooking'),
  icon('water', 'вода пить water'),
  icon('cup', 'чашка кофе чай cup'),
  icon('sleep', 'сон спать sleep'),
  icon('pill', 'таблетка лекарство здоровье pill'),
  icon('tooth', 'зубы здоровье tooth'),
  icon('home-outline', 'дом дела home'),
  icon('broom', 'уборка дом чистота cleaning'),
  icon('cash', 'деньги финансы бюджет money'),
  icon('finance', 'финансы инвестиции график finance'),
  icon('chart-line', 'график статистика рост chart'),
  icon('briefcase', 'работа портфель карьера work'),
  icon('account-group', 'люди группа общение people'),
  icon('rocket-launch', 'ракета проект старт rocket'),
  icon('flag-variant', 'флаг цель finish flag'),
  icon('dog', 'собака питомец dog'),
  icon('cat', 'кошка питомец cat'),
];

/**
 * Icons for a search query. Empty → the popular set. Otherwise: popular icons whose words contain the query first
 * (Russian works), then every other icon name, names starting with the query before names containing it, and
 * filled icons before their `-outline` variants.
 */
export function searchIcons(query: string, allNames: readonly string[], limit = 120): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR.map((p) => p.name).slice(0, limit);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name) || out.length >= limit) return;
    seen.add(name);
    out.push(name);
  };
  for (const p of POPULAR) if (p.words.includes(q)) add(p.name);
  // Russian queries only match the curated words.
  const words = q.replace(/\s+/g, '-');
  const score = (name: string) => (name.startsWith(words) ? 0 : 1) + (name.endsWith('-outline') ? 0.5 : 0);
  allNames
    .filter((n) => n.includes(words))
    .sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))
    .forEach(add);
  return out;
}

/** The icon name if the font has it, else null (stored icons from a newer font version, typos). */
export const validIcon = (name: string | null | undefined, allNames: ReadonlySet<string>): string | null =>
  name && allNames.has(name) ? name : null;
