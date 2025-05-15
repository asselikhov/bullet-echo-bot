const User = require('../models/User');
const Hero = require('../models/Hero');
const Party = require('../models/Party');
const heroTranslations = require('../constants/heroes');
const { formatDateTime, clearGlobalStates, formatPartyMessage, formatProfileText, formatApplicationMessage, formatCompletedPartyMessage, getRandomMotivation } = require('../utils/helpers');
const { getMainReplyKeyboard, getMainInlineKeyboard } = require('../utils/keyboards');
const { nanoid } = require('nanoid');
const motivations = require('../constants/motivations');

// Функция для генерации уникального shortId
async function generateUniqueShortId() {
  let shortId;
  let isUnique = false;
  while (!isUnique) {
    shortId = nanoid(6);
    const existingParty = await Party.findOne({ shortId }).lean();
    if (!existingParty) {
      isUnique = true;
    }
  }
  return shortId;
}

// Функции для создания клавиатур
const createSearchTypeKeyboard = (language) => ({
  resize_keyboard: true,
  inline_keyboard: [
    [
      { text: language === 'RU' ? 'Глобальный поиск' : 'Global search', callback_data: 'search_type_global' },
      { text: language === 'RU' ? 'Поиск пати' : 'Party search', callback_data: 'search_type_party' }
    ]
  ]
});

const createGameModeKeyboard = (language) => ({
  resize_keyboard: true,
  inline_keyboard: [
    [
      { text: language === 'RU' ? 'Королевская битва' : 'Battle Royale', callback_data: 'party_mode_battle_royale' },
      { text: language === 'RU' ? 'Стенка на стенку' : 'Team vs Team', callback_data: 'party_mode_team_vs_team' }
    ],
    [
      { text: language === 'RU' ? 'Аркада' : 'Arcade', callback_data: 'party_mode_arcade' },
      { text: language === 'RU' ? 'Саботаж' : 'Sabotage', callback_data: 'party_mode_sabotage' }
    ],
    [
      { text: language === 'RU' ? 'Командный бой' : 'Team Deathmatch', callback_data: 'party_mode_team_deathmatch' }
    ],
    [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_search' }]
  ]
});

const createPlayerCountKeyboard = (language) => ({
  resize_keyboard: true,
  inline_keyboard: [
    [
      { text: '1', callback_data: 'party_players_1' },
      { text: '2', callback_data: 'party_players_2' },
      { text: '3', callback_data: 'party_players_3' },
      { text: '4', callback_data: 'party_players_4' }
    ],
    [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'search_type_party' }]
  ]
});

const createHeroClassKeyboard = (language) => {
  if (!heroTranslations || Object.keys(heroTranslations).length === 0) {
    console.warn('heroTranslations is empty or undefined');
    return {
      resize_keyboard: true,
      inline_keyboard: [
        [{ text: language === 'RU' ? 'Классы героев недоступны' : 'Hero classes unavailable', callback_data: 'search_type_party' }]
      ]
    };
  }
  const classes = Object.keys(heroTranslations).map(classId => ({
    classId,
    name: heroTranslations[classId]?.classNames?.[language] || classId
  }));
  return {
    resize_keyboard: true,
    inline_keyboard: [
      ...classes.map(cls => [{ text: cls.name, callback_data: `party_class_${cls.classId}` }]),
      [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'search_type_party' }]
    ]
  };
};

const createPartyHeroSelectionKeyboard = async (userId, language, classId = null) => {
  const query = { userId };
  if (classId) query.classId = classId;
  const heroes = await Hero.find(query).lean();
  const heroButtons = heroes.map(hero => {
    const heroData = heroTranslations[hero.classId]?.heroes[hero.heroId];
    const heroName = heroData ? heroData[language] : 'Unknown Hero';
    return [{ text: `${heroName} (ур. ${hero.level})`, callback_data: `party_hero_${hero.classId}_${hero.heroId}` }];
  });
  return {
    resize_keyboard: true,
    inline_keyboard: [
      ...heroButtons,
      [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'search_type_party' }]
    ]
  };
};

