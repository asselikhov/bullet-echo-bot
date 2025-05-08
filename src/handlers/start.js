const User = require('../models/User');

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  console.log(`Processing /start command for user: ${userId}, chat type: ${msg.chat.type}`);

  // Проверяем, что команда вызвана в личном чате
  if (msg.chat.type !== 'private') {
    console.log(`Ignoring /start in non-private chat (chatId: ${chatId})`);
    bot.sendMessage(chatId, '🇷🇺 Команда /start доступна только в личных чатах с ботом. 🇬🇧 The /start command is only available in private chats with the bot.');
    return;
  }

  try {
    let user = await User.findOne({ telegramId: userId });

    if (!user) {
      // Новый пользователь, начинаем регистрацию
      console.log(`Creating new user for telegramId: ${userId}`);
      user = await User.create({
        telegramId: userId,
        telegramUsername: msg.from.username ? `@${msg.from.username}` : null,
        registrationStep: 'language',
        language: 'RU' // Значение по умолчанию
      });
      const welcomeMessage = '🇷🇺 Выберите язык / 🇬🇧 Choose language:';
      bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🇷🇺 Русский (RU)', callback_data: 'language_RU' }],
            [{ text: '🇬🇧 English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
      console.log(`Sent welcome message to chatId: ${chatId}, text: "${welcomeMessage}"`);
    } else if (user.registrationStep !== 'completed') {
      // Пользователь в процессе регистрации
      console.log(`User ${userId} is in registration step: ${user.registrationStep}`);
      bot.sendMessage(chatId, user.language === 'RU' ?
              '🇷🇺 Пожалуйста, завершите регистрацию. Выберите язык:' :
              '🇬🇧 Please complete registration. Choose language:',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🇷🇺 Русский (RU)', callback_data: 'language_RU' }],
                [{ text: '🇬🇧 English (EN)', callback_data: 'language_EN' }],
              ],
            },
          });
      console.log(`Sent registration continuation message to chatId: ${chatId}`);
    } else {
      // Пользователь зарегистрирован, показываем клавиатуру
      console.log(`User ${userId} is already registered, showing reply keyboard`);
      const welcomeMessage = user.language === 'RU' ?
          `🇷🇺 С возвращением, ${user.nickname || 'игрок'}!\nВыберите действие:\nДоступные команды: ЛК, Рейтинг, Настройки, Герои, Синдикаты, Поиск` :
          `🇬🇧 Welcome back, ${user.nickname || 'player'}!\nChoose an action:\nAvailable commands: Profile, Rating, Settings, Heroes, Syndicates, Search`;

      bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: {
          keyboard: [
            [user.language === 'RU' ? 'ЛК' : 'Profile', user.language === 'RU' ? 'Рейтинг' : 'Rating', user.language === 'RU' ? 'Настройки' : 'Settings'],
            [user.language === 'RU' ? 'Герои' : 'Heroes', user.language === 'RU' ? 'Синдикаты' : 'Syndicates', user.language === 'RU' ? 'Поиск' : 'Search'],
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        },
      });
      console.log(`Sent welcome back message to chatId: ${chatId}, text: "${welcomeMessage}"`);
    }
  } catch (error) {
    console.error(`Error in startHandler for user ${userId}:`, error.stack);
    bot.sendMessage(chatId, '🇷🇺 Произошла ошибка. Попробуйте позже. 🇬🇧 An error occurred. Try again later.');
    console.log(`Sent error message to chatId: ${chatId}`);
  }
};