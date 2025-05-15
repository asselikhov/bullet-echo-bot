const User = require('../models/User');
const Hero = require('../models/Hero');
const { formatProfileText, formatHeroesText, handleError } = require('../utils/helpers');
const { getMainReplyKeyboard, getProfileInlineKeyboard, getHeroesInlineKeyboard } = require('../utils/keyboards');
const heroTranslations = require('../constants/heroes');

module.exports = async (bot, ctx, { data }, user) => {
  const userId = ctx.from.id.toString();
  const language = user.language || 'RU';
  const isCallback = !!ctx.callbackQuery;

  try {
    if (data === 'menu_main') {
      return {
        text: language === 'RU' ? 'Добро пожаловать в главное меню!' : 'Welcome to the main menu!',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true
        }
      };
    }

    if (data === 'menu_profile') {
      let profileText = formatProfileText(user, language);
      if (profileText.length > 4000) {
        profileText = profileText.slice(0, 3900) + '\n... (сокращено)';
      }
      const replyMarkup = {
        inline_keyboard: [[{ text: language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: 'profile_edit' }]]
      };
      console.log(`Sending profile: userId=${userId}, text=${profileText.slice(0, 100)}..., replyMarkup=${JSON.stringify(replyMarkup)}`);

      const response = {
        text: profileText,
        disable_web_page_preview: true,
        reply_markup: replyMarkup
      };

      if (isCallback) {
        response.method = 'editMessageText';
        response.message_id = ctx.callbackQuery.message.message_id;
      }

      return response;
    }

    if (data === 'menu_heroes') {
      let keyboardObj = getHeroesInlineKeyboard(language, 'menu_heroes');
      let inlineKeyboard = keyboardObj.inline_keyboard; // Извлекаем массив inline_keyboard
      // Фильтруем кнопку "Назад"
      inlineKeyboard = inlineKeyboard.filter(row =>
          !row.some(button => button.callback_data === 'menu_main')
      );
      console.log(`Sending heroes menu: userId=${userId}, replyMarkup=${JSON.stringify({ inline_keyboard: inlineKeyboard })}`);
      const response = {
        text: language === 'RU' ? 'Выберите класс героев:' : 'Select a hero class:',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: inlineKeyboard }
      };

      if (isCallback) {
        response.method = 'editMessageText';
        response.message_id = ctx.callbackQuery.message.message_id;
      }

      return response;
    }

    if (data === 'menu_rating') {
      return {
        text: language === 'RU' ? 'Рейтинг пока недоступен.' : 'Rating is not available yet.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true
        }
      };
    }

    if (data === 'menu_syndicates') {
      return {
        text: language === 'RU' ? 'Синдикаты пока недоступны.' : 'Syndicates are not available yet.',
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true
        }
      };
    }

    console.warn(`Unknown menu data: ${data}, userId=${userId}`);
    return {
      text: language === 'RU' ? 'Неизвестная команда.' : 'Unknown command.',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        keyboard: getMainReplyKeyboard(language).keyboard,
        resize_keyboard: true
      }
    };
  } catch (error) {
    console.error(`Error in mainMenu handler: userId=${userId}, data=${data}`, error.stack);
    return handleError(ctx, error, language);
  }
};