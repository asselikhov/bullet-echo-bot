const User = require('../models/User');
const Hero = require('../models/Hero');

const fieldsEN = ['nickname', 'userId', 'trophies', 'valorPath', 'syndicate', 'name', 'age', 'gender', 'country', 'city'];
const fieldsRU = ['nickname', 'userId', 'trophies', 'valorPath', 'syndicate', 'name', 'age', 'gender', 'country', 'city'];

const promptsEN = {
  nickname: 'Enter your nickname:',
  userId: 'Enter your user ID:',
  trophies: 'Enter your Trophies (integer, e.g., 1500):',
  valorPath: 'Enter your Valor Path points (integer, e.g., 500):',
  syndicate: 'Enter your syndicate:',
  name: 'Enter your name:',
  age: 'Enter your age:',
  gender: 'Enter your gender (Male/Female):',
  country: 'Enter your country:',
  city: 'Enter your city:',
};

const promptsRU = {
  nickname: 'Введите ваш никнейм:',
  userId: 'Введите ваш ID игрока:',
  trophies: 'Введите количество Трофеев (целое число, например, 1500):',
  valorPath: 'Введите количество очков Пути доблести (целое число, например, 500):',
  syndicate: 'Введите ваш синдикат:',
  name: 'Введите ваше имя:',
  age: 'Введите ваш возраст:',
  gender: 'Введите ваш пол (М/Ж):',
  country: 'Введите вашу страну:',
  city: 'Введите ваш город:',
};

module.exports = async (bot, msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  try {
    let user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
      bot.sendMessage(chatId, 'Пожалуйста, начните с команды /start.');
      return;
    }

    console.log(`Processing registration step: ${user.registrationStep}, input: ${text}`); // Отладочный лог

    if (user.registrationStep === 'language') {
      if (text === 'language_EN' || text === 'language_RU') {
        user.language = text.split('_')[1];
        user.registrationStep = user.language === 'RU' ? fieldsRU[0] : fieldsEN[0];
        await user.save();
        console.log('User after language save:', user); // Отладочный лог
        bot.sendMessage(chatId, user.language === 'RU' ? promptsRU.nickname : promptsEN.nickname);
      } else {
        bot.sendMessage(chatId, 'Пожалуйста, выберите язык через кнопку / Please select a language using the button.');
      }
      return;
    }

    if (user.registrationStep.startsWith('edit_')) {
      const field = user.registrationStep.split('_')[1];
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
      console.log('User after edit save:', user); // Отладочный лог
      bot.sendMessage(chatId, user.language === 'RU' ? 'Поле обновлено!' : 'Field updated!', {
        reply_markup: {
          keyboard: [
            [user.language === 'RU' ? 'Личный кабинет' : 'Profile'],
            [user.language === 'RU' ? 'Настройки' : 'Settings'],
            [user.language === 'RU' ? 'Герои' : 'Heroes'],
          ],
          resize_keyboard: true,
        },
      });
      return;
    }

    const fields = user.language === 'RU' ? fieldsRU : fieldsEN;
    const prompts = user.language === 'RU' ? promptsRU : promptsEN;
    const currentFieldIndex = fields.indexOf(user.registrationStep);

    if (currentFieldIndex === -1) {
      const hero = await Hero.findOne({ userId: chatId.toString(), registrationStep: { $exists: true } });
      if (hero) {
        hero[hero.registrationStep] = text;
        hero.registrationStep = null;
        await hero.save();
        bot.sendMessage(chatId, user.language === 'RU' ? 'Статистика героя обновлена!' : 'Hero stats updated!');
      }
      return;
    }

    if (user.registrationStep === 'trophies' || user.registrationStep === 'valorPath') {
      const value = parseInt(text);
      if (isNaN(value) || value < 0) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Введите целое неотрицательное число.' : 'Enter a non-negative integer.');
        return;
      }
      user[user.registrationStep] = value;
    } else {
      user[user.registrationStep] = text;
    }

    const nextField = fields[currentFieldIndex + 1];

    if (nextField) {
      user.registrationStep = nextField;
      await user.save();
      console.log('User after field save:', user); // Отладочный лог
      bot.sendMessage(chatId, prompts[nextField]);
    } else {
      user.registrationStep = 'completed';
      await user.save();
      console.log('User after registration complete:', user); // Отладочный лог
      bot.sendMessage(chatId, user.language === 'RU' ? 'Регистрация завершена!' : 'Registration completed!', {
        reply_markup: {
          keyboard: [
            [user.language === 'RU' ? 'Личный кабинет' : 'Profile'],
            [user.language === 'RU' ? 'Настройки' : 'Settings'],
            [user.language === 'RU' ? 'Герои' : 'Heroes'],
          ],
          resize_keyboard: true,
        },
      });
    }
  } catch (error) {
    console.error('Error in registration handler:', error);
    bot.sendMessage(chatId, 'Произошла ошибка / An error occurred.');
  }
};