const User = require('../models/User');
const { getMainReplyKeyboard, getMainInlineKeyboard } = require('../utils/keyboards');
const { clearGlobalStates } = require('../utils/helpers');

const createLanguageKeyboard = (language) => {
  const keyboard = {
    resize_keyboard: true,
    inline_keyboard: [
      [{ text: 'Русский', callback_data: 'language_RU' }],
      [{ text: 'English', callback_data: 'language_EN' }]
    ]
  };
  console.log(`Created language keyboard: language=${language}`, JSON.stringify(keyboard, null, 2));
  return keyboard;
};

module.exports = async (bot, ctx, params, user) => {
  const data = params.data;
  const userId = ctx.from.id.toString();
  const messageId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
  const language = user?.language || 'RU';

  console.log(`Settings handler: userId=${userId}, data=${data}, message_id=${messageId}`);

  try {
    if (!user) {
      console.error(`User not found: userId=${userId}`);
      return {
        text: language === 'RU' ? 'Пользователь не найден.' : 'User not found.',
        reply_markup: {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language)
        },
        parse_mode: 'HTML'
      };
    }

    // Проверка завершения регистрации
    if (user.registrationStep !== 'completed') {
      console.warn(`User ${userId} has not completed registration. Cannot change language.`);
      return {
        text: language === 'RU' ? 'Пожалуйста, завершите регистрацию.' : 'Please complete registration.',
        reply_markup: {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language)
        },
        parse_mode: 'HTML'
      };
    }

    if (data === 'settings_language') {
      const reply_markup = createLanguageKeyboard(language);
      const response = {
        text: language === 'RU' ? 'Выберите язык:' : 'Select language:',
        reply_markup: reply_markup,
        parse_mode: 'HTML',
        method: 'sendMessage'
      };
      console.log(`Returning language selection response: userId=${userId}`, JSON.stringify(response, null, 2));
      return response;
    }

    if (data === 'language_RU' || data === 'language_EN') {
      const newLanguage = data === 'language_RU' ? 'RU' : 'EN';
      await User.updateOne(
          { telegramId: userId },
          { language: newLanguage, updatedAt: new Date() }
      );

      clearGlobalStates(userId);
      console.log(`Language changed for user ${userId} to ${newLanguage}`);

      const replyMarkup = {
        keyboard: getMainReplyKeyboard(newLanguage).keyboard,
        resize_keyboard: true,
        inline_keyboard: getMainInlineKeyboard(newLanguage)
      };

      console.log(`Reply keyboard for language change: ${JSON.stringify(replyMarkup, null, 2)}`);

      const welcomeText = newLanguage === 'RU'
          ? 'Язык изменён на русский!'
          : 'Language changed to English!';

      if (ctx.callbackQuery) {
        // Удаляем старое сообщение
        try {
          await bot.telegram.deleteMessage(
              ctx.callbackQuery.message.chat.id,
              ctx.callbackQuery.message.message_id
          );
          console.log(`Old message deleted: message_id=${ctx.callbackQuery.message.message_id}`);
        } catch (deleteError) {
          console.warn(`Failed to delete message: message_id=${ctx.callbackQuery.message.message_id}`, deleteError.stack);
          await bot.telegram.sendMessage(
              ctx.callbackQuery.message.chat.id,
              newLanguage === 'RU' ? 'Не удалось удалить старое сообщение.' : 'Failed to delete old message.',
              { parse_mode: 'HTML' }
          );
        }
      }

      // Отправляем одно сообщение с главным меню
      const response = {
        text: welcomeText,
        reply_markup: replyMarkup,
        method: 'sendMessage',
        parse_mode: 'HTML'
      };
      console.log(`Returning language change response: userId=${userId}`, JSON.stringify(response, null, 2));
      return response;
    }

    console.warn(`Unknown settings data: ${data}, userId=${userId}`);
    return {
      text: language === 'RU' ? 'Используйте меню ниже:' : 'Use the menu below:',
      reply_markup: {
        keyboard: getMainReplyKeyboard(language).keyboard,
        resize_keyboard: true,
        inline_keyboard: getMainInlineKeyboard(language)
      },
      parse_mode: 'HTML'
    };
  } catch (error) {
    console.error(`Error in settings handler: userId=${userId}, data=${data}`, error.stack);
    return {
      text: language === 'RU' ? '❌ Произошла ошибка.' : '❌ An error occurred.',
      reply_markup: {
        keyboard: getMainReplyKeyboard(language).keyboard,
        resize_keyboard: true,
        inline_keyboard: getMainInlineKeyboard(language)
      },
      parse_mode: 'HTML'
    };
  }
};