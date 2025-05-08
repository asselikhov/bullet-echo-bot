const User = require('../models/User');
const registrationHandler = require('./registration');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;

  // Проверяем, что команда вызвана в личном чате
  if (msg.chat.type !== 'private') {
    bot.sendMessage(chatId, 'Команда /start доступна только в личных чатах с ботом. / The /start command is only available in private chats with the bot.');
    return;
  }

  try {
    let user = await User.findOne({ telegramId: chatId.toString() });

    if (!user) {
      // Создаём нового пользователя
      user = await User.create({
        telegramId: chatId.toString(),
        telegramUsername: msg.from.username ? `@${msg.from.username}` : null,
        registrationStep: 'language',
        language: null // Язык пока не выбран
      });
      console.log(`New user created: ${chatId}, registrationStep: ${user.registrationStep}`);
      bot.sendMessage(chatId, 'Выберите язык / Choose language:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Русский (RU)', callback_data: 'language_RU' }],
            [{ text: 'English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
    } else if (user.registrationStep === 'completed') {
      // Пользователь завершил регистрацию, показываем главное меню
      console.log(`User ${chatId} already registered, redirecting to main menu`);
      const mainMenuHandler = require('./mainMenu');
      await mainMenuHandler(bot, msg);
    } else {
      // Пользователь в процессе регистрации, перенаправляем в registrationHandler
      console.log(`User ${chatId} in registration process, step: ${user.registrationStep}`);
      await registrationHandler(bot, msg);
    }
  } catch (error) {
    console.error('Error in start handler:', error.stack);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже / An error occurred. Try again later.');
  }
};