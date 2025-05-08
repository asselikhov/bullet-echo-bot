require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const startHandler = require('./handlers/start');
const registrationHandler = require('./handlers/registration');
const mainMenuHandler = require('./handlers/mainMenu');
const profileHandler = require('./handlers/profile');
const settingsHandler = require('./handlers/settings');
const heroesHandler = require('./handlers/heroes');
const User = require('./models/User');
const Hero = require('./models/Hero');
const heroTranslations = require('./constants/heroes');

const app = express();
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);

// Хранилище состояния редактирования (временное, для простоты)
const editingState = {};

// Функция форматирования даты и времени
const formatDateTime = (date, language) => {
  const pad = (num) => String(num).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return language === 'RU'
      ? `${day}.${month}.${year} ${hours}:${minutes}`
      : `${month}/${day}/${year} ${hours}:${minutes}`;
};

// Динамическое создание словаря heroNames на основе heroTranslations
const heroNames = {};
for (const [classId, classData] of Object.entries(heroTranslations)) {
  for (const [heroId, heroData] of Object.entries(classData.heroes)) {
    const nameRU = heroData.RU.toLowerCase();
    const nameEN = heroData.EN.toLowerCase();
    heroNames[nameRU] = { classId, heroId, nameRU: heroData.RU, nameEN: heroData.EN };
    heroNames[nameEN] = { classId, heroId, nameRU: heroData.RU, nameEN: heroData.EN };
  }
}
console.log('heroNames created with keys:', Object.keys(heroNames));

connectDB().then(async () => {
  try {
    await User.updateMany(
        { trophies: { $exists: false } },
        { $set: { trophies: 0, valorPath: 0, telegramUsername: null } }
    );
    await User.updateMany(
        { telegramUsername: { $exists: true, $ne: null, $not: /^@/ } },
        [{ $set: { telegramUsername: { $concat: ["@", "$telegramUsername"] } } }]
    );
    console.log('Database migration completed: Added trophies, valorPath, and updated telegramUsername with @ prefix.');
  } catch (error) {
    console.error('Error during database migration:', error);
  }
});

app.use(express.json());

// Эндпоинт для проверки состояния
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Обработка входящих обновлений от Telegram
app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => startHandler(bot, msg));

