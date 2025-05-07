const User = require('../models/User');
const heroTranslations = require('../constants/heroes');

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const data = query ? query.data : null;
  const user = await User.findOne({ telegramId: msg.from.id.toString() });

  if (!user) {
    bot.sendMessage(chatId, user?.language === 'RU' ? 'Пожалуйста, начните с /start.' : 'Please start with /start.');
    return;
  }

  const language = user.language || 'RU';

  try {
    if (data === 'menu_profile') {
      console.log('User data:', {
        ...user.toObject(),
        trophies: user.trophies,
        valorPath: user.valorPath,
        telegramUsername: user.telegramUsername
      }); // Отладочный лог с telegramUsername
      const fields = language === 'RU' ?
          {
            'Telegram': user.telegramUsername || `@${user.telegramId}`,
            'Никнейм': user.nickname,
            'ID игрока': user.userId,
            'Трофеи': user.trophies,
            'Путь доблести': user.valorPath,
            'Синдикат': user.syndicate,
            'Имя': user.name,
            'Возраст': user.age,
            'Пол': user.gender,
            'Страна': user.country,
            'Город': user.city
          } :
          {
            'Telegram': user.telegramUsername || `@${user.telegramId}`,
            'Nickname': user.nickname,
            'User ID': user.userId,
            'Trophies': user.trophies,
            'Valor Path': user.valorPath,
            'Syndicate': user.syndicate,
            'Name': user.name,
            'Age': user.age,
            'Gender': user.gender,
            'Country': user.country,
            'City': user.city
          };

      let profileText = language === 'RU' ? '📋 Личный кабинет\n➖➖➖➖➖➖➖➖➖➖➖\n' : '📋 Profile\n━━━━━━━━━━━━━━━\n';
      let hasFields = false;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
          profileText += `${key}: ${value || (language === 'RU' ? 'Не указано' : 'Not set')}\n`;
          hasFields = true;
        }
      }

      if (!hasFields) {
        profileText = language === 'RU' ? '⚠️ Профиль пуст. Завершите регистрацию.' : '⚠️ Profile is empty. Complete registration.';
      }

      bot.sendMessage(chatId, profileText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: 'profile_edit' }],
            [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_back' }],
          ],
        },
      });
    } else if (data === 'menu_heroes') {
      const classes = Object.keys(heroTranslations).map(classId => ({
        id: classId,
        name: heroTranslations[classId].classNames[language],
      }));

      bot.sendMessage(chatId, language === 'RU' ? 'Выберите класс героев:' : 'Select hero class:', {
        reply_markup: {
          inline_keyboard: [
            ...classes.map(cls => [{ text: cls.name, callback_data: `heroes_class_${cls.id}` }]),
            [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_back' }],
          ],
        },
      });
    } else if (data === 'menu_back') {
      // Отображаем главное меню с полным набором кнопок
      const menuText = language === 'RU' ? '🎮 Главное меню' : '🎮 Main Menu';
      console.log(`Rendering full main menu for user ${user.telegramId}`); // Отладочный лог
      const keyboard = language === 'RU' ? [
        ['ЛК', 'Рейтинг', 'Настройки'],
        ['Герои', 'Синдикаты', 'Поиск']
      ] : [
        ['Profile', 'Rating', 'Settings'],
        ['Heroes', 'Syndicates', 'Search']
      ];

      const replyMarkup = {
        reply_markup: {
          keyboard: keyboard,
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      bot.editMessageText(menuText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: replyMarkup.reply_markup
      });
    } else {
      // Отображаем главное меню с полным набором кнопок
      const menuText = language === 'RU' ? '🎮 Главное меню' : '🎮 Main Menu';
      console.log(`Rendering full main menu for user ${user.telegramId}`); // Отладочный лог
      const keyboard = language === 'RU' ? [
        ['ЛК', 'Рейтинг', 'Настройки'],
        ['Герои', 'Синдикаты', 'Поиск']
      ] : [
        ['Profile', 'Rating', 'Settings'],
        ['Heroes', 'Syndicates', 'Search']
      ];

      const replyMarkup = {
        reply_markup: {
          keyboard: keyboard,
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      // Если это callback-запрос, редактируем сообщение
      if (query && query.message) {
        bot.editMessageText(menuText, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: replyMarkup.reply_markup
        });
      } else {
        // Иначе отправляем новое сообщение
        bot.sendMessage(chatId, menuText, replyMarkup);
      }
    }
  } catch (error) {
    console.error('Error in mainMenu handler:', error.stack);
    bot.sendMessage(chatId, language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
};