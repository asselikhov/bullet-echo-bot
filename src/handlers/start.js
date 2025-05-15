const User = require('../models/User');
const { getMainReplyKeyboard } = require('../utils/keyboards');
const { clearGlobalStates } = require('../utils/helpers');
const registrationHandler = require('./registration');

module.exports = async (bot, ctx) => {
  const userId = ctx.from.id.toString();
  const messageId = ctx.message.message_id;
  console.log(`Start handler: userId=${userId}`);

  if (ctx.chat.type !== 'private') {
    return {
      text: '🇷🇺 Команда доступна только в личном чате.\n🇬🇧 Command is only available in a private chat.',
      reply_markup: { remove_keyboard: true },
      parse_mode: 'HTML'
    };
  }

  try {
    let user = await User.findOne({ telegramId: userId }).lean();

    clearGlobalStates(userId);

    if (user && user.registrationStep === 'completed') {
      console.log(`User ${userId} already registered, entering main menu`);
      const language = user.language || 'RU';
      const replyMarkup = {
        keyboard: getMainReplyKeyboard(language).keyboard,
        resize_keyboard: true
      };
      return {
        text: language === 'RU' ? 'Добро пожаловать в главное меню!' : 'Welcome to the main menu!',
        reply_markup: replyMarkup,
        parse_mode: 'HTML'
      };
    }

    console.log(`User ${userId} not fully registered, redirecting to registration`);
    return await registrationHandler(bot, ctx);
  } catch (error) {
    console.error(`Error in start handler: userId=${userId}`, error.stack);
    return {
      text: '🇷🇺 Произошла ошибка. Попробуйте позже.\n🇬🇧 An error occurred. Try again later.',
      reply_markup: { remove_keyboard: true },
      parse_mode: 'HTML'
    };
  }
};