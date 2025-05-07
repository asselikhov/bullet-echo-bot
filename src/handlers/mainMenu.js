const User = require('../models/User');
const heroTranslations = require('../constants/heroes');

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const data = query ? query.data : null;
  const user = await User.findOne({ telegramId: chatId.toString() });

  if (!user) {
    bot.sendMessage(chatId, user.language === 'RU' ? 'Пожалуйста, начните с /start.' : 'Please start with /start.');
    return;
  }

  try {
    if (data === 'menu_profile') {
      console.log('User data:', {
        ...user.toObject(),
        trophies: user.trophies,
        valorPath: user.valorPath,
        telegramUsername: user.telegramUsername
      }); // Отладочный лог с telegramUsername
      const fields = user.language === 'RU' ?
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

      let profileText = user.language === 'RU' ? '📋 Личный кабинет\n➖➖➖➖➖➖➖➖➖➖➖\n' : '📋 Profile\n━━━━━━━━━━━━━━━\n';
      let hasFields = false;
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
          profileText += `${key}: ${value || (user.language === 'RU' ? 'Не указано' : 'Not set')}\n`;
          hasFields = true;
        }
      }

      if (!hasFields) {
        profileText = user.language === 'RU' ? '⚠️ Профиль пуст. Завершите регистрацию.' : '⚠️ Profile is empty. Complete registration.';
      }

      bot.sendMessage(chatId, profileText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: user.language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: 'profile_edit' }],
          ],
        },
      });
    } else if (data === 'menu_heroes') {
      const classes = Object.keys(heroTranslations).map(classId => ({
        id: classId,
        name: heroTranslations[classId].classNames[user.language],
      }));

      bot.sendMessage(chatId, user.language === 'RU' ? 'Выберите класс героев:' : 'Select hero class:', {
        reply_markup: {
          inline_keyboard: classes.map(cls => [{ text: cls.name, callback_data: `heroes_class_${cls.id}` }]),
        },
      });
    }
  } catch (error) {
    console.error('Error in mainMenu handler:', error);
    bot.sendMessage(chatId, user.language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
};