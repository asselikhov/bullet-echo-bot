const heroTranslations = require('../constants/heroes');

const getMainReplyKeyboard = (language) => {
  const isRU = language === 'RU';
  const keyboard = {
    keyboard: [
      [
        { text: isRU ? 'ЛК' : 'Profile' },
        { text: isRU ? 'Рейтинг' : 'Rating' },
        { text: isRU ? 'Настройки' : 'Settings' }
      ],
      [
        { text: isRU ? 'Герои' : 'Heroes' },
        { text: isRU ? 'Синдикаты' : 'Syndicates' },
        { text: isRU ? 'Поиск' : 'Search' }
      ]
    ],
    resize_keyboard: true
  };
  console.log(`Generated main reply keyboard: language=${language}`, JSON.stringify(keyboard, null, 2));
  return keyboard;
};

const getMainInlineKeyboard = (language, menu = '') => {
  const isRU = language === 'RU';
  let inline_keyboard;
  if (menu === 'settings_language') {
    inline_keyboard = [
      [
        { text: isRU ? 'Русский ✅' : 'Русский', callback_data: 'language_RU' },
        { text: isRU ? 'English' : 'English ✅', callback_data: 'language_EN' }
      ]
    ];
  } else {
    inline_keyboard = [
      [
        { text: isRU ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_main' }
      ]
    ];
  }
  console.log(`Generated main inline keyboard: language=${language}, menu=${menu}`, JSON.stringify({ inline_keyboard }, null, 2));
  return { inline_keyboard };
};

const getProfileInlineKeyboard = (language, menu) => {
  const isRU = language === 'RU';
  const inline_keyboard = [
    [
      { text: isRU ? 'Редактировать профиль' : 'Edit Profile', callback_data: 'profile_edit' },
      { text: isRU ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_main' }
    ]
  ];
  console.log(`Generated profile inline keyboard: language=${language}, menu=${menu}`, JSON.stringify({ inline_keyboard }, null, 2));
  return { inline_keyboard };
};

const getHeroesInlineKeyboard = (language, menu, includeBackButton = true) => {
  const isRU = language === 'RU';
  let inlineKeyboard = [];

  if (menu === 'menu_heroes') {
    if (!heroTranslations || Object.keys(heroTranslations).length === 0) {
      console.warn(`heroTranslations is empty or undefined: language=${language}, menu=${menu}`);
      inlineKeyboard = [[
        { text: isRU ? 'Классы героев недоступны' : 'Hero classes unavailable', callback_data: 'menu_main' }
      ]];
    } else {
      inlineKeyboard = Object.entries(heroTranslations).map(([classId, { classNames }]) => {
        const className = classNames[language] || classId;
        return [{ text: className, callback_data: `heroes_class_${classId}` }];
      });
      if (includeBackButton) {
        inlineKeyboard.push([{ text: isRU ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_main' }]);
      }
    }
  } else {
    inlineKeyboard = [
      [
        { text: isRU ? 'Добавить героя' : 'Add Hero', callback_data: `add_hero_select_${menu.replace('heroes_class_', '')}` },
        { text: isRU ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_heroes' }
      ]
    ];
  }

  console.log(`Generated heroes inline keyboard: language=${language}, menu=${menu}, includeBackButton=${includeBackButton}, heroTranslationsKeys=${Object.keys(heroTranslations)}, inlineKeyboard=${JSON.stringify(inlineKeyboard, null, 2)}`);
  return { inline_keyboard: inlineKeyboard };
};

module.exports = {
  getMainReplyKeyboard,
  getMainInlineKeyboard,
  getProfileInlineKeyboard,
  getHeroesInlineKeyboard
};