// Обработчик команды /info
bot.onText(/\/info\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  const requester = await User.findOne({ telegramId: msg.from.id.toString() });

  if (!requester) {
    bot.sendMessage(chatId, '🇷🇺 Пожалуйста, пройдите регистрацию в личном чате с ботом, чтобы использовать команды в группе.\n🇬🇧 Please complete registration in a private chat with the bot to use commands in the group.');
    return;
  }

  if (requester.registrationStep !== 'completed') {
    bot.sendMessage(chatId, '🇷🇺 Пожалуйста, пройдите регистрацию в личном чате с ботом, чтобы использовать команды в группе.\n🇬🇧 Please complete registration in a private chat with the bot to use commands in the group.');
    return;
  }

  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
    bot.sendMessage(chatId, requester.language === 'RU' ? 'Эта команда доступна только в группах.' : 'This command is only available in groups.');
    return;
  }

  try {
    let searchCriteria = [];
    const queryWithoutAt = query.replace(/^@/, '');
    if (query.startsWith('@')) {
      searchCriteria.push(
          { telegramUsername: { $regex: `^@${queryWithoutAt}$`, $options: 'i' } },
          { telegramId: queryWithoutAt }
      );
    } else {
      searchCriteria.push(
          { telegramUsername: { $regex: `^@${query}$`, $options: 'i' } },
          { nickname: query },
          { userId: query }
      );
    }

    const targetUser = await User.findOne({ $or: searchCriteria });

    if (!targetUser) {
      bot.sendMessage(chatId, requester.language === 'RU' ? 'Пользователь не найден.' : 'User not found.');
      return;
    }

    const heroes = await Hero.find({ userId: targetUser.telegramId });

    const bestHeroesByClass = {};
    for (const hero of heroes) {
      const classId = hero.classId;
      const heroMapping = Object.values(heroNames).find(h => h.classId === classId && h.heroId === hero.heroId);
      if (heroMapping) {
        if (!bestHeroesByClass[classId] || (hero.isPrimary && !bestHeroesByClass[classId].isPrimary) || (!bestHeroesByClass[classId].isPrimary && hero.strength > bestHeroesByClass[classId].strength)) {
          bestHeroesByClass[classId] = {
            ...hero.toObject(),
            nameRU: heroMapping.nameRU,
            nameEN: heroMapping.nameEN
          };
        }
      }
    }

    const language = requester.language || 'RU';
    const fields = language === 'RU'
        ? {
          'Telegram': targetUser.telegramUsername || `@${targetUser.telegramId}`,
          'Никнейм': targetUser.nickname,
          'ID игрока': targetUser.userId,
          'Трофеи': targetUser.trophies,
          'Путь доблести': targetUser.valorPath,
          'Синдикат': targetUser.syndicate,
          'Имя': targetUser.name,
          'Возраст': targetUser.age,
          'Пол': targetUser.gender,
          'Страна': targetUser.country,
          'Город': targetUser.city
        }
        : {
          'Telegram': targetUser.telegramUsername || `@${targetUser.telegramId}`,
          'Nickname': targetUser.nickname,
          'User ID': targetUser.userId,
          'Trophies': targetUser.trophies,
          'Valor Path': targetUser.valorPath,
          'Syndicate': targetUser.syndicate,
          'Name': targetUser.name,
          'Age': targetUser.age,
          'Gender': targetUser.gender,
          'Country': targetUser.country,
          'City': targetUser.city
        };

    let heroesText = '';
    if (Object.keys(bestHeroesByClass).length > 0) {
      heroesText += language === 'RU'
          ? `⭐️ Основы в каждом классе:\n➖➖➖➖➖➖➖➖➖➖➖\n`
          : `⭐️ Primary in Each Class:\n➖➖➖➖➖➖➖➖➖➖➖\n`;

      for (const [classId, hero] of Object.entries(bestHeroesByClass)) {
        const heroName = language === 'RU' ? hero.nameRU : hero.nameEN;
        const winPercentageFormatted = language === 'RU'
            ? hero.winPercentage.toFixed(2).replace('.', ',')
            : hero.winPercentage.toFixed(2);
        const updatedAt = formatDateTime(new Date(hero.updatedAt), language);
        heroesText += language === 'RU'
            ? `${heroName} ур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentageFormatted}%\n`
            : `${heroName} lvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentageFormatted}%\n`;
        heroesText += language === 'RU'
            ? `Битвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n`
            : `Battles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n`;
        heroesText += language === 'RU'
            ? `Обновлено: ${updatedAt}\n\n`
            : `Updated: ${updatedAt}\n\n`;
      }
      heroesText = heroesText.trim();
    }

    let profileText = language === 'RU' ? `📋 Профиль пользователя\n➖➖➖➖➖➖➖➖➖➖➖\n` : `📋 User Profile\n━━━━━━━━━━━━━━━\n`;
    let hasFields = false;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        profileText += `${key}: ${value || (language === 'RU' ? 'Не указано' : 'Not set')}\n`;
        hasFields = true;
      }
    }

    if (heroesText) {
      profileText += '\n' + heroesText;
    }

    if (hasFields || heroesText) {
      // Убрана лишняя строка с общей датой обновления
    } else {
      profileText = language === 'RU' ? '⚠️ Профиль пуст.' : '⚠️ Profile is empty.';
    }

    bot.sendMessage(chatId, profileText);
  } catch (error) {
    console.error('Error in /info handler:', error.stack);
    bot.sendMessage(chatId, requester.language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
});

