const User = require('../models/User');
const Hero = require('../models/Hero');
const mainMenuHandler = require('./mainMenu');

const fieldsEN = ['nickname', 'userId', 'trophies', 'valorPath', 'syndicate', 'name', 'age', 'gender', 'country', 'city'];
const fieldsRU = ['никнейм', 'ID игрока', 'трофеи', 'путь доблести', 'синдикат', 'имя', 'возраст', 'пол', 'страна', 'город'];

const promptsEN = {
  nickname: 'Enter your nickname:',
  userId: 'Enter your user ID:',
  trophies: 'Enter your Trophies (integer, e.g., 1500):',
  valorPath: 'Enter your Valor Path points (integer, e.g., 500):',
  syndicate: 'Enter your syndicate (or type "skip" to skip):',
  name: 'Enter your name (or type "skip" to skip):',
  age: 'Enter your age (or type "skip" to skip):',
  gender: 'Enter your gender (Male/Female or type "skip" to skip):',
  country: 'Enter your country (or type "skip" to skip):',
  city: 'Enter your city (or type "skip" to skip):',
};

const promptsRU = {
  никнейм: 'Введите ваш никнейм:',
  'ID игрока': 'Введите ваш ID игрока:',
  трофеи: 'Введите количество Трофеев (целое число, например, 1500):',
  'путь доблести': 'Введите количество очков Пути доблести (целое число, например, 500):',
  синдикат: 'Введите ваш синдикат (или введите "пропустить", чтобы пропустить):',
  имя: 'Введите ваше имя (или введите "пропустить", чтобы пропустить):',
  возраст: 'Введите ваш возраст (или введите "пропустить", чтобы пропустить):',
  пол: 'Введите ваш пол (М/Ж или введите "пропустить", чтобы пропустить):',
  страна: 'Введите вашу страну (или введите "пропустить", чтобы пропустить):',
  город: 'Введите ваш город (или введите "пропустить", чтобы пропустить):',
};

module.exports = async (bot, msg, query) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const callbackData = query ? query.data : null;

  try {
    let user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
      console.error(`User not found: ${chatId}`);
      bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start.');
      return;
    }

    console.log(`Processing registration for user: ${chatId}, step: ${user.registrationStep}, input: ${text}, callback: ${callbackData}`);

    // Обработка выбора языка через callback
    if (user.registrationStep === 'language' && callbackData && (callbackData === 'language_RU' || callbackData === 'language_EN')) {
      user.language = callbackData.split('_')[1];
      user.registrationStep = user.language === 'RU' ? fieldsRU[0] : fieldsEN[0];
      await user.save();
      console.log(`User ${chatId} set language: ${user.language}, next step: ${user.registrationStep}`);
      bot.sendMessage(chatId, user.language === 'RU' ? promptsRU[fieldsRU[0]] : promptsEN[fieldsEN[0]]);
      if (query) bot.answerCallbackQuery(query.id);
      return;
    }

    // Если пользователь на шаге language, но не выбрал язык
    if (user.registrationStep === 'language') {
      console.log(`User ${chatId} on language step, prompting for language selection`);
      bot.sendMessage(chatId, 'Выберите язык / Choose language:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Русский (RU)', callback_data: 'language_RU' }],
            [{ text: 'English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
      return;
    }

    // Обработка редактирования профиля
    if (user.registrationStep.startsWith('edit_')) {
      const field = user.registrationStep.split('_')[1];
      const fields = user.language === 'RU' ? fieldsRU : fieldsEN;
      const fieldKey = fields.find(f => f.toLowerCase() === field || f === field) || field;
      if (field === 'trophies' || field === 'valorPath') {
        const value = parseInt(text);
        if (isNaN(value) || value < 0) {
          bot.sendMessage(chatId, user.language === 'RU' ? 'Введите целое неотрицательное число.' : 'Enter a non-negative integer.');
          return;
        }
        user[field] = value;
      } else {
        user[field] = text;
      }
      user.registrationStep = 'completed';
      await user.save();
      console.log(`User ${chatId} updated field: ${field}, value: ${user[field]}`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Поле обновлено!' : 'Field updated!');
      await mainMenuHandler(bot, msg, { data: 'menu_profile' });
      return;
    }

    // Обработка редактирования героя
    const hero = await Hero.findOne({ userId: chatId.toString(), registrationStep: { $exists: true } });
    if (hero) {
      hero[hero.registrationStep] = text;
      hero.registrationStep = null;
      await hero.save();
      console.log(`Hero updated for user ${chatId}, field: ${hero.registrationStep}`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Статистика героя обновлена!' : 'Hero stats updated!');
      return;
    }

    // Обработка шагов регистрации
    const fields = user.language === 'RU' ? fieldsRU : fieldsEN;
    const prompts = user.language === 'RU' ? promptsRU : promptsEN;
    const currentFieldIndex = fields.indexOf(user.registrationStep);

    if (currentFieldIndex === -1) {
      console.error(`Invalid registration step for user ${chatId}: ${user.registrationStep}`);
      user.registrationStep = 'language';
      await user.save();
      bot.sendMessage(chatId, 'Выберите язык / Choose language:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Русский (RU)', callback_data: 'language_RU' }],
            [{ text: 'English (EN)', callback_data: 'language_EN' }],
          ],
        },
      });
      return;
    }

    // Валидация ввода
    if (user.registrationStep === 'трофеи' || user.registrationStep === 'trophies' || user.registrationStep === 'путь доблести' || user.registrationStep === 'valorPath') {
      const value = parseInt(text);
      if (isNaN(value) || value < 0) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Введите целое неотрицательное число.' : 'Enter a non-negative integer.');
        return;
      }
      user[user.registrationStep] = value;
    } else if (user.registrationStep === 'никнейм' || user.registrationStep === 'nickname' || user.registrationStep === 'ID игрока' || user.registrationStep === 'userId') {
      if (!text || text.trim() === '') {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Поле обязательно для заполнения.' : 'This field is required.');
        return;
      }
      user[user.registrationStep] = text.trim();
    } else {
      // Для необязательных полей разрешаем пропуск
      if (text.toLowerCase() === 'пропустить' || text.toLowerCase() === 'skip') {
        user[user.registrationStep] = null;
      } else {
        user[user.registrationStep] = text.trim();
      }
    }

    const nextField = fields[currentFieldIndex + 1];

    if (nextField) {
      user.registrationStep = nextField;
      await user.save();
      console.log(`User ${chatId} moved to next step: ${nextField}`);
      bot.sendMessage(chatId, prompts[nextField]);
    } else {
      user.registrationStep = 'completed';
      await user.save();
      console.log(`User ${chatId} completed registration`);
      bot.sendMessage(chatId, user.language === 'RU' ? 'Регистрация завершена!' : 'Registration completed!');
      await mainMenuHandler(bot, msg);
    }
  } catch (error) {
    console.error('Error in registration handler:', error.stack);
    bot.sendMessage(chatId, 'Произошла ошибка / An error occurred.');
  }
};