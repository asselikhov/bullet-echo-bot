const User = require('../models/User');
const { getMainReplyKeyboard, getMainInlineKeyboard } = require('../utils/keyboards');
const { clearGlobalStates } = require('../utils/helpers');

const registrationSteps = [
  'telegramUsername',
  'language',
  'nickname',
  'userId',
  'trophies',
  'valorPath',
  'syndicate',
  'name',
  'age',
  'gender',
  'country',
  'city'
];

const getResponseForStep = async (user, step, ctx, data, text) => {
  const userId = ctx.from.id.toString();
  console.log(`Registration handler: userId=${userId}, text="${text}", data="${data}"`);

  if (!user) {
    console.log(`Creating new user: telegramId=${userId}`);
    user = await User.create({
      telegramId: userId,
      telegramUsername: ctx.from.username ? `@${ctx.from.username}` : null,
      registrationStep: 'telegramUsername',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log(`New user created: telegramId=${userId}, step=${user.registrationStep}`);
  }

  const language = user.language || ctx.language || 'RU';
  const isCallback = data && data !== 'undefined';
  const isInitialStep = ['telegramUsername', 'language'].includes(step);

  const responses = {
    telegramUsername: async () => {
      if (user.telegramUsername) {
        await User.updateOne({ telegramId: userId }, { registrationStep: 'language', updatedAt: new Date() });
        const replyMarkup = {
          inline_keyboard: [
            [{ text: 'Русский', callback_data: 'language_RU' }],
            [{ text: 'English', callback_data: 'language_EN' }]
          ],
          resize_keyboard: true
        };
        console.log(`Generated reply_markup for telegramUsername:`, JSON.stringify(replyMarkup, null, 2));
        return {
          text: '🇷🇺 Пожалуйста, выберите язык:\n🇬🇧 Please select a language:',
          reply_markup: replyMarkup,
          parse_mode: 'HTML'
        };
      }
      return {
        text: '🇷🇺 Пожалуйста, укажите ваш Telegram username.\n🇬🇧 Please specify your Telegram username.',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    language: async () => {
      if (isCallback && data.startsWith('language_')) {
        const newLanguage = data.split('_')[1];
        await User.updateOne(
            { telegramId: userId },
            { language: newLanguage, registrationStep: 'nickname', updatedAt: new Date() }
        );
        console.log(`User ${userId} selected language: ${newLanguage}`);
        if (ctx.message) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
            console.log(`Old message deleted: message_id=${ctx.message.message_id}`);
          } catch (error) {
            console.warn(`Failed to delete message: ${error.message}`);
          }
        }
        return {
          text: newLanguage === 'RU' ? 'Введите никнейм игрового аккаунта (любые символы, минимум 1):' : 'Enter your game account nickname (any characters, minimum 1):',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      const replyMarkup = {
        inline_keyboard: [
          [{ text: 'Русский', callback_data: 'language_RU' }],
          [{ text: 'English', callback_data: 'language_EN' }]
        ],
        resize_keyboard: true
      };
      console.log(`Generated reply_markup for language:`, JSON.stringify(replyMarkup, null, 2));
      return {
        text: '🇷🇺 Пожалуйста, выберите язык:\n🇬🇧 Please select a language:',
        reply_markup: replyMarkup,
        parse_mode: 'HTML'
      };
    },
    nickname: async () => {
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { nickname: text.trim(), registrationStep: 'userId', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите ваш ID игрока (буквы и цифры, например, 5X5R8ZN):' : 'Enter your player ID (letters and numbers, e.g., 5X5R8ZN):',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Никнейм не может быть пустым. Введите никнейм:' : 'Nickname cannot be empty. Enter nickname:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    userId: async () => {
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { userId: text.trim(), registrationStep: 'trophies', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите количество трофеев (целое число):' : 'Enter the number of trophies (integer):',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'ID игрока не может быть пустым. Введите ID:' : 'Player ID cannot be empty. Enter ID:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    trophies: async () => {
      const trophiesValue = parseInt(text, 10);
      if (text && !isNaN(trophiesValue) && trophiesValue >= 0) {
        await User.updateOne(
            { telegramId: userId },
            { trophies: trophiesValue, registrationStep: 'valorPath', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите уровень пути доблести (целое число) или нажмите "Пропустить":' : 'Enter your Valor Path level (integer) or press "Skip":',
          reply_markup: {
            inline_keyboard: [[{ text: language === 'RU' ? 'Пропустить' : 'Skip', callback_data: 'skip_valorPath' }]],
            resize_keyboard: true
          },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Количество трофеев должно быть неотрицательным числом. Введите трофеи:' : 'Number of trophies must be non-negative. Enter trophies:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    valorPath: async () => {
      if (isCallback && data === 'skip_valorPath') {
        await User.updateOne(
            { telegramId: userId },
            { valorPath: null, registrationStep: 'syndicate', updatedAt: new Date() }
        );
        if (ctx.message) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
            console.log(`Old message deleted: message_id=${ctx.message.message_id}`);
          } catch (error) {
            console.warn(`Failed to delete message: ${error.message}`);
          }
        }
        return {
          text: language === 'RU' ? 'Введите название синдиката или нажмите "Пропустить":' : 'Enter syndicate name or press "Skip":',
          reply_markup: {
            inline_keyboard: [[{ text: language === 'RU' ? 'Пропустить' : 'Skip', callback_data: 'skip_syndicate' }]],
            resize_keyboard: true
          },
          parse_mode: 'HTML'
        };
      }
      const valorPathValue = parseInt(text, 10);
      if (text && !isNaN(valorPathValue) && valorPathValue >= 0) {
        await User.updateOne(
            { telegramId: userId },
            { valorPath: valorPathValue, registrationStep: 'syndicate', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите название синдиката или нажмите "Пропустить":' : 'Enter syndicate name or press "Skip":',
          reply_markup: {
            inline_keyboard: [[{ text: language === 'RU' ? 'Пропустить' : 'Skip', callback_data: 'skip_syndicate' }]],
            resize_keyboard: true
          },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Уровень пути доблести должен быть неотрицательным числом или пропущен. Введите уровень:' : 'Valor Path level must be non-negative or skipped. Enter level:',
        reply_markup: {
          inline_keyboard: [[{ text: language === 'RU' ? 'Пропустить' : 'Skip', callback_data: 'skip_valorPath' }]],
          resize_keyboard: true
        },
        parse_mode: 'HTML'
      };
    },
    syndicate: async () => {
      if (isCallback && data === 'skip_syndicate') {
        await User.updateOne(
            { telegramId: userId },
            { syndicate: null, registrationStep: 'name', updatedAt: new Date() }
        );
        if (ctx.message) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
            console.log(`Old message deleted: message_id=${ctx.message.message_id}`);
          } catch (error) {
            console.warn(`Failed to delete message: ${error.message}`);
          }
        }
        return {
          text: language === 'RU' ? 'Введите ваше имя:' : 'Enter your name:',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { syndicate: text.trim(), registrationStep: 'name', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите ваше имя:' : 'Enter your name:',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Введите название синдиката или нажмите "Пропустить":' : 'Enter syndicate name or press "Skip":',
        reply_markup: {
          inline_keyboard: [[{ text: language === 'RU' ? 'Пропустить' : 'Skip', callback_data: 'skip_syndicate' }]],
          resize_keyboard: true
        },
        parse_mode: 'HTML'
      };
    },
    name: async () => {
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { name: text.trim(), registrationStep: 'age', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите ваш возраст (целое число):' : 'Enter your age (integer):',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Имя не может быть пустым. Введите имя:' : 'Name cannot be empty. Enter name:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    age: async () => {
      const ageValue = parseInt(text, 10);
      if (text && !isNaN(ageValue) && ageValue > 0) {
        await User.updateOne(
            { telegramId: userId },
            { age: ageValue, registrationStep: 'gender', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Выберите ваш пол:' : 'Select your gender:',
          reply_markup: {
            inline_keyboard: language === 'RU'
                ? [
                  [{ text: 'М', callback_data: 'gender_M' }],
                  [{ text: 'Ж', callback_data: 'gender_F' }]
                ]
                : [
                  [{ text: 'Male', callback_data: 'gender_M' }],
                  [{ text: 'Female', callback_data: 'gender_F' }]
                ],
            resize_keyboard: true
          },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Возраст должен быть положительным числом. Введите возраст:' : 'Age must be a positive number. Enter age:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    gender: async () => {
      if (isCallback && data.startsWith('gender_')) {
        const genderValue = data.split('_')[1];
        await User.updateOne(
            { telegramId: userId },
            { gender: genderValue, registrationStep: 'country', updatedAt: new Date() }
        );
        if (ctx.message) {
          try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
            console.log(`Old message deleted: message_id=${ctx.message.message_id}`);
          } catch (error) {
            console.warn(`Failed to delete message: ${error.message}`);
          }
        }
        return {
          text: language === 'RU' ? 'Введите вашу страну:' : 'Enter your country:',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Выберите ваш пол:' : 'Select your gender:',
        reply_markup: {
          inline_keyboard: language === 'RU'
              ? [
                [{ text: 'М', callback_data: 'gender_M' }],
                [{ text: 'Ж', callback_data: 'gender_F' }]
              ]
              : [
                [{ text: 'Male', callback_data: 'gender_M' }],
                [{ text: 'Female', callback_data: 'gender_F' }]
              ],
          resize_keyboard: true
        },
        parse_mode: 'HTML'
      };
    },
    country: async () => {
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { country: text.trim(), registrationStep: 'city', updatedAt: new Date() }
        );
        return {
          text: language === 'RU' ? 'Введите ваш город:' : 'Enter your city:',
          reply_markup: { remove_keyboard: true },
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Страна не может быть пустой. Введите страну:' : 'Country cannot be empty. Enter country:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    },
    city: async () => {
      if (text && text.trim()) {
        await User.updateOne(
            { telegramId: userId },
            { city: text.trim(), registrationStep: 'completed', updatedAt: new Date() }
        );
        clearGlobalStates(userId);
        const replyMarkup = {
          keyboard: getMainReplyKeyboard(language).keyboard,
          resize_keyboard: true,
          inline_keyboard: getMainInlineKeyboard(language)
        };
        console.log(`Generated reply_markup for completed:`, JSON.stringify(replyMarkup, null, 2));
        return {
          text: language === 'RU' ? 'Регистрация завершена! ✅' : 'Registration completed! ✅',
          reply_markup: replyMarkup,
          parse_mode: 'HTML'
        };
      }
      return {
        text: language === 'RU' ? 'Город не может быть пустым. Введите город:' : 'City cannot be empty. Enter city:',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    }
  };

  return responses[step] ? await responses[step]() : null;
};

module.exports = async (bot, ctx, query, userFromMiddleware) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message?.text;
  const data = query?.data || 'undefined';

  try {
    let user = userFromMiddleware || (await User.findOne({ telegramId: userId }).lean());
    const response = await getResponseForStep(user, user?.registrationStep || 'telegramUsername', ctx, data, text);

    if (!response) {
      console.warn(`No response for step: ${user?.registrationStep}, userId=${userId}`);
      return {
        text: '🇷🇺 Ошибка регистрации. Попробуйте снова.\n🇬🇧 Registration error. Please try again.',
        reply_markup: { remove_keyboard: true },
        parse_mode: 'HTML'
      };
    }

    console.log(`Returning response for step ${user?.registrationStep}:`, JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error(`Error in registration handler: userId=${userId}, data=${data}`, error.stack);
    return {
      text: '🇷🇺 Произошла ошибка. Попробуйте позже.\n🇬🇧 An error occurred. Try again later.',
      reply_markup: { remove_keyboard: true },
      parse_mode: 'HTML'
    };
  }
};