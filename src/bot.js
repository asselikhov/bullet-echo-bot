require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const connectDB = require('./db');
const User = require('./models/User');
const Hero = require('./models/Hero');
const Party = require('./models/Party');
const heroTranslations = require('./constants/heroes');
const { formatDateTime, formatProfileText, formatHeroesText, handleError } = require('./utils/helpers');
const { getMainReplyKeyboard, getMainInlineKeyboard, getProfileInlineKeyboard, getHeroesInlineKeyboard } = require('./utils/keyboards');
const handlers = {
  start: require('./handlers/start'),
  registration: require('./handlers/registration'),
  mainMenu: require('./handlers/mainMenu'),
  profile: require('./handlers/profile'),
  settings: require('./handlers/settings'),
  heroes: require('./handlers/heroes'),
  search: require('./handlers/search')
};

// Подавление предупреждения Mongoose
mongoose.set('strictQuery', true);

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Инициализация глобальных состояний
global.editingState = {};
global.editingProfileState = {};
global.searchState = {};

// Константы
const TARGET_GROUP_ID = '-1002364266898';
const MAX_MESSAGE_LENGTH = 1000;
const STATE_TIMEOUT = 5 * 60 * 1000;

// Хранилище для отслеживания сообщений и callback-запросов
const lastSentText = {};
const lastCallbackTime = {};
const lastCallbackMessage = {};
const callbackProcessing = {};

// Создание heroNames
const heroNames = Object.entries(heroTranslations).reduce((acc, [classId, { heroes }]) => {
  Object.entries(heroes).forEach(([heroId, { RU, EN }]) => {
    const nameRU = RU?.toLowerCase();
    const nameEN = EN?.toLowerCase();
    if (nameRU && nameEN) {
      acc[nameRU] = acc[nameEN] = { classId, heroId, nameRU: RU, nameEN: EN };
    }
  });
  return acc;
}, {});
console.log('heroNames created with keys:', Object.keys(heroNames));

// Middleware для проверки пользователя
const withUser = async (ctx, next) => {
  const userId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId: userId }).lean();
  console.log(`User found: ${user ? `telegramId=${user.telegramId}, registrationStep=${user.registrationStep}, language=${user.language}` : 'not found'}`);

  if (!user) {
    console.log(`User ${userId} not found, starting registration`);
    return handlers.registration(bot, ctx);
  }

  const newUsername = ctx.from.username ? `@${ctx.from.username}` : null;
  if (newUsername && user.telegramUsername !== newUsername) {
    await User.updateOne({ telegramId: userId }, { telegramUsername: newUsername });
    console.log(`Updated telegramUsername for user ${userId}: ${newUsername}`);
  }

  ctx.user = user;
  ctx.language = user.language || 'RU';
  return next();
};

// Middleware для ограничения чата (только личный чат)
const restrictChat = (ctx, isPrivate = true, message) => {
  if (!ctx.chat || (isPrivate && ctx.chat.type !== 'private')) {
    return ctx.reply(message || (isPrivate
        ? '🇷🇺 Команда доступна только в личном чате.\n🇬🇧 Command is only available in a private chat.'
        : '🇷🇺 Команды работают только в группе @GroupName.\n🇬🇧 Commands work only in the group @GroupName.'));
  }
  return false;
};

// Middleware для команд, доступных в личном чате или группе
const restrictChatOrGroup = (ctx, message) => {
  if (!ctx.chat || (ctx.chat.type !== 'private' && ctx.chat.id.toString() !== TARGET_GROUP_ID)) {
    return ctx.reply(message || '🇷🇺 Команда доступна только в личном чате или группе @GroupName.\n🇬🇧 Command is only available in a private chat or the group @GroupName.');
  }
  return false;
};

// Утилита для очистки состояний
const clearStates = (userId, timeout = true) => {
  if (timeout) {
    setTimeout(() => {
      ['editingState', 'editingProfileState', 'searchState'].forEach(state => {
        if (global[state][userId]) {
          console.log(`Timeout: Cleared ${state} for userId=${userId}`);
          delete global[state][userId];
        }
      });
    }, STATE_TIMEOUT);
  } else {
    ['editingState', 'editingProfileState', 'searchState'].forEach(state => delete global[state][userId]);
  }
};

