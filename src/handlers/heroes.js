console.log('Using heroes.js version: 2025-05-27'); // Новый маркер версии

const User = require('../models/User');
const Hero = require('../models/Hero');
const heroTranslations = require('../constants/heroes.js');
const mainMenuHandler = require('./mainMenu'); // Импортируем mainMenuHandler

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

// Функция для форматирования процента с сохранением точности
const formatPercentage = (value) => {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0 || num > 100) return '0.00';

  const [integer, decimal = ''] = num.toString().split('.');
  if (!decimal) return `${integer}.00`;
  if (decimal.length < 2) return `${integer}.${decimal.padEnd(2, '0')}`;
  return num.toString(); // Возвращаем как есть, если знаков после запятой >= 2
};

console.log('heroTranslations loaded:', Object.keys(heroTranslations)); // Отладочный лог

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const data = query ? query.data : null;
  const user = await User.findOne({ telegramId: chatId.toString() });
  const messageText = msg.text;

  if (!user) {
    bot.sendMessage(chatId, user.language === 'RU' ? 'Пожалуйста, начните с /start.' : 'Please start with /start.');
    return;
  }

  console.log(`Handling callback: ${data}, message: ${messageText}`); // Дополнительный лог

  try {
    if (data && data.startsWith('heroes_class_')) {
      const classId = data.split('_')[2];
      console.log(`Processing heroes_class with classId: ${classId}`);
      console.log(`Structure of heroTranslations[${classId}]:`, heroTranslations[classId]); // Диагностика структуры
      if (!heroTranslations[classId]) {
        console.log(`Invalid classId in heroes_class: ${classId}, available: ${Object.keys(heroTranslations)}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный класс героев.' : 'Invalid hero class.');
        return;
      }
      const heroes = await Hero.find({ userId: chatId.toString(), classId });

      let heroText = user.language === 'RU' ? `Класс: ${heroTranslations[classId].classNames[user.language]}\n\n` : `Class: ${heroTranslations[classId].classNames[user.language]}\n\n`;
      if (heroes.length === 0) {
        heroText += user.language === 'RU' ? 'У вас нет героев этого класса.' : 'You have no heroes of this class.';
      } else {
        heroes.forEach((hero, index) => {
          const heroName = heroTranslations[classId].heroes[hero.heroId][user.language];
          const updatedAt = formatDateTime(new Date(hero.updatedAt), user.language);
          heroText += user.language === 'RU' ?
              `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} ур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${formatPercentage(hero.winPercentage).replace('.', ',')}%\n` +
              `Битвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
              `Обновлено: ${updatedAt}\n` +
              (index < heroes.length - 1 ? `➖➖➖➖➖➖➖➖➖➖➖\n` : '') :
              `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} lvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${formatPercentage(hero.winPercentage)}%\n` +
              `Battles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
              `Updated: ${updatedAt}\n` +
              (index < heroes.length - 1 ? `➖➖➖➖➖➖➖➖➖➖➖\n` : '');
        });
      }

      const inlineKeyboard = [
        ...heroes.map(hero => [
          {
            text: user.language === 'RU' ? `✏️ ${heroTranslations[classId].heroes[hero.heroId][user.language]}` : `✏️ ${heroTranslations[classId].heroes[hero.heroId][user.language]}`,
            callback_data: `heroes_edit_${classId}_${hero.heroId}`,
          },
          {
            text: hero.isPrimary
                ? (user.language === 'RU' ? '✅ Осн.' : '✅ Prim.')
                : (user.language === 'RU' ? '🌟 Осн.' : '🌟 Prim.'),
            callback_data: `set_primary_${chatId}_${classId}_${hero.heroId}`,
          }
        ]),
        [{ text: user.language === 'RU' ? '➕ Герой' : '➕ Hero', callback_data: `heroes_add_${classId}` }],
      ];

      bot.sendMessage(chatId, heroText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    } else if (data && data.startsWith('heroes_add_confirm_')) {
      const parts = data.split('_');
      console.log(`Raw callback data: ${data}, parts: ${parts}`);
      if (parts.length < 5) {
        console.log(`Invalid callback data format: ${data}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный формат данных.' : 'Invalid data format.');
        return;
      }
      const classId = parts[3];
      const heroId = parts[4];
      console.log(`Confirming hero: classId=${classId}, heroId=${heroId}, available classes: ${Object.keys(heroTranslations)}`);
      if (!heroTranslations[classId] || !heroTranslations[classId].heroes[heroId]) {
        console.log(`Invalid classId or heroId: classId=${classId}, heroId=${heroId}, available heroes: ${Object.keys(heroTranslations[classId]?.heroes || {})}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный герой или класс.' : 'Invalid hero or class.');
        return;
      }

      const existingHero = await Hero.findOne({ userId: chatId.toString(), classId, heroId });
      if (existingHero) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Этот герой уже добавлен!' : 'This hero is already added!');
        return;
      }

      await Hero.create({
        userId: chatId.toString(),
        heroId,
        classId,
        level: 1,
        battlesPlayed: 0,
        heroesKilled: 0,
        winPercentage: 0,
        heroesRevived: 0,
        strength: 0,
        isPrimary: false
      });
      bot.sendMessage(chatId, user.language === 'RU' ? 'Герой добавлен!' : 'Hero added!');
      await mainMenuHandler(bot, msg, { data: `heroes_class_${classId}` }); // Возвращаемся к списку героев класса
    } else if (data && data.startsWith('heroes_add_')) {
      const classId = data.split('_')[2];
      console.log(`Processing heroes_add with classId: ${classId}`);
      if (!heroTranslations[classId]) {
        console.log(`Invalid classId in heroes_add: ${classId}, available: ${Object.keys(heroTranslations)}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный класс героев.' : 'Invalid hero class.');
        return;
      }
      const userHeroes = await Hero.find({ userId: chatId.toString(), classId });
      const availableHeroes = Object.keys(heroTranslations[classId].heroes).filter(
          heroId => !userHeroes.some(h => h.heroId === heroId)
      );

      if (availableHeroes.length === 0) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Все герои этого класса уже добавлены.' : 'All heroes of this class are already added.');
        return;
      }

      console.log(`Available heroes for class ${classId}: ${availableHeroes}`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Выберите героя для добавления:' : 'Select a hero to add:', {
        reply_markup: {
          inline_keyboard: availableHeroes.map(heroId => {
            const callbackData = `heroes_add_confirm_${classId}_${heroId}`;
            console.log(`Generated callback_data: ${callbackData}`);
            return [{
              text: heroTranslations[classId].heroes[heroId][user.language],
              callback_data: callbackData,
            }];
          }),
        },
      });
    } else if (data && data.startsWith('heroes_edit_')) {
      const parts = data.split('_');
      if (parts.length < 4) {
        console.log(`Invalid edit callback data: ${data}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный формат данных.' : 'Invalid data format.');
        return;
      }
      const classId = parts[2];
      const heroId = parts[3];
      console.log(`Editing hero: classId=${classId}, heroId=${heroId}`);
      if (!heroTranslations[classId] || !heroTranslations[classId].heroes[heroId]) {
        console.log(`Invalid classId or heroId in edit: classId=${classId}, heroId=${heroId}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный герой или класс.' : 'Invalid hero or class.');
        return;
      }
      const hero = await Hero.findOne({ userId: chatId.toString(), classId, heroId });
      if (!hero) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Герой не найден.' : 'Hero not found.');
        return;
      }

      const heroName = heroTranslations[classId].heroes[hero.heroId][user.language];
      const updatedAt = formatDateTime(new Date(hero.updatedAt), user.language);
      const editText = user.language === 'RU' ?
          `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} ур. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${formatPercentage(hero.winPercentage).replace('.', ',')}%\n` +
          `Битвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
          `Обновлено: ${updatedAt}\n\n` +
          `Выберите поле для редактирования:` :
          `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroName} lvl. ${hero.level}, ✊ ${hero.strength}, ⚔️ ${formatPercentage(hero.winPercentage)}%\n` +
          `Battles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
          `Updated: ${updatedAt}\n\n` +
          `Select a field to edit:`;

      bot.sendMessage(chatId, editText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: user.language === 'RU' ? 'Уровень' : 'Level', callback_data: `edit_level_${classId}_${heroId}` },
              { text: user.language === 'RU' ? 'Сила' : 'Strength', callback_data: `edit_strength_${classId}_${heroId}` },
            ],
            [
              { text: user.language === 'RU' ? 'Битвы' : 'Battles', callback_data: `edit_battles_${classId}_${heroId}` },
              { text: user.language === 'RU' ? 'Убито' : 'Killed', callback_data: `edit_killed_${classId}_${heroId}` },
            ],
            [
              { text: user.language === 'RU' ? 'Победы (%)' : 'Win Rate (%)', callback_data: `edit_win_${classId}_${heroId}` },
              { text: user.language === 'RU' ? 'Воскр.' : 'Rev.', callback_data: `edit_revived_${classId}_${heroId}` },
            ],
            [
              { text: user.language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: `heroes_class_${classId}` },
            ],
          ],
        },
      });
    } else if (data && data.startsWith('edit_')) {
      const parts = data.split('_');
      if (parts.length < 4) {
        console.log(`Invalid edit field callback: ${data}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверный формат данных.' : 'Invalid data format.');
        return;
      }
      const field = parts[1];
      const classId = parts[2];
      const heroId = parts[3];
      console.log(`Preparing to edit field: ${field} for classId=${classId}, heroId=${heroId}`);

      const validFields = ['level', 'battles', 'killed', 'win', 'strength', 'revived'];
      if (!validFields.includes(field)) {
        console.log(`Invalid field: ${field}`);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Неверное поле.' : 'Invalid field.');
        return;
      }

      if (user.registrationStep && user.registrationStep.startsWith(`editing_${field}_${classId}_${heroId}`)) {
        const hero = await Hero.findOne({ userId: chatId.toString(), classId, heroId });
        if (!hero) {
          bot.sendMessage(chatId, user.language === 'RU' ? 'Герой не найден.' : 'Hero not found.');
          user.registrationStep = null;
          await user.save();
          return;
        }

        const cleanedText = messageText.replace(',', '.');
        let newValue = parseFloat(cleanedText);
        if (isNaN(newValue)) {
          bot.sendMessage(chatId, user.language === 'RU' ? 'Введите корректное число.' : 'Please enter a valid number.');
          return;
        }

        if (field === 'win') {
          newValue = Math.min(100, Math.max(0, newValue));
          const strValue = cleanedText.includes('.') ? cleanedText.split('.')[1].length : 0;
          newValue = parseFloat(cleanedText);
        } else if (['level', 'battles', 'killed', 'strength', 'revived'].includes(field)) {
          newValue = Math.max(0, Math.floor(newValue));
        }

        hero[field] = newValue;
        await hero.save();
        user.registrationStep = null;
        await user.save();

        const updatedAt = formatDateTime(new Date(hero.updatedAt), user.language);
        const responseText = user.language === 'RU' ?
            `<b>✏️ Редактирование ${heroTranslations[classId].heroes[heroId][user.language]}:</b>\n` +
            `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroTranslations[classId].heroes[heroId][user.language]}\n` +
            `Уровень/Сила/Победы: ${hero.level}/${hero.strength}/${formatPercentage(hero.winPercentage)}%\n` +
            `Битвы/Убито/Воскр.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
            `Обновлено: ${updatedAt}` :
            `<b>✏️ Editing ${heroTranslations[classId].heroes[heroId][user.language]}:</b>\n` +
            `${hero.isPrimary ? '⭐ ' : ''}🦸 ${heroTranslations[classId].heroes[heroId][user.language]}\n` +
            `Level/Strength/Win Rate: ${hero.level}/${hero.strength}/${formatPercentage(hero.winPercentage)}%\n` +
            `Battles/Killed/Rev.: ${hero.battlesPlayed}/${hero.heroesKilled}/${hero.heroesRevived}\n\n` +
            `Updated: ${updatedAt}`;

        bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });
        await mainMenuHandler(bot, msg, { data: `heroes_class_${classId}` }); // Возвращаемся к списку героев класса
      } else {
        user.registrationStep = `editing_${field}_${classId}_${heroId}`;
        await user.save();

        const fieldPrompts = {
          level: user.language === 'RU' ? 'Введите новый уровень (целое число, например, 5):' : 'Enter new level (integer, e.g., 5):',
          battles: user.language === 'RU' ? 'Введите количество сыгранных битв (целое число, например, 100):' : 'Enter number of battles played (integer, e.g., 100):',
          killed: user.language === 'RU' ? 'Введите количество убитых героев (целое число, например, 50):' : 'Enter number of heroes killed (integer, e.g., 50):',
          win: user.language === 'RU' ? 'Введите процент побед (число от 0 до 100, например, 75.5):' : 'Enter win percentage (number from 0 to 100, e.g., 75.5):',
          strength: user.language === 'RU' ? 'Введите значение силы (целое число, например, 50):' : 'Enter strength value (integer, e.g., 50):',
          revived: user.language === 'RU' ? 'Введите количество воскрешённых героев (целое число, например, 10):' : 'Enter number of heroes revived (integer, e.g., 10):',
        };

        bot.sendMessage(chatId, fieldPrompts[field]);
      }
    } else {
      console.log(`Unknown callback data: ${data}`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Неизвестная команда.' : 'Unknown command.');
    }
  } catch (error) {
    console.error('Error in heroes handler:', error);
    bot.sendMessage(chatId, user.language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
};