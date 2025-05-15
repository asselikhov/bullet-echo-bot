const User = require('../models/User');
const Hero = require('../models/Hero');
const { getMainReplyKeyboard } = require('./keyboards');
const motivations = require('../constants/motivations');

// Очищает глобальные состояния для указанного пользователя
const clearGlobalStates = (userId) => {
  if (global.editingProfileState?.[userId]) delete global.editingProfileState[userId];
  if (global.searchState?.[userId]) delete global.searchState[userId];
  if (global.editingState?.[userId]) delete global.editingState[userId];
};

// Выбирает случайную мотивационную фразу
const getRandomMotivation = (gameMode, party, language, heroTranslations) => {
  let motivation;
  // Пытаемся получить фразу из gameModes для указанного режима
  if (motivations.gameModes[gameMode]) {
    const modeMotivations = motivations.gameModes[gameMode];
    motivation = modeMotivations[Math.floor(Math.random() * modeMotivations.length)];
  } else {
    // Если режима нет, используем general
    motivation = motivations.general[Math.floor(Math.random() * motivations.general.length)];
  }
  return motivation;
};

module.exports = {
  clearGlobalStates,

  // Форматирует дату и время в зависимости от языка
  formatDateTime: (date, language) => {
    const pad = (num) => String(num).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return language === 'RU'
        ? `${day}.${month}.${year} ${hours}:${minutes}`
        : `${month}/${day}/${year} ${hours}:${minutes}`;
  },

  // Возвращает метки полей для профиля в зависимости от языка
  getFieldLabels: (language) => language === 'RU' ? {
    nickname: 'Никнейм',
    userId: 'ID игрока',
    trophies: 'Трофеи',
    valorPath: 'Путь доблести',
    syndicate: 'Синдикат',
    name: 'Имя',
    age: 'Возраст',
    gender: 'Пол',
    country: 'Страна',
    city: 'Город'
  } : {
    nickname: 'Nickname',
    userId: 'User ID',
    trophies: 'Trophies',
    valorPath: 'Valor Path',
    syndicate: 'Syndicate',
    name: 'Name',
    age: 'Age',
    gender: 'Gender',
    country: 'Country',
    city: 'City'
  },

  // Форматирует текст профиля пользователя
  formatProfileText: (user, language) => {
    const isRU = language === 'RU';
    const fieldLabels = module.exports.getFieldLabels(language);
    const normalizeGender = (gender) => {
      if (!gender) return null;
      const lowerGender = gender.toLowerCase().trim();
      if (['male', 'm', 'мужской', 'м'].includes(lowerGender)) return 'male';
      if (['female', 'f', 'женский', 'ж'].includes(lowerGender)) return 'female';
      return lowerGender;
    };
    console.log(`Processing gender for userId=${user.telegramId}: raw=${user.gender}, normalized=${normalizeGender(user.gender)}`);
    const genderMap = { male: isRU ? 'М' : 'M', female: isRU ? 'Ж' : 'F' };
    const normalizedGender = normalizeGender(user.gender);
    const genderDisplay = genderMap[normalizedGender] || 'Не указано';
    return [
      `${user.name || 'Не указано'}, ${genderDisplay}, ${user.age || 'Не указано'} ${isRU ? 'лет' : 'years'}`,
      `${user.country || 'Не указано'}, ${user.city || 'Не указано'}`,
      `Telegram: ${user.telegramUsername || user.telegramId}`,
      `${fieldLabels.nickname}: ${user.nickname || 'Не указано'}`,
      `${fieldLabels.userId}: <code>${user.userId || 'Не указано'}</code>`,
      `${fieldLabels.trophies}: ${user.trophies || 0}`,
      `${fieldLabels.valorPath}: ${user.valorPath || (isRU ? 'Не указано' : 'Not specified')}`,
      `${fieldLabels.syndicate}: ${user.syndicate || (isRU ? 'Не указано' : 'Not specified')}`
    ].join('\n');
  },

  // Форматирует текст для списка героев
  formatHeroesText: (heroes, classId, heroTranslations, language, formatPercentage) => {
    let heroText = language === 'RU'
        ? `Класс: ${heroTranslations[classId]?.classNames?.[language] || 'Неизвестный класс'}\n\n`
        : `Class: ${heroTranslations[classId]?.classNames?.[language] || 'Unknown class'}\n\n`;
    if (heroes.length === 0) {
      heroText += language === 'RU' ? 'У вас нет героев этого класса.' : 'You have no heroes of this class.';
    } else {
      heroText += heroes.map((hero, index) => {
        const heroName = heroTranslations[classId]?.heroes?.[hero.heroId]?.[language] || 'Неизвестный герой';
        const updatedAt = module.exports.formatDateTime(new Date(hero.updatedAt), language);
        const level = hero.level ?? 0;
        const strength = hero.strength ?? 0;
        const winPercentageValue = hero.winPercentage ?? 0;
        const winPercentage = language === 'RU'
            ? (formatPercentage(winPercentageValue) || '0').replace('.', ',')
            : formatPercentage(winPercentageValue) || '0';
        const stats = language === 'RU'
            ? `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} ур. ${level}, ✊ ${strength}, ⚔️ ${winPercentage}%\n` +
            `Битвы/Убито/Воскр.: ${hero.battlesPlayed ?? 0}/${hero.heroesKilled ?? 0}/${hero.heroesRevived ?? 0}\n\n` +
            `Обновлено: ${updatedAt}`
            : `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} lvl. ${level}, ✊ ${strength}, ⚔️ ${winPercentage}%\n` +
            `Battles/Killed/Rev.: ${hero.battlesPlayed ?? 0}/${hero.heroesKilled ?? 0}/${hero.heroesRevived ?? 0}\n\n` +
            `Updated: ${updatedAt}`;
        return stats + (index < heroes.length - 1 ? '\n➖➖➖➖➖➖➖➖➖➖➖\n' : '');
      }).join('');
    }
    return heroText || (language === 'RU' ? 'Нет данных о героях.' : 'No hero data available.');
  },

  // Обрабатывает ошибки и отправляет сообщение пользователю
  handleError: async (ctx, error, language = 'RU') => {
    console.error('Error:', error.stack);
    try {
      await ctx.reply(
          language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.',
          { reply_markup: { keyboard: getMainReplyKeyboard(language).keyboard, resize_keyboard: true } }
      );
    } catch (replyError) {
      console.error('Failed to send error message:', replyError.stack);
      await ctx.reply(language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
    }
  },

  // Форматирует сообщение о наборе в пати
  formatPartyMessage: async (party, language, groupChatId, heroTranslations) => {
    const isRU = language === 'RU';
    const organizer = await User.findOne({ telegramId: party.organizerId }).lean();
    const organizerHero = await Hero.findOne({ userId: party.organizerId, heroId: party.heroId }).lean();
    const heroData = heroTranslations[organizerHero?.classId || party.classId]?.heroes[party.heroId];
    const heroName = heroData ? heroData[language] : `Unknown Hero (ID: ${party.heroId})`;
    const nickname = organizer.nickname || 'Unknown';
    const acceptedMembers = party.applications.filter(app => app.status === 'accepted');
    const currentCount = 1 + acceptedMembers.length;
    const totalCount = party.playerCount || 2;

    console.log(`Formatting party message: partyId=${party._id}, currentCount=${currentCount}, totalCount=${totalCount}`);

    let messageText = isRU
        ? `⚠️ Набор в пати ${party.gameMode}\nСобрано ${currentCount} из ${totalCount}\n➖➖➖➖➖➖➖➖➖➖➖➖➖\n`
        : `⚠️ Recruiting for party ${party.gameMode}\nCollected ${currentCount} out of ${totalCount}\n➖➖➖➖➖➖➖➖➖➖➖➖➖\n`;

    const winPercentage = isRU
        ? (organizerHero?.winPercentage || 0).toFixed(2).replace('.', ',')
        : (organizerHero?.winPercentage || 0).toFixed(2);
    messageText += `1. ${nickname} | <code>${organizer.userId || 'Не указано'}</code> | 🏆 ${organizer.trophies || 0}\n`;
    messageText += `🦸 ${heroName} (${isRU ? 'ур.' : 'lvl.'} ${organizerHero?.level || 0}, ✊ ${organizerHero?.strength || 0}, ⚔️ ${winPercentage}%)\n`;

    if (acceptedMembers.length > 0) {
      const members = await Promise.all(
          acceptedMembers.map(async (app, index) => {
            const user = await User.findOne({ telegramId: app.applicantId }).lean();
            let hero = await Hero.findOne({ userId: app.applicantId, heroId: app.heroId }).lean();
            if (!hero) {
              hero = { heroId: app.heroId, classId: app.classId || party.classId, level: 0, strength: 0, winPercentage: 0 };
              console.warn(`Hero not found for userId=${app.applicantId}, heroId=${app.heroId}, using default values`);
            }
            return [user, hero, index];
          })
      );

      members.forEach(([user, hero, index]) => {
        const heroData = heroTranslations[hero.classId]?.heroes[hero.heroId];
        const heroName = heroData ? heroData[language] : `Unknown Hero (ID: ${hero.heroId})`;
        const winPercentage = isRU
            ? (hero.winPercentage || 0).toFixed(2).replace('.', ',')
            : (hero.winPercentage || 0).toFixed(2);
        const nickname = user.nickname || 'Unknown';
        messageText += `\n${index + 2}. ${nickname} | <code>${user.userId || 'Не указано'}</code> | 🏆 ${user.trophies || 0}\n`;
        messageText += `🦸 ${heroName} (${isRU ? 'ур.' : 'lvl.'} ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%)\n`;
      });
    }

    return messageText;
  },

  // Форматирует сообщение о собранной пати
  formatCompletedPartyMessage: async (party, language, groupChatId, heroTranslations) => {
    const isRU = language === 'RU';
    const organizer = await User.findOne({ telegramId: party.organizerId }).lean();
    const organizerHero = await Hero.findOne({ userId: party.organizerId, heroId: party.heroId }).lean();
    const heroData = heroTranslations[organizerHero?.classId || party.classId]?.heroes[party.heroId];
    const heroName = heroData ? heroData[language] : `Unknown Hero (ID: ${party.heroId})`;
    const nickname = organizer.nickname || 'Unknown';
    const acceptedMembers = party.applications.filter(app => app.status === 'accepted');

    console.log(`Formatting completed party message: partyId=${party._id}, acceptedMembers=${acceptedMembers.length}`);

    // Получаем мотивационную фразу
    const motivation = getRandomMotivation(party.gameMode, party, language, heroTranslations);

    // Формируем заголовок и мотиваiką фразу как цитату
    let messageText = isRU
        ? `✅ Пати на ${party.gameMode} собрана!\n\n`
        : `✅ Party for ${party.gameMode} is complete!\n\n`;
    messageText += `<blockquote>${motivation}</blockquote>\n\n`;

    // Форматируем организатора
    const winPercentage = isRU
        ? (organizerHero?.winPercentage || 0).toFixed(2).replace('.', ',')
        : (organizerHero?.winPercentage || 0).toFixed(2);
    messageText += `1. ${nickname} | <code>${organizer.userId || 'Не указано'}</code> | 🏆 ${organizer.trophies || 0}\n`;
    messageText += `🦸 ${heroName} (${isRU ? 'ур.' : 'lvl.'} ${organizerHero?.level || 0}, ✊ ${organizerHero?.strength || 0}, ⚔️ ${winPercentage}%)\n`;

    // Форматируем принятых участников
    if (acceptedMembers.length > 0) {
      const members = await Promise.all(
          acceptedMembers.map(async (app, index) => {
            const user = await User.findOne({ telegramId: app.applicantId }).lean();
            let hero = await Hero.findOne({ userId: app.applicantId, heroId: app.heroId }).lean();
            if (!hero) {
              hero = { heroId: app.heroId, classId: app.classId || party.classId, level: 0, strength: 0, winPercentage: 0 };
              console.warn(`Hero not found for userId=${app.applicantId}, heroId=${app.heroId}, using default values`);
            }
            return [user, hero, index];
          })
      );

      members.forEach(([user, hero, index]) => {
        const heroData = heroTranslations[hero.classId]?.heroes[hero.heroId];
        const heroName = heroData ? heroData[language] : `Unknown Hero (ID: ${hero.heroId})`;
        const winPercentage = isRU
            ? (hero.winPercentage || 0).toFixed(2).replace('.', ',')
            : (hero.winPercentage || 0).toFixed(2);
        const nickname = user.nickname || 'Unknown';
        messageText += `\n${index + 2}. ${nickname} | <code>${user.userId || 'Не указано'}</code> | 🏆 ${user.trophies || 0}\n`;
        messageText += `🦸 ${heroName} (${isRU ? 'ур.' : 'lvl.'} ${hero.level}, ✊ ${hero.strength}, ⚔️ ${winPercentage}%)\n`;
      });
    }

    return messageText;
  },

  // Форматирует сообщение о заявке на пати
  formatApplicationMessage: async (user, hero, heroTranslations, language, appliedAt) => {
    const isRU = language === 'RU';
    const profileText = module.exports.formatProfileText(user, language);
    const heroData = heroTranslations[hero?.classId]?.heroes[hero.heroId];
    const heroName = heroData ? heroData[language] : `Unknown Hero (ID: ${hero.heroId})`;
    const winPercentage = isRU
        ? (hero?.winPercentage || 0).toFixed(2).replace('.', ',')
        : (hero?.winPercentage || 0).toFixed(2);
    const updatedAt = module.exports.formatDateTime(new Date(appliedAt || hero?.updatedAt || Date.now()), language);
    const heroText = [
      `🦸 ${heroName} (${isRU ? 'ур.' : 'lvl.'} ${hero?.level || 0}, ✊ ${hero?.strength || 0}, ⚔️ ${winPercentage}%)`,
      `${isRU ? 'Битвы/Убито/Воскр' : 'Battles/Killed/Rev'}.: ${hero?.battlesPlayed || 0}/${hero?.heroesKilled || 0}/${hero?.heroesRevived || 0}`,
      `${isRU ? 'Обновлено' : 'Updated'}: ${updatedAt}`
    ].join('\n');
    return [
      `${isRU ? '⚠️ Новая заявка на вашу пати' : '⚠️ New application for your party'}`,
      '➖➖➖➖➖➖➖➖➖➖➖',
      profileText,
      '➖➖➖➖➖➖➖➖➖➖➖',
      heroText
    ].join('\n');
  },

  getRandomMotivation
};