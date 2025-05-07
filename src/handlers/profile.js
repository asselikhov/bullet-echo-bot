const User = require('../models/User');

module.exports = async (bot, msg, query) => {
    const chatId = msg.chat.id;
    const data = query ? query.data : null;
    const user = await User.findOne({ telegramId: chatId.toString() });

    if (!user) {
        bot.sendMessage(chatId, user.language === 'RU' ? 'Пожалуйста, начните с /start.' : 'Please start with /start.');
        return;
    }

    try {
        if (data === 'profile_edit') {
            const fieldLabels = user.language === 'RU' ?
                {
                    nickname: 'Никнейм',
                    userId: 'ID игрока',
                    trophies: 'Трофеи',
                    valorPath: 'Путь доблести',
                    syndicate: 'Синдикат',
                    name: 'Имя',
                    age: 'Возраст',
                    gender: 'Пол',
                    country: 'Страна',
                    city: 'Город'
                } :
                {
                    nickname: 'Nickname',
                    userId: 'User ID',
                    trophies: 'Trophies',
                    valorPath: 'Valor Path',
                    syndicate: 'Syndicate',
                    name: 'Name',
                    age: 'Age',
                    gender: 'Gender',
                    country: 'Country',
                    city: 'City'
                };

            const fields = ['nickname', 'userId', 'trophies', 'valorPath', 'syndicate', 'name', 'age', 'gender', 'country', 'city'];

            bot.sendMessage(chatId, user.language === 'RU' ? 'Выберите поле для редактирования:' : 'Select field to edit:', {
                reply_markup: {
                    inline_keyboard: fields.map(field => [{ text: fieldLabels[field], callback_data: `profile_edit_${field}` }]),
                },
            });
        } else if (data && data.startsWith('profile_edit_')) {
            const field = data.split('_')[2];
            user.registrationStep = `edit_${field}`;
            await user.save();
            const fieldLabels = user.language === 'RU' ?
                {
                    nickname: 'Никнейм',
                    userId: 'ID игрока',
                    trophies: 'Трофеи',
                    valorPath: 'Путь доблести',
                    syndicate: 'Синдикат',
                    name: 'Имя',
                    age: 'Возраст',
                    gender: 'Пол',
                    country: 'Страна',
                    city: 'Город'
                } :
                {
                    nickname: 'Nickname',
                    userId: 'User ID',
                    trophies: 'Trophies',
                    valorPath: 'Valor Path',
                    syndicate: 'Syndicate',
                    name: 'Name',
                    age: 'Age',
                    gender: 'Gender',
                    country: 'Country',
                    city: 'City'
                };
            bot.sendMessage(chatId, user.language === 'RU' ? `Введите новое значение для ${fieldLabels[field]}:` : `Enter new value for ${fieldLabels[field]}:`);
        } else {
            console.log(`Profile data for user ${user.telegramId}: trophies=${user.trophies}, valorPath=${user.valorPath}`); // Отладочный лог
            const profileText = user.language === 'RU' ?
                `👤 Личный кабинет\n` +
                `Никнейм: ${user.nickname || 'Не указан'}\n` +
                `ID игрока: ${user.userId || 'Не указан'}\n` +
                `Трофеи: ${user.trophies || 0}\n` +
                `Путь доблести: ${user.valorPath || 0}\n` +
                `Синдикат: ${user.syndicate || 'Не указан'}\n` +
                `Имя: ${user.name || 'Не указано'}\n` +
                `Возраст: ${user.age || 'Не указан'}\n` +
                `Пол: ${user.gender || 'Не указан'}\n` +
                `Страна: ${user.country || 'Не указана'}\n` +
                `Город: ${user.city || 'Не указан'}\n` +
                `Язык: ${user.language === 'RU' ? 'Русский' : 'English'}`
                :
                `👤 Profile\n` +
                `Nickname: ${user.nickname || 'Not set'}\n` +
                `User ID: ${user.userId || 'Not set'}\n` +
                `Trophies: ${user.trophies || 0}\n` +
                `Valor Path: ${user.valorPath || 0}\n` +
                `Syndicate: ${user.syndicate || 'Not set'}\n` +
                `Name: ${user.name || 'Not set'}\n` +
                `Age: ${user.age || 'Not set'}\n` +
                `Gender: ${user.gender || 'Not set'}\n` +
                `Country: ${user.country || 'Not set'}\n` +
                `City: ${user.city || 'Not set'}\n` +
                `Language: ${user.language === 'RU' ? 'Russian' : 'English'}`;

            bot.sendMessage(chatId, profileText, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: user.language === 'RU' ? '✏️ Редактировать профиль' : '✏️ Edit profile', callback_data: 'profile_edit' }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error('Error in profile handler:', error);
        bot.sendMessage(chatId, user.language === 'RU' ? 'Произошла ошибка.' : 'An error occurred.');
    }
};