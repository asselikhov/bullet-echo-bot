const User = require('../models/User');
const mainMenuHandler = require('./mainMenu');

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
        language: null,
        trophies: 0,
        valorPath: 0
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
    } else {
      // Пользователь существует, показываем главное меню независимо от registrationStep
      console.log(`User ${chatId} found, registrationStep: ${user.registrationStep}, redirecting to main menu`);
      if (!user.language) {
        // Устанавливаем язык по умолчанию, если не задан
        user.language = 'RU';
        await user.save();
        console.log(`User ${chatId} language set to default: ${user.language}`);
      }
      await mainMenuHandler(bot, msg);
    }
  } catch (error) {
    console.error('Error in start handler:', error.stack);
    bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже / An error occurred. Try again later.');
  }
};