// Утилита для отправки ответа
const sendResponse = async (ctx, response, messageId, defaultMarkup) => {
  try {
    const { text, reply_markup: markup, parse_mode = 'HTML', method = 'sendMessage' } = response || {};
    if (!text) {
      console.warn(`No response text for userId=${ctx.from.id}, message_id: ${messageId}, response: ${JSON.stringify(response, null, 2)}`);
      return ctx.reply(ctx.language === 'RU' ? 'Пожалуйста, используйте команды меню.' : 'Please use menu commands.', {
        reply_markup: defaultMarkup,
        parse_mode: 'HTML'
      });
    }

    console.log(`Response reply_markup before processing:`, JSON.stringify(markup, null, 2));

    let finalMarkup = {};
    if (markup) {
      finalMarkup.inline_keyboard = Array.isArray(markup.inline_keyboard) ? markup.inline_keyboard : [];
      finalMarkup.keyboard = Array.isArray(markup.keyboard) ? markup.keyboard : [];
      finalMarkup.remove_keyboard = !!markup.remove_keyboard;
      finalMarkup.resize_keyboard = markup.resize_keyboard !== undefined ? markup.resize_keyboard : true;
    } else if (defaultMarkup) {
      finalMarkup.inline_keyboard = Array.isArray(defaultMarkup.inline_keyboard) ? defaultMarkup.inline_keyboard : [];
      finalMarkup.keyboard = Array.isArray(defaultMarkup.keyboard) ? defaultMarkup.keyboard : [];
      finalMarkup.remove_keyboard = !!defaultMarkup.remove_keyboard;
      finalMarkup.resize_keyboard = defaultMarkup.resize_keyboard !== undefined ? defaultMarkup.resize_keyboard : true;
    } else {
      finalMarkup = { remove_keyboard: true };
    }

    console.log(`Final reply_markup for message_id: ${messageId}:`, JSON.stringify(finalMarkup, null, 2));

    if (method === 'sendMessage') {
      const result = await ctx.reply(text, { reply_markup: finalMarkup, parse_mode });
      console.log(`Sent new message for user ${ctx.from.id}, message_id: ${result.message_id}`);
      return result;
    } else {
      try {
        const result = await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, { reply_markup: finalMarkup, parse_mode });
        console.log(`EditMessage result for user ${ctx.from.id}, message_id: ${messageId}`);
        return result;
      } catch (editError) {
        console.warn(`Failed to edit message, sending new:`, editError.message);
        const result = await ctx.reply(text, { reply_markup: finalMarkup, parse_mode });
        console.log(`Sent new message for user ${ctx.from.id}, message_id: ${result.message_id}`);
        return result;
      }
    }
  } catch (error) {
    console.error(`Failed to send response for userId=${ctx.from.id}, message_id: ${messageId}:`, error.message);
    return ctx.reply(ctx.language === 'RU' ? 'Произошла сетевая ошибка. Попробуйте позже.' : 'A network error occurred. Try again later.', {
      reply_markup: defaultMarkup,
      parse_mode: 'HTML'
    });
  }
};

// Подключение к MongoDB и миграция
connectDB().then(async () => {
  await User.updateMany(
      { trophies: { $exists: false } },
      { $set: { trophies: 0, valorPath: null, telegramUsername: null } }
  );
  await User.updateMany(
      { telegramUsername: { $exists: true, $ne: null, $not: /^@/ } },
      [{ $set: { telegramUsername: { $concat: ['@', '$telegramUsername'] } } }]
  );
  console.log('Database migration completed: Added trophies, valorPath, updated telegramUsername with @ prefix.');
});

