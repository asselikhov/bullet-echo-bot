const User = require('../models/User');

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const data = query.data;

  try {
    const user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
      bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start.');
      return;
    }

    if (data === 'settings_language') {
      bot.sendMessage(chatId, user.language === 'RU' ? 'Выберите язык:' : 'Choose language:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Русский (RU)', callback_data: 'language_RU' }],
            [{ text: 'English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
    } else if (data === 'language_RU' || data === 'language_EN') {
      const language = data.split('_')[1];
      user.language = language;
      if (user.registrationStep === 'language') {
        user.registrationStep = 'nickname';
      }
      await user.save();
      console.log(`Language updated to ${user.language} for user ${user.telegramId}`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Язык изменён на русский!' : 'Language changed to English!', {
        reply_markup: {
          keyboard: [
            [user.language === 'RU' ? 'ЛК' : 'Profile', user.language === 'RU' ? 'Рейтинг' : 'Rating', user.language === 'RU' ? 'Настройки' : 'Settings'],
            [user.language === 'RU' ? 'Герои' : 'Heroes', user.language === 'RU' ? 'Синдикаты' : 'Syndicates', user.language === 'RU' ? 'Поиск' : 'Search'],
          ],
          resize_keyboard: true,
        },
      });
    }
  } catch (error) {
    console.error('Error in settings handler:', error.stack);
    bot.sendMessage(chatId, user.language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.');
  }
};