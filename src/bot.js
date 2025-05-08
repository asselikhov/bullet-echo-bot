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

// Обработка входящих обновлений
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
    // Автоматически завершаем регистрацию для существующих пользователей
    requester.registrationStep = 'completed';
    if (!requester.language) requester.language = 'RU';
    await requester.save();
    console.log(`User ${requester.telegramId} registration completed automatically`);
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
    // Автоматически завершаем регистрацию для существующих пользователей
    requester.registrationStep = 'completed';
    if (!requester.language) requester.language = 'RU';
    await requester.save();
    console.log(`User ${requester.telegramId} registration completed automatically`);
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
        bot.sendMessage(chatId, '🇷🇺 Пожалуйста, пройдите регистрацию в личном чате с ботом.\n🇬🇧 Please complete registration in a private chat with the bot.');
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

    // Автоматически завершаем регистрацию для существующих пользователей
    if (user.registrationStep !== 'completed') {
      user.registrationStep = 'completed';
      if (!user.language) user.language = 'RU';
      if (!user.trophies) user.trophies = 0;
      if (!user.valorPath) user.valorPath = 0;
      await user.save();
      console.log(`User ${user.telegramId} registration completed automatically`);
    }

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
      await mainMenuHandler(bot, msg);
    } else {
      console.log(`Ignoring non-menu message in private chat: ${msg.text}`);
      await registrationHandler(bot, msg); // Обрабатываем только не-menu сообщения как часть регистрации
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
    } else if (data.startsWith('settings_')) {
      console.log(`Processing settings callback: ${data}`);
      await settingsHandler(bot, msg, query);
    } else if (data.startsWith('heroes_') || data.startsWith('edit_') || data.startsWith('set_primary_')) {
      console.log(`Processing heroes callback: ${data}`);
      await heroesHandler(bot, msg, query);
    } else if (data === 'language_RU' || data === 'language_EN') {
      console.log(`Processing language selection callback: ${data}`);
      await registrationHandler(bot, msg, query);
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