// Настройка Express
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.url}`, JSON.stringify(req.body, null, 2));
  next();
});
app.use(bot.webhookCallback(`/bot${process.env.TELEGRAM_TOKEN}`));
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

// Обработка ошибок Telegram API
bot.catch((err, ctx) => {
  console.error(`Telegram API error for userId=${ctx.from?.id}:`, err.stack);
  ctx.reply('🇷🇺 Произошла ошибка. Попробуйте позже.\n🇬🇧 An error occurred. Try again later.');
});

// Команда /start
bot.command('start', async (ctx) => {
  console.log(`Processing /start for user: ${ctx.from.id}, chat: ${ctx.chat.id}, type: ${ctx.chat.type}, message_id: ${ctx.message.message_id}`);
  if (restrictChat(ctx)) return;
  const response = await handlers.start(bot, ctx);
  return sendResponse(ctx, response, ctx.message.message_id);
});

// Команда /info
bot.command('info', async (ctx) => {
  if (restrictChatOrGroup(ctx)) return;
  const query = ctx.message.text.replace('/info', '').trim();
  if (!query) return ctx.reply('🇷🇺 Укажите параметр для поиска.\n🇬🇧 Specify a search parameter.');

  await withUser(ctx, async () => {
    if (ctx.user.registrationStep !== 'completed') {
      return ctx.reply('🇷🇺 Пожалуйста, завершите регистрацию в личном чате с ботом.\n🇬🇧 Please complete registration in a private chat with the bot.');
    }
    const targetUser = await User.findOne({
      $or: query.startsWith('@')
          ? [{ telegramUsername: { $regex: `^${query}$`, $options: 'i' } }, { telegramId: query.replace(/^@/, '') }]
          : [{ telegramUsername: { $regex: `^@${query}$`, $options: 'i' } }, { nickname: query }, { userId: query }]
    }).lean();
    if (!targetUser) return ctx.reply(ctx.language === 'RU' ? 'Пользователь не найден.' : 'User not found.');
    return ctx.reply(formatProfileText(targetUser, ctx.language), { parse_mode: 'HTML' });
  });
});

// Команда /main
bot.command('main', async (ctx) => {
  if (restrictChatOrGroup(ctx)) return;
  const query = ctx.message.text.replace('/main', '').trim();
  if (!query) return ctx.reply('🇷🇺 Укажите параметр для поиска.\n🇬🇧 Specify a search parameter.');

  await withUser(ctx, async () => {
    if (ctx.user.registrationStep !== 'completed') {
      return ctx.reply('🇷🇺 Пожалуйста, завершите регистрацию в личном чате с ботом.\n🇬🇧 Please complete registration in a private chat with the bot.');
    }
    const targetUser = await User.findOne({
      $or: query.startsWith('@')
          ? [{ telegramUsername: { $regex: `^${query}$`, $options: 'i' } }, { telegramId: query.replace(/^@/, '') }]
          : [{ telegramUsername: { $regex: `^@${query}$`, $options: 'i' } }, { nickname: query }, { userId: query }]
    }).lean();
    if (!targetUser) return ctx.reply(ctx.language === 'RU' ? 'Пользователь не найден.' : 'User not found.');

    const heroes = await Hero.find({ userId: targetUser.telegramId }).lean();
    const bestHeroesByClass = heroes.reduce((acc, hero) => {
      const classId = hero.classId;
      const heroMapping = Object.values(heroNames).find(h => h.classId === classId && h.heroId === hero.heroId);
      if (heroMapping && (!acc[classId] || (hero.isPrimary && !acc[classId].isPrimary) || (!acc[classId].isPrimary && hero.strength > acc[classId].strength))) {
        acc[classId] = { ...hero, nameRU: heroMapping.nameRU, nameEN: heroMapping.nameEN };
      }
      return acc;
    }, {});

    let heroesText = ctx.language === 'RU'
        ? `⭐️ Основы в каждом классе:\n➖➖➖➖➖➖➖➖➖➖➖\n`
        : `⭐️ Primary in Each Class:\n➖➖➖➖➖➖➖➖➖➖➖\n`;
    for (const hero of Object.values(bestHeroesByClass)) {
      const heroName = ctx.language === 'RU' ? hero.nameRU : hero.nameEN;
      const winPercentage = ctx.language === 'RU' ? hero.winPercentage.toFixed(2).replace('.', ',') : hero.winPercentage.toFixed(2);
      const updatedAt = formatDateTime(new Date(hero.updatedAt), ctx.language);
      heroesText += ctx.language === 'RU'
          ? `<b>${heroName}</b>\nур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%\nБитвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\nОбновлено: ${updatedAt}\n\n`
          : `<b>${heroName}</b>\nlvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%\nBattles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\nUpdated: ${updatedAt}\n\n`;
    }
    return ctx.reply(heroesText.trim() || (ctx.language === 'RU' ? '⚠️ У пользователя нет героев.' : '⚠️ User has no heroes.'), { parse_mode: 'HTML' });
  });
});

// Команда /hero
bot.command('hero', async (ctx) => {
  if (restrictChatOrGroup(ctx)) return;
  const args = ctx.message.text.replace('/hero', '').trim().split(/\s+/);
  if (args.length < 2) return ctx.reply('🇷🇺 Укажите идентификатор пользователя и имя героя.\n🇬🇧 Specify user identifier and hero name.');

  await withUser(ctx, async () => {
    if (ctx.user.registrationStep !== 'completed') {
      return ctx.reply('🇷🇺 Пожалуйста, завершите регистрацию в личном чате с ботом.\n🇬🇧 Please complete registration in a private chat with the bot.');
    }
    const [userIdentifier, ...heroNameParts] = args;
    const heroNameInput = heroNameParts.join(' ').toLowerCase().replace(/\s+/g, ' ').normalize('NFKD');
    console.log(`Processing /hero: userIdentifier="${userIdentifier}", heroNameInput="${heroNameInput}"`);

    const targetUser = await User.findOne({
      $or: userIdentifier.startsWith('@')
          ? [{ telegramUsername: { $regex: `^${userIdentifier}$`, $options: 'i' } }, { telegramId: userIdentifier.replace(/^@/, '') }]
          : [{ telegramUsername: { $regex: `^@${userIdentifier}$`, $options: 'i' } }, { nickname: userIdentifier }, { userId: userIdentifier }]
    }).lean();
    if (!targetUser) return ctx.reply(ctx.language === 'RU' ? 'Пользователь не найден.' : 'User not found.');

    const heroMapping = heroNames[heroNameInput];
    if (!heroMapping) return ctx.reply(ctx.language === 'RU' ? 'Герой не найден. Укажите правильное имя героя.' : 'Hero not found. Please specify a valid hero name.');

    const hero = await Hero.findOne({ userId: targetUser.telegramId, classId: heroMapping.classId, heroId: heroMapping.heroId }).lean();
    if (!hero) return ctx.reply(ctx.language === 'RU' ? `У пользователя ${targetUser.nickname} нет героя "${heroMapping.nameRU}".` : `User ${targetUser.nickname} does not have the hero "${heroMapping.nameEN}".`);

    const heroName = ctx.language === 'RU' ? heroMapping.nameRU : heroMapping.nameEN;
    const winPercentage = ctx.language === 'RU' ? hero.winPercentage.toFixed(2).replace('.', ',') : hero.winPercentage.toFixed(2);
    const updatedAt = formatDateTime(new Date(hero.updatedAt), ctx.language);
    const heroText = ctx.language === 'RU'
        ? `🦸 <b>${heroName}</b>\n➖➖➖➖➖➖➖➖➖➖➖\nур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%\nБитвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\nОбновлено: ${updatedAt}`
        : `🦸 <b>${heroName}</b>\n➖➖➖➖➖➖➖➖➖➖➖\nlvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%\nBattles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\nUpdated: ${updatedAt}`;
    return ctx.reply(heroText, { parse_mode: 'HTML' });
  });
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id.toString();
  const messageText = ctx.message.text;
  const messageId = ctx.message.message_id;
  const replyToMessage = ctx.message.reply_to_message;

  if (!messageText || messageText.length > MAX_MESSAGE_LENGTH) {
    return ctx.reply('🇷🇺 Сообщение слишком длинное или пустое.\n🇬🇧 Message is too long or empty.');
  }
  console.log(`Received message: "${messageText}", length: ${messageText.length}, char codes: ${[...messageText].map(c => c.charCodeAt(0)).join(',')} in chat type: ${ctx.chat.type}, from user: ${userId}, chat: ${chatId}, message_id: ${messageId}`);

  // Обработка заявок на пати в группе
  if (chatId === TARGET_GROUP_ID && replyToMessage) {
    const applyMatch = messageText.match(/^(пати|party)\s+(.+)/i);
    if (!applyMatch) {
      console.log(`Ignoring non-party command in group: userId=${userId}, text=${messageText}, message_id=${messageId}`);
      return; // Игнорируем все сообщения, не соответствующие формату пати/party
    }

    await withUser(ctx, async () => {
      await handlers.search(bot, ctx, messageText, ctx.user);
    });
    return;
  }

  // Обработка команд в группе (только /info, /main, /hero)
  if (ctx.chat.type !== 'private') {
    console.log(`Ignoring non-private chat message: userId=${userId}, text=${messageText}, message_id=${messageId}`);
    return;
  }

  await withUser(ctx, async () => {
    if (ctx.user.registrationStep !== 'completed') {
      // Защита от повторного вызова
      if (ctx._registrationProcessed) {
        console.log(`Skipping duplicate registration processing for userId=${userId}, message_id=${messageId}`);
        return;
      }
      ctx._registrationProcessed = true;

      const response = await handlers.registration(bot, ctx) || {};
      console.log(`Registration response for step ${ctx.user.registrationStep}:`, JSON.stringify(response, null, 2));

      // Обновляем пользователя после обработки регистрации
      const updatedUser = await User.findOne({ telegramId: userId }).lean();
      ctx.user = updatedUser;
      ctx.language = updatedUser.language || 'RU';

      // Формируем reply_markup
      let finalMarkup = {};
      if (response.reply_markup) {
        if (response.reply_markup.inline_keyboard) {
          finalMarkup.inline_keyboard = response.reply_markup.inline_keyboard;
        }
        if (response.reply_markup.keyboard) {
          finalMarkup.keyboard = response.reply_markup.keyboard;
        }
        if (response.reply_markup.remove_keyboard) {
          finalMarkup.remove_keyboard = true;
        }
        finalMarkup.resize_keyboard = response.reply_markup.resize_keyboard !== undefined ? response.reply_markup.resize_keyboard : true;
      } else if (updatedUser.registrationStep === 'completed') {
        console.log(`Registration completed for userId=${userId}, adding main menu`);
        finalMarkup = {
          keyboard: getMainReplyKeyboard(ctx.language).keyboard,
          inline_keyboard: getMainInlineKeyboard(ctx.language),
          resize_keyboard: true
        };
      } else {
        console.warn(`No inline_keyboard in response for step ${ctx.user.registrationStep}, using default`);
        finalMarkup = { remove_keyboard: true };
      }

      await sendResponse(ctx, response, messageId, finalMarkup);
      delete ctx._registrationProcessed;
      return;
    }

    // Обработка редактирования героев
    if (global.editingState[userId]) {
      const { parameter, classId, heroId } = global.editingState[userId];
      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        clearStates(userId, false);
        return ctx.reply(ctx.language === 'RU' ? 'Герой не найден.' : 'Hero not found.');
      }
      const value = parameter === 'winPercentage'
          ? parseFloat(messageText.replace(',', '.'))
          : parseInt(messageText, 10);
      if (isNaN(value) || value < 0 || (parameter === 'winPercentage' && value > 100)) {
        return ctx.reply(ctx.language === 'RU' ? (parameter === 'winPercentage' ? 'Введите число от 0 до 100.' : 'Пожалуйста, введите положительное число.') : (parameter === 'winPercentage' ? 'Enter a number between 0 and 100.' : 'Please enter a positive number.'));
      }
      hero[parameter] = value;
      hero.updatedAt = new Date();
      await hero.save();
      clearStates(userId, false);
      const response = await handlers.heroes(bot, ctx, { data: `heroes_class_${classId}` }, ctx.user);
      response.text = ctx.language === 'RU' ? `✅ Параметр "${parameter}" обновлён!\n${response.text}` : `✅ Parameter "${parameter}" updated!\n${response.text}`;
      return sendResponse(ctx, response, messageId, { inline_keyboard: getHeroesInlineKeyboard(ctx.language, `heroes_class_${classId}`) });
    }

    // Обработка редактирования профиля
    if (global.editingProfileState[userId]) {
      console.log(`Delegating profile edit to profileHandler: userId=${userId}, field=${global.editingProfileState[userId].field}, text=${messageText}`);
      const response = await handlers.profile(bot, ctx, { data: '' }, ctx.user);
      return sendResponse(ctx, response, messageId, response.reply_markup);
    }

    // Обработка команд меню
    const commandCallbacks = {
      'ЛК': 'menu_profile', 'Profile': 'menu_profile',
      'Рейтинг': 'menu_rating', 'Rating': 'menu_rating',
      'Настройки': 'settings_language', 'Settings': 'settings_language',
      'Герои': 'menu_heroes', 'Heroes': 'menu_heroes',
      'Синдикаты': 'menu_syndicates', 'Syndicates': 'menu_syndicates',
      'Поиск': 'menu_search', 'Search': 'menu_search'
    };
    console.log(`Checking if "${messageText}" is a menu command. Available commands:`, Object.keys(commandCallbacks));

    if (commandCallbacks[messageText]) {
      clearStates(userId, false);
      const callbackData = commandCallbacks[messageText];
      const response = callbackData === 'menu_search' ? await handlers.search(bot, ctx, callbackData, ctx.user)
          : callbackData.startsWith('menu_') ? await handlers.mainMenu(bot, ctx, { data: callbackData }, ctx.user)
              : await handlers.settings(bot, ctx, { data: callbackData }, ctx.user);

      let defaultMarkup = {};
      if (callbackData === 'menu_heroes') {
        defaultMarkup = { inline_keyboard: getHeroesInlineKeyboard(ctx.language, 'menu_heroes'), resize_keyboard: true };
      } else if (callbackData === 'menu_profile') {
        defaultMarkup = { inline_keyboard: getProfileInlineKeyboard(ctx.language, 'menu_profile'), resize_keyboard: true };
      } else if (callbackData === 'settings_language') {
        defaultMarkup = { inline_keyboard: getMainInlineKeyboard(ctx.language, 'settings_language'), resize_keyboard: true };
      } else {
        defaultMarkup = {
          keyboard: getMainReplyKeyboard(ctx.language).keyboard,
          inline_keyboard: getMainInlineKeyboard(ctx.language),
          resize_keyboard: true
        };
      }

      return sendResponse(ctx, response, messageId, defaultMarkup);
    }

    // Обработка поиска
    if (global.searchState[userId]) {
      const { searchType } = global.searchState[userId];
      const searchValue = messageText.trim();
      if (!searchValue) return ctx.reply(ctx.language === 'RU' ? 'Пожалуйста, введите значение для поиска.' : 'Please enter a value for search.');
      const response = await handlers.search(bot, ctx, `search_execute_${searchType}_${encodeURIComponent(searchValue)}_1`, ctx.user);
      return sendResponse(ctx, response, messageId, { inline_keyboard: getMainInlineKeyboard(ctx.language) });
    }

    // Неизвестное сообщение
    console.log(`Non-menu message from registered user: ${messageText}`);
    return ctx.reply(ctx.language === 'RU' ? 'Пожалуйста, используйте команды меню.' : 'Please use menu commands.', {
      reply_markup: {
        keyboard: getMainReplyKeyboard(ctx.language).keyboard,
        inline_keyboard: getMainInlineKeyboard(ctx.language),
        resize_keyboard: true
      },
      parse_mode: 'HTML'
    });
  });
});

// Обработка callback-запросов
bot.action(/.+/, async (ctx) => {
  const data = ctx.callbackQuery.data;
  const messageId = ctx.callbackQuery.message?.message_id;
  const userId = ctx.from.id.toString();
  const chatId = ctx.callbackQuery.message?.chat.id;
  const isPrivate = ctx.callbackQuery.message?.chat.type === 'private';

  console.log(`Received callback_query: data="${data}", userId=${userId}, chat: ${chatId}, isPrivate: ${isPrivate}, message_id: ${messageId}`);

  // Защита от спама
  const callbackKey = `${userId}:${data}:${messageId}`;
  const now = Date.now();
  if (lastCallbackTime[callbackKey] && (now - lastCallbackTime[callbackKey]) < 1000) {
    console.log(`Ignoring spam callback from userId=${userId}, data=${data}`);
    return ctx.answerCbQuery();
  }
  lastCallbackTime[callbackKey] = now;

  if (callbackProcessing[userId]) {
    console.log(`Ignoring callback for userId=${userId}, data=${data} due to ongoing processing`);
    return ctx.answerCbQuery();
  }
  callbackProcessing[userId] = true;

  if (lastCallbackMessage[userId] && lastCallbackMessage[userId].messageId === messageId && lastCallbackMessage[userId].data !== data) {
    console.warn(`Multiple callbacks for message_id=${messageId}, userId=${userId}, previous_data=${lastCallbackMessage[userId].data}, current_data=${data}`);
  }
  lastCallbackMessage[userId] = { messageId, data };

  if (!isPrivate) {
    await ctx.reply('🇷🇺 Меню и настройки доступны только в личном чате.\n🇬🇧 Menu and settings are only available in a private chat.');
    delete callbackProcessing[userId];
    return ctx.answerCbQuery();
  }

  await withUser(ctx, async () => {
    if (ctx.user.registrationStep !== 'completed' && !['language_', 'gender_', 'skip_'].some(prefix => data.startsWith(prefix))) {
      console.log(`Callback query from unregistered user: userId=${userId}, step=${ctx.user.registrationStep}`);
      await ctx.reply(ctx.language === 'RU' ? 'Пожалуйста, завершите регистрацию.' : 'Please complete registration.', { reply_markup: { remove_keyboard: true } });
      delete callbackProcessing[userId];
      return ctx.answerCbQuery();
    }

    if (['menu_search', 'search_', 'settings_'].some(prefix => data === prefix || data.startsWith(prefix))) {
      clearStates(userId, false);
    }

    const callbackHandlers = {
      menu_search: handlers.search,
      profile_: handlers.profile,
      settings_: handlers.settings,
      heroes_: handlers.heroes,
      set_primary_: handlers.heroes,
      add_hero_: handlers.heroes,
      menu_: handlers.mainMenu,
      language_: handlers.settings,
      gender_: handlers.registration,
      skip_: handlers.registration,
      search_: handlers.search,
      global_search_type_: handlers.search,
      party_: handlers.search,
      delete_syndicate: handlers.profile
    };

    let response;
    if (['language_', 'gender_', 'skip_'].some(prefix => data.startsWith(prefix)) && ctx.user.registrationStep !== 'completed') {
      console.log(`Processing selection during registration: ${data}`);
      response = await handlers.registration(bot, ctx, { data }, ctx.user);
    } else if (data.startsWith('edit_')) {
      const [, field, classId, heroId] = data.match(/^edit_([^_]+)(?:_([^_]+)_(.+))?$/);
      response = classId && heroId
          ? await handlers.heroes(bot, ctx, { data }, ctx.user)
          : await handlers.profile(bot, ctx, { data }, ctx.user);
    } else {
      const handlerKey = Object.keys(callbackHandlers).find(key => data === key || data.startsWith(key));
      if (handlerKey) {
        console.log(`Processing callback with handler for: ${handlerKey}, data: ${data}`);
        response = await callbackHandlers[handlerKey](bot, ctx, { data }, ctx.user);
      } else {
        console.warn(`Unknown callback: ${data}`);
        response = {
          text: ctx.language === 'RU' ? 'Неизвестная команда.' : 'Unknown command.',
          reply_markup: { inline_keyboard: getMainInlineKeyboard(ctx.language) }
        };
      }
    }

    // Формируем defaultMarkup
    const defaultMarkup = ctx.user.registrationStep === 'completed'
        ? (data.startsWith('heroes_') || data === 'menu_heroes' ? { inline_keyboard: getHeroesInlineKeyboard(ctx.language, 'menu_heroes'), resize_keyboard: true }
            : (data.startsWith('profile_') || data === 'menu_profile' || data === 'delete_syndicate') ? { inline_keyboard: getProfileInlineKeyboard(ctx.language, 'menu_profile'), resize_keyboard: true }
                : data.startsWith('settings_') || data.startsWith('language_') ? { inline_keyboard: getMainInlineKeyboard(ctx.language, 'settings_language'), resize_keyboard: true }
                    : {
                      keyboard: getMainReplyKeyboard(ctx.language).keyboard,
                      inline_keyboard: getMainInlineKeyboard(ctx.language),
                      resize_keyboard: true
                    })
        : { inline_keyboard: response.reply_markup?.inline_keyboard || [] };

    await sendResponse(ctx, response, messageId, defaultMarkup);
    delete callbackProcessing[userId];
    return ctx.answerCbQuery();
  });
});

// Автоматическая установка вебхука
const setWebhook = async () => {
  const externalUrl = process.env.RENDER_EXTERNAL_URL || 'https://bullet-echo-bot.onrender.com';
  const webhookUrl = `${externalUrl}/bot${process.env.TELEGRAM_TOKEN}`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await response.json();
    console.log(`Webhook set: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error(`Failed to set webhook: ${error.message}`);
  }
};
setWebhook();

// Запуск сервера
const PORT = process.env.PORT || 10000; // Используем порт Render по умолчанию
app.listen(PORT, () => {
  console.log(`Webhook server is running on port ${PORT}`);
  console.log(`Webhook set to: ${webhookUrl}`);
});

// Настройка обработки невалидных путей
app.use((req, res) => {
  res.status(404).send('Not Found');
});