const Hero = require('../models/Hero');
const heroTranslations = require('../constants/heroes');
const { formatHeroesText, clearGlobalStates } = require('../utils/helpers');
const { getMainReplyKeyboard, getHeroesInlineKeyboard } = require('../utils/keyboards');

const createHeroViewKeyboard = (language, classId, heroId, isPrimary) => [
  [
    { text: language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: `edit_hero_${classId}_${heroId}` },
    { text: language === 'RU' ? (isPrimary ? 'Снять основным' : 'Сделать основным') : (isPrimary ? 'Unset Primary' : 'Set Primary'), callback_data: `set_primary_${classId}_${heroId}` }
  ]
];

const createEditHeroKeyboard = (language, classId, heroId) => {
  const parameters = [
    { key: 'level', label: language === 'RU' ? 'Уровень' : 'Level' },
    { key: 'strength', label: language === 'RU' ? 'Сила' : 'Strength' },
    { key: 'winPercentage', label: language === 'RU' ? 'Процент побед' : 'Win Percentage' },
    { key: 'battlesPlayed', label: language === 'RU' ? 'Битвы' : 'Battles Played' },
    { key: 'heroesKilled', label: language === 'RU' ? 'Убито' : 'Heroes Killed' },
    { key: 'heroesRevived', label: language === 'RU' ? 'Воскрешено' : 'Heroes Revived' }
  ];

  return [
    ...parameters.map(param => [
      { text: param.label, callback_data: `edit_${param.key}_${classId}_${heroId}` }
    ])
  ];
};

const createAddHeroKeyboard = (language, classId, availableHeroes) => {
  console.log(`Creating add hero keyboard: classId=${classId}, availableHeroes=${JSON.stringify(availableHeroes)}`);
  if (availableHeroes.length === 0) {
    return {
      inline_keyboard: []
    };
  }
  const heroButtons = availableHeroes.map(heroId => {
    const heroData = heroTranslations[classId]?.heroes[heroId];
    const heroName = heroData ? heroData[language] : heroId;
    return [{ text: heroName, callback_data: `add_hero_${classId}_${heroId}` }];
  });

  return {
    inline_keyboard: heroButtons
  };
};

const validateNumber = (text, field, language, min = 0, max = Infinity) => {
  const value = parseFloat(text);
  if (isNaN(value) || value < min || value > max) {
    return language === 'RU'
        ? `Пожалуйста, введите число для ${field} от ${min} до ${max}.`
        : `Please enter a number for ${field} between ${min} and ${max}.`;
  }
  return value;
};