const createApplicationKeyboard = (language, partyId, applicantId, heroId) => ({
  resize_keyboard: true,
  inline_keyboard: [
    [
      { text: language === 'RU' ? '✅ Принять' : '✅ Accept', callback_data: `party_accept_${partyId}_${applicantId}_${heroId}` },
      { text: language === 'RU' ? '❌ Отклонить' : '❌ Reject', callback_data: `party_reject_${partyId}_${applicantId}_${heroId}` }
    ]
  ]
});

const createGlobalSearchInputKeyboard = (language) => ({
  resize_keyboard: true,
  inline_keyboard: [
    [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_search' }]
  ]
});

const isValidInlineKeyboard = (keyboard) => {
  return keyboard && keyboard.length > 0 && keyboard.some(row => row.some(button => button.callback_data !== 'menu_search' && !button.callback_data.startsWith('party_class_')));
};

// Основной обработчик поиска
module.exports = async (bot, ctx, params, user) => {
  const userId = user.telegramId;
  const language = user.language || 'RU';
  const usersPerPage = 5;
  const maxSearchLength = 100;
  const data = typeof params === 'object' && params.data ? params.data : params;
  const messageText = ctx.message?.text?.trim();
  const groupChatId = '-1002364266898';
  const messageId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;

  console.log(`Search handler: userId=${userId}, data=${data}, messageText=${messageText}, message_id=${messageId}`);

  try {
    // Обработка заявок на пати в группе
    if (messageText && ctx.chat.id == groupChatId && ctx.message.reply_to_message) {
      const applyMatch = messageText.match(/^(пати|party)\s+(.+)/i);
      if (!applyMatch) {
        console.log(`Ignoring non-party command in group: userId=${userId}, text=${messageText}, message_id=${messageId}`);
        return;
      }

      const registeredUser = await User.findOne({ telegramId: userId }).lean();
      if (!registeredUser) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? 'Вы не зарегистрированы. Используйте команду /start для регистрации.' : 'You are not registered. Use /start to register.', {
          parse_mode: 'HTML'
        });
        console.log(`Unregistered user attempted to apply: userId=${userId}, message_id=${messageId}`);
        return;
      }

      const heroNameInput = applyMatch[2].trim().toLowerCase();
      let foundHero = null;
      let foundClassId = null;
      let heroData = null;
      for (const classId in heroTranslations) {
        const heroes = heroTranslations[classId].heroes;
        for (const heroId in heroes) {
          const heroNames = [heroes[heroId][language], heroes[heroId]['EN'], heroes[heroId]['RU']].map(name => name.toLowerCase());
          if (heroNames.includes(heroNameInput)) {
            foundHero = await Hero.findOne({ userId, heroId }).lean();
            foundClassId = classId;
            heroData = heroes[heroId];
            break;
          }
        }
        if (foundHero) break;
      }

      if (!foundHero) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? `Герой "${applyMatch[2].trim()}" не найден у вас.` : `Hero "${applyMatch[2].trim()}" not found.`, {
          parse_mode: 'HTML'
        });
        return;
      }

      const replyToMessageId = ctx.message.reply_to_message.message_id;
      const party = await Party.findOne({ groupMessageId: replyToMessageId });
      if (!party) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? 'Пати не найдена.' : 'Party not found.', {
          parse_mode: 'HTML'
        });
        return;
      }

      if (party.organizerId === userId) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? 'Вы не можете подать заявку на свою пати.' : 'You cannot apply to your own party.', {
          parse_mode: 'HTML'
        });
        return;
      }

      const existingApplication = party.applications.find(app => app.applicantId === userId);
      if (existingApplication) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? 'Вы уже подали заявку на эту пати.' : 'You have already applied to this party.', {
          parse_mode: 'HTML'
        });
        return;
      }

      const organizer = await User.findOne({ telegramId: party.organizerId }).lean();
      if (!organizer) {
        await bot.telegram.sendMessage(userId, language === 'RU' ? 'Организатор не найден.' : 'Organizer not found.', {
          parse_mode: 'HTML'
        });
        return;
      }
      const organizerLanguage = organizer.language || 'RU';

      const application = {
        applicantId: userId,
        heroId: foundHero.heroId,
        classId: foundClassId,
        status: 'pending',
        appliedAt: new Date()
      };
      console.log(`Saving application: userId=${userId}, heroId=${foundHero.heroId}, classId=${foundClassId}, partyId=${party._id}`);
      await Party.updateOne(
          { _id: party._id },
          {
            $push: { applications: application },
            updatedAt: new Date()
          }
      );

      const notificationText = await formatApplicationMessage(
          registeredUser,
          foundHero,
          heroTranslations,
          organizerLanguage,
          application.appliedAt
      );

      try {
        await bot.telegram.sendMessage(party.organizerId, notificationText, {
          parse_mode: 'HTML',
          reply_markup: createApplicationKeyboard(organizerLanguage, party._id, userId, foundHero.heroId)
        });
      } catch (error) {
        console.error(`Failed to send notification to organizer: userId=${party.organizerId}, error=${error.message}`);
      }

      const replyKeyboard = getMainReplyKeyboard(language);
      await bot.telegram.sendMessage(userId, language === 'RU' ? 'Заявка на пати отправлена!' : 'Party application sent!', {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language).inline_keyboard
        }
      });

      console.log(`Party application submitted: userId=${userId}, hero=${heroData ? heroData[language] : 'Unknown'}, partyId=${party._id}, message_id=${messageId}`);
      return;
    }

    // Обработка callback-запросов
    if (data === 'menu_search') {
      global.searchState = global.searchState || {};
      global.searchState[userId] = null;
      clearGlobalStates(userId);
      return {
        text: 'Выберите тип поиска:',
        reply_markup: createSearchTypeKeyboard(language),
        parse_mode: 'HTML'
      };
    }

    if (data === 'search_type_global') {
      global.searchState[userId] = { mode: 'global' };
      return {
        text: 'Выберите тип глобального поиска:',
        reply_markup: {
          resize_keyboard: true,
          inline_keyboard: [
            [
              { text: 'По никнейму', callback_data: 'global_search_type_nickname' },
              { text: 'По ID игрока', callback_data: 'global_search_type_userId' }
            ],
            [
              { text: 'По городу', callback_data: 'global_search_type_city' },
              { text: 'По клану', callback_data: 'global_search_type_syndicate' }
            ],
            [
              { text: 'По имени в Telegram', callback_data: 'global_search_type_telegramUsername' }
            ],
            [{ text: '⬅️ Назад', callback_data: 'menu_search' }]
          ]
        },
        parse_mode: 'HTML'
      };
    }

    if (data === 'search_type_party') {
      global.searchState[userId] = { mode: 'party' };
      return {
        text: 'Выберите режим игры:',
        reply_markup: createGameModeKeyboard(language),
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('party_mode_')) {
      const gameMode = data.replace('party_mode_', '');
      const gameModeText = {
        'battle_royale': 'Королевская битва',
        'team_vs_team': 'Стенка на стенку',
        'arcade': 'Аркада',
        'sabotage': 'Саботаж',
        'team_deathmatch': 'Командный бой'
      }[gameMode] || gameMode;
      const playerCount = {
        'battle_royale': 3,
        'team_vs_team': 5,
        'arcade': null,
        'sabotage': 5,
        'team_deathmatch': 3
      }[gameMode];

      global.searchState[userId] = { mode: 'party', gameMode, gameModeText, playerCount };

      if (gameMode === 'arcade') {
        return {
          text: 'Выберите количество игроков для пати:',
          reply_markup: createPlayerCountKeyboard(language),
          parse_mode: 'HTML'
        };
      }

      const classKeyboard = createHeroClassKeyboard(language);
      if (!isValidInlineKeyboard(classKeyboard.inline_keyboard)) {
        console.warn(`No hero classes available: userId=${userId}, message_id=${messageId}`);
        return {
          text: 'Классы героев недоступны.',
          reply_markup: createGameModeKeyboard(language),
          parse_mode: 'HTML'
        };
      }
      return {
        text: 'Выберите класс героев:',
        reply_markup: classKeyboard,
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('party_players_')) {
      const applicationsNeeded = parseInt(data.replace('party_players_', ''), 10);
      if (isNaN(applicationsNeeded) || applicationsNeeded < 1 || applicationsNeeded > 4) {
        console.warn(`Invalid player count: userId=${userId}, applicationsNeeded=${applicationsNeeded}, message_id=${messageId}`);
        return {
          text: 'Неверное количество игроков.',
          reply_markup: createPlayerCountKeyboard(language),
          parse_mode: 'HTML'
        };
      }
      const playerCount = 1 + applicationsNeeded;
      global.searchState[userId] = { ...global.searchState[userId], playerCount, applicationsNeeded };
      const classKeyboard = createHeroClassKeyboard(language);
      if (!isValidInlineKeyboard(classKeyboard.inline_keyboard)) {
        console.warn(`No hero classes available: userId=${userId}, message_id=${messageId}`);
        return {
          text: 'Классы героев недоступны.',
          reply_markup: createPlayerCountKeyboard(language),
          parse_mode: 'HTML'
        };
      }
      return {
        text: 'Выберите класс героев:',
        reply_markup: classKeyboard,
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('party_class_')) {
      const classId = data.replace('party_class_', '');
      global.searchState[userId] = { ...global.searchState[userId], classId };
      const heroKeyboard = await createPartyHeroSelectionKeyboard(userId, language, classId);
      if (!isValidInlineKeyboard(heroKeyboard.inline_keyboard)) {
        console.warn(`No heroes for class: userId=${userId}, classId=${classId}, message_id=${messageId}`);
        return {
          text: 'У вас нет героев в этом классе.',
          reply_markup: createHeroClassKeyboard(language),
          parse_mode: 'HTML'
        };
      }
      return {
        text: 'Выберите героя для пати:',
        reply_markup: heroKeyboard,
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('party_hero_')) {
      const [, classId, heroId] = data.match(/party_hero_([^_]+)_(.+)/) || [];
      const hero = await Hero.findOne({ userId, heroId }).lean();
      if (!hero) {
        return {
          text: 'Герой не найден.',
          reply_markup: await createPartyHeroSelectionKeyboard(userId, language, classId),
          parse_mode: 'HTML'
        };
      }
      const gameMode = global.searchState[userId]?.gameMode;
      const gameModeText = global.searchState[userId]?.gameModeText;
      const playerCount = global.searchState[userId]?.playerCount || 2;

      if (!gameMode || !gameModeText) {
        console.warn(`Missing game mode in search state: userId=${userId}, message_id=${messageId}`);
        clearGlobalStates(userId);
        return {
          text: 'Ошибка: режим игры не выбран.',
          reply_markup: createGameModeKeyboard(language),
          parse_mode: 'HTML'
        };
      }

      const shortId = await generateUniqueShortId();

      const party = new Party({
        organizerId: userId,
        gameMode: gameModeText,
        playerCount,
        classId,
        heroId,
        groupMessageId: null,
        applications: [],
        shortId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await party.save();
      console.log(`Created party: id=${party._id}, mode=${party.gameMode}, playerCount=${party.playerCount}, creatorId=${party.organizerId}`);

      const notificationText = await formatPartyMessage(
          party,
          language,
          groupChatId,
          heroTranslations
      );

      let sentMessage;
      try {
        console.log(`Sending party notification: userId=${userId}, text=${notificationText}`);
        sentMessage = await bot.telegram.sendMessage(groupChatId, notificationText, { parse_mode: 'HTML' });
        console.log(`Party notification sent: groupChatId=${groupChatId}, messageId=${sentMessage.message_id}`);
      } catch (error) {
        console.error(`Failed to send party notification: userId=${userId}, groupChatId=${groupChatId}, error=${error.message}`);
        await Party.deleteOne({ _id: party._id });
        throw new Error('Не удалось отправить сообщение в группу');
      }

      try {
        await Party.updateOne({ _id: party._id }, { groupMessageId: sentMessage.message_id });
        console.log(`Updated party with groupMessageId: id=${party._id}, groupMessageId=${sentMessage.message_id}`);
      } catch (error) {
        console.error(`Failed to update groupMessageId: partyId=${party._id}, error=${error.message}`);
        await Party.deleteOne({ _id: party._id });
        throw new Error('Не удалось обновить пати');
      }

      clearGlobalStates(userId);
      const replyKeyboard = getMainReplyKeyboard(language);
      return {
        text: 'Уведомление о пати отправлено в группу!',
        reply_markup: {
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language).inline_keyboard
        },
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('party_accept_') || data.startsWith('party_reject_')) {
      const match = data.match(/(party_accept_|party_reject_)(\w{24})_(\d+)_(\w+)/);
      if (!match) {
        console.error(`Invalid callback data: ${data}`);
        return {
          text: 'Неверный формат команды.',
          reply_markup: { inline_keyboard: getMainInlineKeyboard(language).inline_keyboard }
        };
      }
      const [, action, partyId, applicantId, heroId] = match;
      const isAccept = action === 'party_accept_';
      const party = await Party.findById(partyId);
      if (!party || party.organizerId !== userId) {
        clearGlobalStates(userId);
        return {
          text: 'Пати не найдена или вы не организатор.',
          reply_markup: {
            keyboard: getMainReplyKeyboard(language).keyboard,
            resize_keyboard: true,
            inline_keyboard: getMainInlineKeyboard(language).inline_keyboard
          },
          parse_mode: 'HTML'
        };
      }

      const application = party.applications.find(app => app.applicantId === applicantId && app.heroId === heroId);
      if (!application) {
        clearGlobalStates(userId);
        return {
          text: 'Заявка не найдена.',
          reply_markup: {
            keyboard: getMainReplyKeyboard(language).keyboard,
            resize_keyboard: true,
            inline_keyboard: getMainInlineKeyboard(language).inline_keyboard
          },
          parse_mode: 'HTML'
        };
      }

      application.status = isAccept ? 'accepted' : 'rejected';
      party.updatedAt = new Date();
      await party.save();

      if (isAccept) {
        const acceptedCount = party.applications.filter(app => app.status === 'accepted').length;
        const applicationsNeeded = party.playerCount - 1;

        console.log(`Accepting player: partyId=${partyId}, acceptedCount=${acceptedCount}, applicationsNeeded=${applicationsNeeded}`);

        if (acceptedCount >= applicationsNeeded) {
          const partyNotification = await formatCompletedPartyMessage(party, language, groupChatId, heroTranslations);
          await bot.telegram.sendMessage(groupChatId, partyNotification, { parse_mode: 'HTML' });

          try {
            await bot.telegram.deleteMessage(groupChatId, party.groupMessageId);
            console.log(`Party message deleted: groupChatId=${groupChatId}, messageId=${party.groupMessageId}`);
          } catch (error) {
            console.error(`Failed to delete party message: groupChatId=${groupChatId}, messageId=${party.groupMessageId}, error=${error.message}`);
          }
          await Party.deleteOne({ _id: partyId });

          const members = await Promise.all([
            Promise.all([
              User.findOne({ telegramId: party.organizerId }).lean(),
              Hero.findOne({ userId: party.organizerId, heroId: party.heroId }).lean()
            ]),
            ...party.applications
                .filter(app => app.status === 'accepted')
                .map(async (app) => {
                  const user = await User.findOne({ telegramId: app.applicantId }).lean();
                  const hero = await Hero.findOne({ userId: app.applicantId, heroId: app.heroId }).lean();
                  console.log(`Applicant hero data: userId=${app.applicantId}, classId=${app.classId || party.classId}, heroId=${app.heroId}, hero=${JSON.stringify(hero)}`);
                  return [user, hero || { heroId: app.heroId, classId: app.classId || party.classId, level: 0, strength: 0, winPercentage: 0 }];
                })
          ]);

          for (const [user] of members) {
            const memberLanguage = user.language || 'RU';
            await bot.telegram.sendMessage(user.telegramId, `Пати ${party.gameMode} собрана! Свяжитесь с создателем: @${members[0][0].telegramUsername}`, {
              reply_markup: getMainReplyKeyboard(memberLanguage)
            });
          }
        } else {
          const updatedMessageText = await formatPartyMessage(party, language, groupChatId, heroTranslations);
          await bot.telegram.editMessageText(groupChatId, party.groupMessageId, null, updatedMessageText, {
            parse_mode: 'HTML'
          });
          console.log(`Party message updated: groupChatId=${groupChatId}, messageId=${party.groupMessageId}`);
        }
      }

      const applicant = await User.findOne({ telegramId: applicantId }).lean();
      const applicantLanguage = applicant.language || 'RU';
      const heroData = heroTranslations[application.classId]?.heroes[application.heroId];
      const heroName = heroData ? heroData[applicantLanguage] || `Unknown Hero (ID: ${application.heroId})` : `Unknown Hero (ID: ${application.heroId})`;
      const notificationText = `Ваша заявка на пати с героем ${heroName} ${isAccept ? 'принята' : 'отклонена'}!`;
      const applicantReplyKeyboard = getMainReplyKeyboard(applicantLanguage);
      await bot.telegram.sendMessage(applicantId, notificationText, {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: applicantReplyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(applicantLanguage).inline_keyboard
        }
      });

      clearGlobalStates(userId);
      const replyKeyboard = getMainReplyKeyboard(language);
      return {
        text: `Заявка ${isAccept ? 'принята' : 'отклонена'}.`,
        reply_markup: {
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language).inline_keyboard
        },
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('global_search_type_')) {
      const searchType = data.replace('global_search_type_', '');
      if (!['nickname', 'userId', 'city', 'syndicate', 'telegramUsername'].includes(searchType)) {
        console.error(`Invalid search type: userId=${userId}, searchType=${searchType}, message_id=${messageId}`);
        clearGlobalStates(userId);
        return {
          text: 'Неверный тип поиска.',
          reply_markup: createSearchTypeKeyboard(language),
          parse_mode: 'HTML'
        };
      }
      global.searchState[userId] = { mode: 'global', searchType };
      console.log(`Global search type selected: userId=${userId}, type=${searchType}, message_id=${messageId}`);

      return {
        text: `Введите ${searchType === 'nickname' ? 'никнейм' : searchType === 'userId' ? 'ID игрока' : searchType === 'city' ? 'город' : searchType === 'syndicate' ? 'название синдиката' : 'имя в Telegram'}:`,
        reply_markup: createGlobalSearchInputKeyboard(language),
        parse_mode: 'HTML'
      };
    }

    if (data === 'search_cancel') {
      clearGlobalStates(userId);
      return {
        text: 'Поиск отменён.',
        reply_markup: createSearchTypeKeyboard(language),
        parse_mode: 'HTML'
      };
    }

    if (data.startsWith('search_execute_')) {
      const [, , searchType, encodedSearchValue, pageStr] = data.split('_');
      const searchValue = decodeURIComponent(encodedSearchValue);
      const page = parseInt(pageStr, 10) || 1;

      if (searchValue.length > maxSearchLength) {
        clearGlobalStates(userId);
        return {
          text: 'Слишком длинный запрос поиска.',
          reply_markup: createSearchTypeKeyboard(language),
          parse_mode: 'HTML'
        };
      }

      console.log(`Search executed: userId=${userId}, type=${searchType}, value="${searchValue}", page=${page}, message_id=${messageId}`);

      const query = {};
      if (searchType === 'telegramUsername') {
        query[searchType] = { $regex: `^@${searchValue}$`, $options: 'i' };
      } else {
        query[searchType] = { $regex: `^${searchValue}$`, $options: 'i' };
      }

      const totalUsers = await User.countDocuments(query);
      const totalPages = Math.ceil(totalUsers / usersPerPage);

      const users = await User.find(query)
          .skip((page - 1) * usersPerPage)
          .limit(usersPerPage)
          .lean();

      console.log(`Search results: userId=${userId}, totalUsers=${totalUsers}, totalPages=${totalPages}, currentPage=${page}, message_id=${messageId}`);

      let responseText = `🔎 Найдено пользователей: ${totalUsers}\n`;
      if (users.length === 0) {
        responseText += 'Пользователи не найдены.';
      } else {
        users.forEach((u, index) => {
          responseText += `➖➖➖➖➖➖➖➖➖➖➖\n${(page - 1) * usersPerPage + index + 1}. ${formatProfileText(u, language)}\n`;
        });
      }

      const inlineKeyboard = [];
      if (totalPages > 1) {
        if (page > 1) {
          inlineKeyboard.push([{
            text: '⬅️ Предыдущая',
            callback_data: `search_execute_${searchType}_${encodedSearchValue}_${page - 1}`
          }]);
        }
        if (page < totalPages) {
          inlineKeyboard.push([{
            text: 'Следующая ➡️',
            callback_data: `search_execute_${searchType}_${encodedSearchValue}_${page + 1}`
          }]);
        }
      }
      inlineKeyboard.push([{
        text: '⬅️ Назад',
        callback_data: 'menu_search'
      }]);

      clearGlobalStates(userId);
      const replyKeyboard = getMainReplyKeyboard(language);
      return {
        text: responseText,
        reply_markup: {
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: inlineKeyboard
        },
        parse_mode: 'HTML'
      };
    }

    if (global.searchState[userId]?.mode === 'global' && messageText) {
      const searchType = global.searchState[userId].searchType;
      const searchValue = messageText;
      if (searchValue.length > maxSearchLength) {
        return {
          text: 'Слишком длинный запрос поиска.',
          reply_markup: createGlobalSearchInputKeyboard(language),
          parse_mode: 'HTML'
        };
      }

      console.log(`Text search: userId=${userId}, type=${searchType}, value="${searchValue}", message_id=${messageId}`);

      const query = {};
      if (searchType === 'telegramUsername') {
        query[searchType] = { $regex: `^@${searchValue}$`, $options: 'i' };
      } else {
        query[searchType] = { $regex: `^${searchValue}$`, $options: 'i' };
      }

      const totalUsers = await User.countDocuments(query);
      const users = await User.find(query).limit(usersPerPage).lean();

      console.log(`Text search results: userId=${userId}, totalUsers=${totalUsers}, usersFound=${users.length}, message_id=${messageId}`);

      let responseText = `🔎 Найдено пользователей: ${totalUsers}\n`;
      if (users.length === 0) {
        responseText += 'Пользователи не найдены.';
      } else {
        users.forEach((u, index) => {
          responseText += `➖➖➖➖➖➖➖➖➖➖➖\n${index + 1}. ${formatProfileText(u, language)}\n`;
        });
      }

      const inlineKeyboard = [];
      if (totalUsers > usersPerPage) {
        inlineKeyboard.push([{
          text: 'Следующая ➡️',
          callback_data: `search_execute_${searchType}_${encodeURIComponent(searchValue)}_2`
        }]);
      }
      inlineKeyboard.push([{
        text: '⬅️ Назад',
        callback_data: 'menu_search'
      }]);

      clearGlobalStates(userId);
      const replyKeyboard = getMainReplyKeyboard(language);
      return {
        text: responseText,
        reply_markup: {
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          inline_keyboard: inlineKeyboard
        },
        parse_mode: 'HTML'
      };
    }

    console.warn(`Unknown search data: ${data}, userId=${userId}, message_id=${messageId}`);
    clearGlobalStates(userId);
    return {
      text: 'Неизвестная команда.',
      reply_markup: createSearchTypeKeyboard(language),
      parse_mode: 'HTML'
    };
  } catch (error) {
    console.error(`Error in search handler: userId=${userId}, data=${data}, message_id=${messageId}`, error.stack);
    clearGlobalStates(userId);
    return {
      text: '❌ Ошибка при выполнении поиска.',
      reply_markup: createSearchTypeKeyboard(language),
      parse_mode: 'HTML'
    };
  }
};