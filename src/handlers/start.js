const User = require('../models/User');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;

  // Проверяем, что команда вызвана в личном чате
  if (msg.chat.type !== 'private') {
    bot.sendMessage(chatId, 'Команда /start доступна только в личных чатах с ботом. / The /start command is only available in private chats with the bot.');
    return;
  }

  try {
    const user = await User.findOne({ telegramId: chatId.toString() });

    if (!user) {
      await User.create({
        telegramId: chatId.toString(),
        telegramUsername: msg.from.username ? `@${msg.from.username}` : null,
        registrationStep: 'language'
      });
      bot.sendMessage(chatId, 'Выберите язык / Choose language:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Русский (RU)', callback_data: 'language_RU' }],
            [{ text: 'English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
    } else if (user.registrationStep !== 'completed') {
      bot.sendMessage(chatId, user.language === 'RU' ? 'Пожалуйста, завершите регистрацию.' : 'Please complete registration.');
    } else {
      bot.sendMessage(chatId, user.language === 'RU' ? 'Добро пожаловать!' : 'Welcome!', {
        reply_markup: {
          keyboard: [
            [user.language === 'RU' ? 'ЛК' : 'Profile'],
            [user.language === 'RU' ? 'Настройки' : 'Settings'],
            [user.language === 'RU' ? 'Герои' : 'Heroes'],
          ],
          resize_keyboard: true,
        },
      });
    }
  } catch (error) {
    console.error('Error in start handler:', error);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже / An error occurred. Try again later.');
  }
};