module.exports = async (bot, ctx, params, user) => {
  if (!ctx || !user || !params) {
    console.error('Invalid parameters in heroes handler:', { ctx, user, params });
    return {
      text: 'Internal error: Invalid parameters.',
      reply_markup: { inline_keyboard: [] }
    };
  }

  const data = params.data;
  const userId = ctx.from.id.toString();
  const messageId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  const text = ctx.message?.text?.trim();
  const language = user.language || 'RU';

  console.log(`Heroes handler: userId=${userId}, data=${data}, message_id=${messageId}, text="${text}"`);

  try {
    if (data === 'menu_heroes') {
      let keyboardObj = getHeroesInlineKeyboard(language, 'menu_heroes');
      let inlineKeyboard = keyboardObj.inline_keyboard; // Извлекаем массив inline_keyboard
      // Фильтруем кнопку "Назад", если она есть
      inlineKeyboard = inlineKeyboard.filter(row =>
          !row.some(button => button.callback_data === 'menu_main')
      );
      console.log(`Sending heroes classes: userId=${userId}, replyMarkup=${JSON.stringify({ inline_keyboard: inlineKeyboard }, null, 2)}`);
      if (!inlineKeyboard || inlineKeyboard.length === 0) {
        console.warn(`Empty heroes inline keyboard: userId=${userId}`);
        return {
          text: language === 'RU' ? 'Ошибка загрузки классов героев.' : 'Error loading hero classes.',
          reply_markup: { inline_keyboard: [] }
        };
      }
      return {
        text: language === 'RU' ? 'Выберите класс героев:' : 'Select a hero class:',
        reply_markup: { inline_keyboard: inlineKeyboard }
      };
    }

    if (data.startsWith('heroes_class_')) {
      const classId = data.replace('heroes_class_', '');
      console.log(`Fetching heroes for classId=${classId}, userId=${userId}`);
      const heroes = await Hero.find({ userId, classId }).lean();
      console.log(`Found ${heroes.length} heroes for classId=${classId}`);

      let heroesText = language === 'RU' ? 'Список героев:\n' : 'List of heroes:\n';
      heroesText += '➖➖➖➖➖➖➖➖➖➖➖\n';

      if (heroes.length === 0) {
        heroesText += language === 'RU' ? 'У вас нет героев в этом классе.' : 'You have no heroes in this class.';
      } else {
        heroesText += language === 'RU' ? `Всего героев: ${heroes.length}` : `Total heroes: ${heroes.length}`;
      }

      const heroButtons = heroes.map(hero => {
        const heroData = heroTranslations[classId]?.heroes[hero.heroId];
        if (!heroData) {
          console.warn(`Hero data not found: heroId=${hero.heroId}, classId=${classId}`);
          return null;
        }
        const heroName = heroData[language] || 'Unknown Hero';
        const isPrimaryText = hero.isPrimary ? (language === 'RU' ? ' 🌟' : ' 🌟') : '';
        return [{
          text: `${heroName} (ур. ${hero.level})${isPrimaryText}`,
          callback_data: `heroes_view_${classId}_${hero.heroId}`
        }];
      }).filter(button => button !== null);

      console.log(`Generated ${heroButtons.length} hero buttons for classId=${classId}`);

      const inlineKeyboard = [
        ...heroButtons,
        [{ text: language === 'RU' ? '➕ Добавить героя' : '➕ Add Hero', callback_data: `add_hero_select_${classId}` }]
      ];

      return {
        text: heroesText,
        reply_markup: { inline_keyboard: inlineKeyboard },
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
    }

    if (data.startsWith('add_hero_select_')) {
      const classId = data.replace('add_hero_select_', '');
      console.log(`Initiating hero addition for classId=${classId}, userId=${userId}`);

      // Получаем существующих героев пользователя для этого класса
      const existingHeroes = await Hero.find({ userId, classId }).lean();
      const existingHeroIds = existingHeroes.map(hero => hero.heroId);

      // Получаем доступные герои для класса из heroTranslations
      const availableHeroes = Object.keys(heroTranslations[classId]?.heroes || {})
          .filter(heroId => !existingHeroIds.includes(heroId));

      console.log(`Available heroes for classId=${classId}: ${JSON.stringify(availableHeroes)}`);

      if (availableHeroes.length === 0) {
        return {
          text: language === 'RU' ? 'Все герои этого класса уже добавлены.' : 'All heroes for this class are already added.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      return {
        text: language === 'RU' ? 'Выберите героя для добавления:' : 'Select a hero to add:',
        reply_markup: createAddHeroKeyboard(language, classId, availableHeroes),
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
    }

    if (data.startsWith('add_hero_')) {
      const [, classId, heroId] = data.match(/add_hero_([^_]+)_(.+)/) || [];
      if (!classId || !heroId) {
        console.warn(`Invalid add_hero_ format: ${data}`);
        return {
          text: language === 'RU' ? 'Неверный формат команды.' : 'Invalid command format.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      // Проверяем, существует ли уже герой
      const existingHero = await Hero.findOne({ userId, classId, heroId });
      if (existingHero) {
        return {
          text: language === 'RU' ? 'Этот герой уже добавлен.' : 'This hero is already added.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      // Проверяем, есть ли герой в heroTranslations
      const heroData = heroTranslations[classId]?.heroes[heroId];
      if (!heroData) {
        console.warn(`Hero data not found for heroId=${heroId}, classId=${classId}`);
        return {
          text: language === 'RU' ? 'Герой не найден в данных.' : 'Hero not found in data.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      // Создаём нового героя
      const newHero = new Hero({
        userId,
        classId,
        heroId,
        level: 1,
        strength: 0,
        winPercentage: 0,
        battlesPlayed: 0,
        heroesKilled: 0,
        heroesRevived: 0,
        isPrimary: false,
        updatedAt: new Date()
      });
      await newHero.save();

      const heroName = heroData[language] || 'Unknown Hero';
      console.log(`Hero added: userId=${userId}, classId=${classId}, heroId=${heroId}, heroName=${heroName}`);
      return {
        text: language === 'RU' ? `✅ Герой ${heroName} добавлен!` : `✅ Hero ${heroName} added!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: `edit_hero_${classId}_${heroId}` }]
          ]
        },
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
    }

    if (data.startsWith('heroes_view_')) {
      const [, classId, heroId] = data.match(/heroes_view_([^_]+)_(.+)/) || [];
      if (!classId || !heroId) {
        console.warn(`Invalid heroes_view_ format: ${data}`);
        return {
          text: language === 'RU' ? 'Неверный формат команды.' : 'Invalid command format.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const hero = await Hero.findOne({ userId, classId, heroId }).lean();
      if (!hero) {
        return {
          text: language === 'RU' ? 'Герой не найден.' : 'Hero not found.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const heroData = heroTranslations[classId]?.heroes[heroId];
      const heroName = heroData ? heroData[language] : 'Unknown Hero';
      const heroesText = formatHeroesText([hero], classId, heroTranslations, language, (val) => val.toFixed(2));

      return {
        text: heroesText,
        reply_markup: { inline_keyboard: createHeroViewKeyboard(language, classId, heroId, hero.isPrimary) },
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
    }

    if (data.startsWith('set_primary_')) {
      const [, classId, heroId] = data.match(/set_primary_([^_]+)_(.+)/) || [];
      if (!classId || !heroId) {
        console.warn(`Invalid set_primary_ format: ${data}`);
        return {
          text: language === 'RU' ? 'Неверный формат команды.' : 'Invalid command format.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        return {
          text: language === 'RU' ? 'Герой не найден.' : 'Hero not found.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      await Hero.updateMany({ userId, classId, isPrimary: true }, { isPrimary: false });
      hero.isPrimary = !hero.isPrimary;
      hero.updatedAt = new Date();
      await hero.save();

      const heroData = heroTranslations[classId]?.heroes[heroId];
      const heroName = heroData ? heroData[language] : 'Unknown Hero';

      return {
        text: language === 'RU'
            ? hero.isPrimary
                ? `✅ ${heroName} теперь основной герой!`
                : `✅ ${heroName} больше не основной герой.`
            : hero.isPrimary
                ? `✅ ${heroName} is now the primary hero!`
                : `✅ ${heroName} is no longer the primary hero.`,
        reply_markup: { inline_keyboard: [] },
        method: 'sendMessage'
      };
    }

    if (data.startsWith('edit_hero_')) {
      const [, classId, heroId] = data.match(/edit_hero_([^_]+)_(.+)/) || [];
      if (!classId || !heroId) {
        console.warn(`Invalid edit_hero_ format: ${data}`);
        return {
          text: language === 'RU' ? 'Неверный формат команды.' : 'Invalid command format.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        return {
          text: language === 'RU' ? 'Герой не найден.' : 'Hero not found.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const heroData = heroTranslations[classId]?.heroes[heroId];
      const heroName = heroData ? heroData[language] : 'Unknown Hero';

      return {
        text: language === 'RU' ? `Редактировать ${heroName}:` : `Edit ${heroName}:`,
        reply_markup: { inline_keyboard: createEditHeroKeyboard(language, classId, heroId) },
        method: 'sendMessage'
      };
    }

    if (data.startsWith('edit_')) {
      const match = data.match(/edit_([^_]+)_([^_]+)_(.+)/);
      if (!match) {
        console.warn(`Invalid edit_ format: ${data}`);
        return {
          text: language === 'RU' ? 'Неверный формат команды.' : 'Invalid command format.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const [, param, classId, heroId] = match;
      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        return {
          text: language === 'RU' ? 'Герой не найден.' : 'Hero not found.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      global.editingState = global.editingState || {};
      global.editingState[userId] = { parameter: param, classId, heroId };

      const heroData = heroTranslations[classId]?.heroes[heroId];
      const heroName = heroData ? heroData[language] : 'Unknown Hero';
      const paramLabels = {
        level: language === 'RU' ? 'уровень' : 'level',
        strength: language === 'RU' ? 'силу' : 'strength',
        winPercentage: language === 'RU' ? 'процент побед' : 'win percentage',
        battlesPlayed: language === 'RU' ? 'количество битв' : 'battles played',
        heroesKilled: language === 'RU' ? 'убито героев' : 'heroes killed',
        heroesRevived: language === 'RU' ? 'воскрешено героев' : 'heroes revived'
      };
      const label = paramLabels[param] || param;

      let promptText = language === 'RU'
          ? `Введите ${label} для ${heroName}:`
          : `Enter ${label} for ${heroName}:`;
      if (param === 'winPercentage') {
        promptText += language === 'RU' ? ' (число от 0 до 100)' : ' (number from 0 to 100)';
      }

      return {
        text: promptText,
        reply_markup: { inline_keyboard: [] },
        method: 'sendMessage'
      };
    }

    if (text && global.editingState?.[userId]?.parameter) {
      const { parameter, classId, heroId } = global.editingState[userId];
      const hero = await Hero.findOne({ userId, classId, heroId });
      if (!hero) {
        clearGlobalStates(userId);
        return {
          text: language === 'RU' ? 'Герой не найден.' : 'Hero not found.',
          reply_markup: { inline_keyboard: [] },
          method: 'sendMessage'
        };
      }

      const heroData = heroTranslations[classId]?.heroes[heroId];
      const heroName = heroData ? heroData[language] : 'Unknown Hero';
      const paramLabels = {
        level: language === 'RU' ? 'уровень' : 'level',
        strength: language === 'RU' ? 'силу' : 'strength',
        winPercentage: language === 'RU' ? 'процент побед' : 'win percentage',
        battlesPlayed: language === 'RU' ? 'количество битв' : 'battles played',
        heroesKilled: language === 'RU' ? 'убито героев' : 'heroes killed',
        heroesRevived: language === 'RU' ? 'воскрешено героев' : 'heroes revived'
      };
      const label = paramLabels[parameter] || parameter;

      let updateData = { updatedAt: new Date() };
      switch (parameter) {
        case 'level':
        case 'strength':
        case 'battlesPlayed':
        case 'heroesKilled':
        case 'heroesRevived': {
          const value = validateNumber(text, label, language, 0);
          if (typeof value === 'string') {
            return {
              text: value,
              reply_markup: { inline_keyboard: [] },
              method: 'sendMessage'
            };
          }
          updateData[parameter] = value;
          break;
        }
        case 'winPercentage': {
          const value = validateNumber(text, label, language, 0, 100);
          if (typeof value === 'string') {
            return {
              text: value,
              reply_markup: { inline_keyboard: [] },
              method: 'sendMessage'
            };
          }
          updateData[parameter] = value;
          break;
        }
      }

      await Hero.updateOne({ userId, classId, heroId }, updateData);
      const updatedHero = await Hero.findOne({ userId, classId, heroId }).lean();
      const heroesText = formatHeroesText([updatedHero], classId, heroTranslations, language, (val) => val.toFixed(2));

      clearGlobalStates(userId);
      return {
        text: language === 'RU' ? `✅ ${label} для ${heroName} обновлён!\n\n${heroesText}` : `✅ ${label} for ${heroName} updated!\n\n${heroesText}`,
        reply_markup: { inline_keyboard: createHeroViewKeyboard(language, classId, heroId, updatedHero.isPrimary) },
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
    }

    console.warn(`Unknown heroes data: ${data}, userId=${userId}`);
    return {
      text: language === 'RU' ? 'Используйте меню ниже:' : 'Use the menu below:',
      reply_markup: { inline_keyboard: [] },
      method: 'sendMessage'
    };
  } catch (error) {
    console.error(`Error in heroes handler: userId=${userId}, data=${data}`, error.stack);
    return {
      text: language === 'RU' ? 'Произошла ошибка.' : 'An error occurred.',
      reply_markup: { inline_keyboard: [] },
      method: 'sendMessage'
    };
  }
};