// Обработчик команды /hero
bot.onText(/\/hero\s+(.+)\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userIdentifier = match[1].trim();
  const heroNameInput = match[2].trim().toLowerCase().replace(/\s+/g, ' ').normalize("NFKD");

  console.log(`Raw heroNameInput: "${match[2]}"`);
  console.log(`Processed heroNameInput: "${heroNameInput}"`);
  console.log(`heroNames contains искра: ${!!heroNames["искра"]}`);
  console.log(`heroNames keys: ${Object.keys(heroNames).join(", ")}`);

  const requester = await User.findOne({ telegramId: msg.from.id.toString() });

  if (!requester) {
    bot.sendMessage(chatId, '🇷🇺 Пожалуйста, пройдите регистрацию в личном чате с ботом, чтобы использовать команды в группе.\n🇬🇧 Please complete registration in a private chat with the bot to use commands in the group.');
    return;
  }

  if (requester.registrationStep !== 'completed') {
    bot.sendMessage(chatId, '🇷🇺 Пожалуйста, пройдите регистрацию в личном чате с ботом, чтобы использовать команды в группе.\n🇬🇧 Please complete registration in a private chat with the bot to use commands in the group.');
    return;
  }

  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
    bot.sendMessage(chatId, requester.language === 'RU' ? 'Эта команда доступна только в группах.' : 'This command is only available in groups.');
    return;
  }

  try {
    let searchCriteria = [];
    const queryWithoutAt = userIdentifier.replace(/^@/, '');
    if (userIdentifier.startsWith('@')) {
      searchCriteria.push(
          { telegramUsername: { $regex: `^@${queryWithoutAt}$`, $options: 'i' } },
          { telegramId: queryWithoutAt }
      );
    } else {
      searchCriteria.push(
          { telegramUsername: { $regex: `^@${userIdentifier}$`, $options: 'i' } },
          { nickname: userIdentifier },
          { userId: userIdentifier }
      );
    }

    const targetUser = await User.findOne({ $or: searchCriteria });
    console.log(`Target user found: ${targetUser ? targetUser.telegramId : 'not found'}`);

    if (!targetUser) {
      bot.sendMessage(chatId, requester.language === 'RU' ? 'Пользователь не найден.' : 'User not found.');
      return;
    }

    const heroMapping = heroNames[heroNameInput];
    if (!heroMapping) {
      console.log(`Hero mapping not found for input: "${heroNameInput}"`);
      bot.sendMessage(chatId, requester.language === 'RU' ? 'Герой не найден. Укажите правильное имя героя.' : 'Hero not found. Please specify a valid hero name.');
      return;
    }

    console.log(`Searching for hero with userId: ${targetUser.telegramId}, classId: ${heroMapping.classId}, heroId: ${heroMapping.heroId}`);

    const hero = await Hero.findOne({
      userId: targetUser.telegramId,
      classId: heroMapping.classId,
      heroId: heroMapping.heroId
    });

    if (!hero) {
      bot.sendMessage(chatId, requester.language === 'RU' ? `У пользователя ${targetUser.nickname} нет героя "${heroMapping.nameRU}".` : `User ${targetUser.nickname} does not have the hero "${heroMapping.nameEN}".`);
      return;
    }

    const language = requester.language || 'RU';
    const heroName = language === 'RU' ? heroMapping.nameRU : heroMapping.nameEN;

    const winPercentageFormatted = language === 'RU'
        ? hero.winPercentage.toFixed(2).replace('.', ',')
        : hero.winPercentage.toFixed(2);

    let heroText = language === 'RU'
        ? `🦸 Статистика героя\n➖➖➖➖➖➖➖➖➖➖➖\n`
        : `🦸 Hero Statistics\n➖➖➖➖➖➖➖➖➖➖➖\n`;
    heroText += language === 'RU'
        ? `${heroName} ур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentageFormatted}%\n`
        : `${heroName} lvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentageFormatted}%\n`;
    heroText += language === 'RU'
        ? `Битвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n`
        : `Battles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n`;
    const updatedAt = formatDateTime(new Date(hero.updatedAt), language);
    heroText += language === 'RU'
        ? `\nОбновлено: ${updatedAt}`
        : `\nUpdated: ${updatedAt}`;

    bot.sendMessage(chatId, heroText);
  } catch (error) {
    console.error('Error in /hero handler:', error.stack);
    bot.sendMessage(chatId, requester.language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  console.log(`Received message: "${msg.text}" in chat type: ${msg.chat.type}, from user: ${msg.from.id}`);

  // Проверка, находится ли пользователь в режиме редактирования (только в приватном чате)
  if (msg.chat.type === 'private' && editingState[userId]) {
    const { parameter, classId, heroId } = editingState[userId];
    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      bot.sendMessage(chatId, '🇷🇺 Пользователь не найден.\n🇬🇧 User not found.');
      delete editingState[userId];
      return;
    }

    const language = user.language || 'RU';
    const hero = await Hero.findOne({ userId, classId, heroId });
    if (!hero) {
      bot.sendMessage(chatId, language === 'RU' ? 'Герой не найден.' : 'Hero not found.');
      delete editingState[userId];
      return;
    }

    const value = parseInt(msg.text, 10);
    if (isNaN(value) || value < 0) {
      bot.sendMessage(chatId, language === 'RU' ? 'Пожалуйста, введите положительное число.' : 'Please enter a positive number.');
      return;
    }

    try {
      if (parameter === 'level') {
        hero.level = value;
      } else if (parameter === 'strength') {
        hero.strength = value;
      } else if (parameter === 'battlesPlayed') {
        hero.battlesPlayed = value;
      }

      hero.updatedAt = new Date();
      await hero.save();

      bot.sendMessage(chatId, language === 'RU' ? `✅ Параметр "${parameter}" обновлён!` : `✅ Parameter "${parameter}" updated!`);
      delete editingState[userId];

      // Вызываем heroesHandler с имитацией callback-запроса
      await heroesHandler(bot, msg, { data: `heroes_${classId}` });
    } catch (error) {
      console.error(`Error updating hero ${parameter}:`, error.stack);
      bot.sendMessage(chatId, language === 'RU' ? '❌ Произошла ошибка при обновлении.' : '❌ An error occurred while updating.');
      delete editingState[userId];
    }
    return;
  }

  if (msg.text === '/start') {
    console.log('Ignoring /start command (handled by specific handler)');
    return;
  }

  const user = await User.findOne({ telegramId: msg.from.id.toString() });

  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    console.log('Message received in group/supergroup');

    if (!user || user.registrationStep !== 'completed') {
      console.log(`User ${msg.from.id} is not registered or registration incomplete (step: ${user ? user.registrationStep : 'none'})`);
      if (msg.text && msg.text.startsWith('/')) {
        console.log(`Command detected: ${msg.text}, prompting for registration`);
        bot.sendMessage(chatId, '🇷🇺 Пожалуйста, выберите язык через кнопку / Please select a language using the button.');
      } else {
        console.log('Ignoring non-command message in group from unregistered user');
      }
      return;
    }

    console.log(`User ${msg.from.id} is registered, processing message`);

    const newUsername = msg.from.username ? `@${msg.from.username}` : null;
    if (newUsername && user.telegramUsername !== newUsername) {
      user.telegramUsername = newUsername;
      await user.save();
      console.log(`Updated telegramUsername for user ${user.telegramId}: ${user.telegramUsername}`);
    }

    const menuCommandsRU = ['ЛК', 'Рейтинг', 'Настройки', 'Герои', 'Синдикаты', 'Поиск'];
    const menuCommandsEN = ['Profile', 'Rating', 'Settings', 'Heroes', 'Syndicates', 'Search'];
    const menuCommands = user?.language === 'RU' ? menuCommandsRU : menuCommandsEN;

    if (msg.text && msg.text.startsWith('/')) {
      console.log(`Command detected for registered user: ${msg.text}, ignoring here (handled by specific handlers)`);
      return;
    } else if (menuCommands.includes(msg.text)) {
      console.log(`Menu command detected: ${msg.text}`);
      if (msg.text === (user.language === 'RU' ? 'ЛК' : 'Profile')) {
        await mainMenuHandler(bot, msg, { data: 'menu_profile' });
      } else if (msg.text === (user.language === 'RU' ? 'Рейтинг' : 'Rating')) {
        bot.sendMessage(chatId, user.language === 'RU' ? '📊 Рейтинг в разработке.' : '📊 Rating is under development.');
      } else if (msg.text === (user.language === 'RU' ? 'Настройки' : 'Settings')) {
        await settingsHandler(bot, msg, { data: 'settings_language' });
      } else if (msg.text === (user.language === 'RU' ? 'Герои' : 'Heroes')) {
        await mainMenuHandler(bot, msg, { data: 'menu_heroes' });
      } else if (msg.text === (user.language === 'RU' ? 'Синдикаты' : 'Syndicates')) {
        bot.sendMessage(chatId, user.language === 'RU' ? '🏰 Синдикаты в разработке.' : '🏰 Syndicates are under development.');
      } else if (msg.text === (user.language === 'RU' ? 'Поиск' : 'Search')) {
        bot.sendMessage(chatId, user.language === 'RU' ? '🔍 Поиск в разработке.' : '🔍 Search is under development.');
      }
    } else {
      console.log(`Ignoring non-command/non-menu message in group from registered user: ${msg.text}`);
      return;
    }
  } else {
    console.log('Message received in private chat');

    if (!user) {
      console.log(`User ${msg.from.id} not found in private chat, proceeding to registration`);
      await registrationHandler(bot, msg);
      return;
    }

    const newUsername = msg.from.username ? `@${msg.from.username}` : null;
    if (newUsername && user.telegramUsername !== newUsername) {
      user.telegramUsername = newUsername;
      await user.save();
      console.log(`Updated telegramUsername for user ${user.telegramId}: ${user.telegramUsername}`);
    }

    if (user.registrationStep === 'completed') {
      console.log(`User ${msg.from.id} registration completed, processing menu commands`);
      const menuCommandsRU = ['ЛК', 'Рейтинг', 'Настройки', 'Герои', 'Синдикаты', 'Поиск'];
      const menuCommandsEN = ['Profile', 'Rating', 'Settings', 'Heroes', 'Syndicates', 'Search'];
      const menuCommands = user?.language === 'RU' ? menuCommandsRU : menuCommandsEN;

      if (menuCommands.includes(msg.text)) {
        console.log(`Menu command detected in private chat: ${msg.text}`);
        if (msg.text === (user.language === 'RU' ? 'ЛК' : 'Profile')) {
          await mainMenuHandler(bot, msg, { data: 'menu_profile' });
        } else if (msg.text === (user.language === 'RU' ? 'Рейтинг' : 'Rating')) {
          bot.sendMessage(chatId, user.language === 'RU' ? '📊 Рейтинг в разработке.' : '📊 Rating is under development.');
        } else if (msg.text === (user.language === 'RU' ? 'Настройки' : 'Settings')) {
          await settingsHandler(bot, msg, { data: 'settings_language' });
        } else if (msg.text === (user.language === 'RU' ? 'Герои' : 'Heroes')) {
          await mainMenuHandler(bot, msg, { data: 'menu_heroes' });
        } else if (msg.text === (user.language === 'RU' ? 'Синдикаты' : 'Syndicates')) {
          bot.sendMessage(chatId, user.language === 'RU' ? '🏰 Синдикаты в разработке.' : '🏰 Syndicates are under development.');
        } else if (msg.text === (user.language === 'RU' ? 'Поиск' : 'Search')) {
          bot.sendMessage(chatId, user.language === 'RU' ? '🔍 Поиск в разработке.' : '🔍 Search is under development.');
        }
      } else if (!msg.text || msg.text.trim() === '') {
        // Показываем полное меню при пустом или первом сообщении
        await mainMenuHandler(bot, msg);
      } else {
        console.log(`Ignoring non-menu message in private chat from registered user: ${msg.text}`);
        return;
      }
    } else {
      console.log(`User ${msg.from.id} in registration process, proceeding to registration handler`);
      await registrationHandler(bot, msg);
    }
  }
});

