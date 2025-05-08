const User = require('../models/User');

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  try {
    let user = await User.findOne({ telegramId: userId });
    if (!user) {
      bot.sendMessage(chatId, 'Please start with /start.');
      return;
    }

    // Handle callback query if it exists
    if (query && query.data) {
      const data = query.data;
      console.log(`Processing settings callback: ${data}`);

      if (data.startsWith('language_')) {
        const newLanguage = data.split('_')[1];
        user.language = newLanguage;
        await user.save();
        console.log(`Language updated to ${newLanguage} for user ${userId}`);
        bot.sendMessage(chatId, newLanguage === 'RU' ? 'Язык обновлен на Русский!' : 'Language updated to English!');
        return;
      }
    }

    // Handle settings command or menu option
    const settingsMessage = user.language === 'RU' ?
        '🇷🇺 Настройки:\nВыберите язык:' :
        '🇬🇧 Settings:\nChoose language:';
    bot.sendMessage(chatId, settingsMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇷🇺 Русский (RU)', callback_data: 'language_RU' }],
          [{ text: '🇬🇧 English (EN)', callback_data: 'language_EN' }],
        ],
      },
    });
  } catch (error) {
    console.error(`Error in settingsHandler for user ${userId}:`, error.stack);
    bot.sendMessage(chatId, '🇷🇺 Произошла ошибка. Попробуйте позже. 🇬🇧 An error occurred. Try again later.');
  }
};