bot.on('callback_query', async (query) => {
  const data = query.data;
  const msg = query.message;
  const chatId = msg.chat.id;
  const userId = query.from.id.toString();

  console.log(`Received callback_query: data="${data}", chatId=${chatId}, userId=${userId}, messageId=${msg.message_id}`);

  try {
    if (data.startsWith('menu_')) {
      console.log(`Processing menu callback: ${data}`);
      await mainMenuHandler(bot, msg, query);
    } else if (data.startsWith('profile_')) {
      console.log(`Processing profile callback: ${data}`);
      await profileHandler(bot, msg, query);
    } else if (data.startsWith('settings_') || data === 'language_RU' || data === 'language_EN') {
      console.log(`Processing settings callback: ${data}`);
      await settingsHandler(bot, msg, query);
    } else if (data.startsWith('heroes_')) {
      console.log(`Processing heroes callback: ${data}`);
      await heroesHandler(bot, msg, query);
    } else if (data.startsWith('set_primary_')) {
      console.log(`Processing set_primary callback: data="${data}"`);
      const cleanedData = data.trim().replace(/\s+/g, '');
      const parts = cleanedData.split('_');

      console.log(`Cleaned data: "${cleanedData}", parts: ${JSON.stringify(parts)}`);

      if (parts.length !== 5 || parts[0] !== 'set' || parts[1] !== 'primary') {
        console.error(`Invalid callback data format: "${cleanedData}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный формат данных. Попробуйте снова.\n🇬🇧 Invalid data format. Please try again.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка формата', show_alert: true });
        return;
      }

      const callbackUserId = parts[2];
      const classId = parts[3];
      const heroId = parts[4];

      if (!/^\d+$/.test(callbackUserId)) {
        console.error(`Invalid userId format: "${callbackUserId}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный идентификатор пользователя.\n🇬🇧 Invalid user ID.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка ID', show_alert: true });
        return;
      }

      if (callbackUserId !== userId) {
        console.log(`Unauthorized attempt: callbackUserId=${callbackUserId}, userId=${userId}`);
        bot.sendMessage(chatId, '🇷🇺 У вас нет прав для этого действия.\n🇬🇧 You are not authorized for this action.');
        bot.answerCallbackQuery(query.id, { text: 'Нет прав', show_alert: true });
        return;
      }

      if (!heroTranslations[classId]) {
        console.log(`Invalid classId: "${classId}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный класс героя.\n🇬🇧 Invalid hero class.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка класса', show_alert: true });
        return;
      }

      if (!heroTranslations[classId].heroes[heroId]) {
        console.log(`Invalid heroId: "${heroId}" for class "${classId}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный герой.\n🇬🇧 Invalid hero.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка героя', show_alert: true });
        return;
      }

      const hero = await Hero.findOne({ userId: callbackUserId, classId, heroId });
      if (!hero) {
        console.log(`Hero not found: userId=${callbackUserId}, classId=${classId}, heroId=${heroId}`);
        bot.sendMessage(chatId, '🇷🇺 Герой не найден.\n🇬🇧 Hero not found.');
        bot.answerCallbackQuery(query.id, { text: 'Герой не найден', show_alert: true });
        return;
      }

      const user = await User.findOne({ telegramId: callbackUserId });
      if (!user) {
        console.log(`User not found: telegramId=${callbackUserId}`);
        bot.sendMessage(chatId, '🇷🇺 Пользователь не найден.\n🇬🇧 User not found.');
        bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден', show_alert: true });
        return;
      }

      await Hero.findOneAndUpdate(
          { userId: callbackUserId, classId, heroId },
          { isPrimary: true },
          { new: true }
      );
      await Hero.updateMany(
          { userId: callbackUserId, classId, heroId: { $ne: heroId } },
          { isPrimary: false }
      );

      const language = user.language || 'RU';
      bot.sendMessage(chatId, language === 'RU' ? '✅ Основной герой установлен!' : '✅ Primary hero set!');
      await heroesHandler(bot, msg, query);
    } else if (data.startsWith('edit_')) {
      console.log(`Processing edit callback: ${data}`);
      const parts = data.split('_');
      if (parts.length !== 4 || parts[0] !== 'edit') {
        console.error(`Invalid edit callback data format: "${data}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный формат данных. Попробуйте снова.\n🇬🇧 Invalid data format. Please try again.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка формата', show_alert: true });
        return;
      }

      const parameter = parts[1];
      const classId = parts[2];
      const heroId = parts[3];

      if (!['level', 'strength', 'battlesPlayed'].includes(parameter)) {
        console.error(`Invalid parameter: "${parameter}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный параметр для редактирования.\n🇬🇧 Invalid parameter for editing.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка параметра', show_alert: true });
        return;
      }

      if (!heroTranslations[classId] || !heroTranslations[classId].heroes[heroId]) {
        console.log(`Invalid classId or heroId: classId="${classId}", heroId="${heroId}"`);
        bot.sendMessage(chatId, '🇷🇺 Неверный герой или класс.\n🇬🇧 Invalid hero or class.');
        bot.answerCallbackQuery(query.id, { text: 'Ошибка героя', show_alert: true });
        return;
      }

      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        console.log(`Hero not found: userId=${userId}, classId=${classId}, heroId=${heroId}`);
        bot.sendMessage(chatId, '🇷🇺 Герой не найден.\n🇬🇧 Hero not found.');
        bot.answerCallbackQuery(query.id, { text: 'Герой не найден', show_alert: true });
        return;
      }

      const user = await User.findOne({ telegramId: userId });
      if (!user) {
        console.log(`User not found: telegramId=${userId}`);
        bot.sendMessage(chatId, '🇷🇺 Пользователь не найден.\n🇬🇧 User not found.');
        bot.answerCallbackQuery(query.id, { text: 'Пользователь не найден', show_alert: true });
        return;
      }

      // Сохраняем состояние редактирования
      editingState[userId] = { parameter, classId, heroId };
      const language = user.language || 'RU';
      const promptText = language === 'RU'
          ? {
            level: 'Введите новый уровень героя:',
            strength: 'Введите новую силу героя:',
            battlesPlayed: 'Введите новое количество битв:'
          }
          : {
            level: 'Enter the new hero level:',
            strength: 'Enter the new hero strength:',
            battlesPlayed: 'Enter the new number of battles:'
          };
      bot.sendMessage(chatId, promptText[parameter]);
      bot.answerCallbackQuery(query.id, { text: language === 'RU' ? 'Ожидаю ввод...' : 'Waiting for input...', show_alert: false });
    } else {
      console.log(`Unknown callback data: ${data}`);
      bot.sendMessage(chatId, '🇷🇺 Неизвестная команда.\n🇬🇧 Unknown command.');
      bot.answerCallbackQuery(query.id, { text: 'Неизвестная команда', show_alert: true });
    }
    bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Callback query error:', error.stack);
    bot.sendMessage(chatId, '🇷🇺 Произошла ошибка.\n🇬🇧 An error occurred.');
    bot.answerCallbackQuery(query.id, { text: 'Ошибка обработки', show_alert: true });
  }
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.stack);
});

// Запуск сервера на порту, указанном Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server is running on port ${PORT}`);
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${process.env.TELEGRAM_TOKEN}`;
  bot.setWebHook(webhookUrl)
      .then(() => console.log(`Webhook set to: ${webhookUrl}`))
      .catch((error) => console.error('Error setting webhook:', error));
});

console.log('Bot is initializing...');