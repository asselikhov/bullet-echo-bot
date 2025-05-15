const User = require('../models/User');
const { formatProfileText, getFieldLabels, handleError, clearGlobalStates } = require('../utils/helpers');
const { getMainReplyKeyboard, getMainInlineKeyboard } = require('../utils/keyboards');

const maxTextLength = 100;

// Клавиатура для профиля
const createProfileKeyboard = (language) => ({
    resize_keyboard: true,
    inline_keyboard: [
        [{ text: language === 'RU' ? '✏️ Редактировать' : '✏️ Edit', callback_data: 'profile_edit' }],
        [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'menu_main' }]
    ]
});

// Клавиатура для выбора полей редактирования
const createEditFieldsKeyboard = async (userId, language) => {
    try {
        console.log(`Creating edit fields keyboard for userId=${userId}, language=${language}`);
        const user = await User.findOne({ telegramId: userId }).lean();
        console.log(`User query result: ${JSON.stringify(user, null, 2)}`);

        const editableFields = [
            { key: 'nickname', label: language === 'RU' ? 'Никнейм' : 'Nickname' },
            { key: 'userId', label: language === 'RU' ? 'ID игрока' : 'Player ID' },
            { key: 'trophies', label: language === 'RU' ? 'Трофеи' : 'Trophies' },
            { key: 'valorPath', label: language === 'RU' ? 'Путь доблести' : 'Valor Path' },
            { key: 'syndicate', label: language === 'RU' ? 'Синдикат' : 'Syndicate' },
            { key: 'name', label: language === 'RU' ? 'Имя' : 'Name' },
            { key: 'age', label: language === 'RU' ? 'Возраст' : 'Age' },
            { key: 'gender', label: language === 'RU' ? 'Пол' : 'Gender' },
            { key: 'country', label: language === 'RU' ? 'Страна' : 'Country' },
            { key: 'city', label: language === 'RU' ? 'Город' : 'City' }
        ];

        const inline_keyboard = editableFields.map(field => {
            const buttons = [{ text: field.label, callback_data: `edit_${field.key}` }];
            if (field.key === 'syndicate' && user?.syndicate) {
                buttons.push({
                    text: language === 'RU' ? '🗑️ Удалить синдикат' : '🗑️ Delete Syndicate',
                    callback_data: 'delete_syndicate'
                });
            }
            return buttons;
        });

        inline_keyboard.push([{
            text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back',
            callback_data: 'menu_profile'
        }]);

        const result = {
            resize_keyboard: true,
            inline_keyboard
        };
        console.log(`Generated edit fields keyboard: ${JSON.stringify(result, null, 2)}`);
        return result;
    } catch (error) {
        console.error(`Error in createEditFieldsKeyboard for userId=${userId}:`, error.stack);
        return {
            resize_keyboard: true,
            inline_keyboard: [[{
                text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back',
                callback_data: 'menu_profile'
            }]]
        };
    }
};

// Клавиатура для выбора пола
const createGenderKeyboard = (language) => ({
    resize_keyboard: true,
    inline_keyboard: [
        [
            { text: language === 'RU' ? 'М' : 'M', callback_data: 'gender_M' },
            { text: language === 'RU' ? 'Ж' : 'F', callback_data: 'gender_F' }
        ],
        [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
    ]
});

// Валидация текстовых полей
const validateText = (text, field, language) => {
    if (!text || text.length < 1) {
        return language === 'RU' ? `${field} не может быть пустым.` : `${field} cannot be empty.`;
    }
    if (text.length > maxTextLength) {
        return language === 'RU' ? `${field} слишком длинный.` : `${field} is too long.`;
    }
    return null;
};

// Валидация числовых полей
const validateNumber = (text, field, language) => {
    const value = parseInt(text, 10);
    if (isNaN(value) || value < 0) {
        return language === 'RU' ? `Пожалуйста, введите положительное число для ${field}.` : `Please enter a positive number for ${field}.`;
    }
    return value;
};

// Основной обработчик
const profileHandler = async (bot, ctx, params, user) => {
    if (!ctx || !user || !params) {
        console.error('Invalid parameters in profile handler:', { ctx, user, params });
        return {
            text: 'Internal error: Invalid parameters.',
            reply_markup: { inline_keyboard: [] }
        };
    }

    // Подтверждение callback-запроса
    if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
    }

    const data = params.data || '';
    const userId = ctx.from.id.toString();
    const messageId = ctx.message?.message_id || ctx.callbackQuery?.message?.message_id;
    const text = ctx.message?.text?.trim();
    const language = user.language || 'RU';

    console.log(`Profile handler: userId=${userId}, data=${data}, message_id=${messageId}, text="${text}"`);

    try {
        const updatedUser = await User.findOne({ telegramId: userId }).lean();
        if (!updatedUser) {
            console.error(`User not found: userId=${userId}`);
            return {
                text: language === 'RU' ? 'Пользователь не найден.' : 'User not found.',
                reply_markup: {
                    inline_keyboard: getMainInlineKeyboard(language)
                }
            };
        }

        // Отображение профиля
        if (data === 'menu_profile') {
            const profileText = formatProfileText(updatedUser, language);
            console.log(`Returning profile for userId=${userId}`);
            return {
                text: profileText,
                reply_markup: createProfileKeyboard(language),
                parse_mode: 'HTML'
            };
        }

        // Отображение списка полей для редактирования
        if (data === 'profile_edit') {
            console.log(`Showing edit fields for userId=${userId}`);
            return {
                text: language === 'RU' ? 'Выберите поле для редактирования:' : 'Select a field to edit:',
                reply_markup: await createEditFieldsKeyboard(userId, language)
            };
        }

        // Обработка удаления синдиката
        if (data === 'delete_syndicate') {
            console.log(`Deleting syndicate for userId=${userId}`);
            await User.updateOne(
                { telegramId: userId },
                { syndicate: null, updatedAt: new Date() }
            );
            clearGlobalStates(userId);
            console.log(`Syndicate deleted for userId=${userId}, returning edit fields`);
            return {
                text: language === 'RU'
                    ? `✅ Синдикат удалён! Выберите поле для редактирования:`
                    : `✅ Syndicate deleted! Select a field to edit:`,
                reply_markup: await createEditFieldsKeyboard(userId, language),
                parse_mode: 'HTML'
            };
        }

        // Обработка выбора поля для редактирования
        if (data.startsWith('edit_')) {
            const field = data.replace('edit_', '');
            const validFields = ['nickname', 'userId', 'trophies', 'valorPath', 'syndicate', 'name', 'age', 'gender', 'country', 'city'];
            if (!validFields.includes(field)) {
                throw new Error(`Invalid field: ${field}`);
            }

            if (field === 'gender') {
                console.log(`Showing gender selection for userId=${userId}`);
                return {
                    text: language === 'RU' ? 'Выберите пол:' : 'Select gender:',
                    reply_markup: createGenderKeyboard(language)
                };
            }

            global.editingProfileState = global.editingProfileState || {};
            global.editingProfileState[userId] = { field };
            const fieldLabels = getFieldLabels(language);
            const label = fieldLabels[field] || field;

            let promptText = language === 'RU' ? `Введите ${label}:` : `Enter ${label}:`;
            if (['trophies', 'valorPath', 'age'].includes(field)) {
                promptText += language === 'RU' ? ' (целое число)' : ' (integer)';
            } else if (field === 'userId') {
                promptText += language === 'RU' ? ' (буквы и цифры, например, 5X5R8ZN)' : ' (letters and numbers, e.g., 5X5R8ZN)';
            }

            console.log(`Prompting for field=${field}, userId=${userId}`);
            return {
                text: promptText,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
                    ]
                }
            };
        }

        // Обработка выбора пола
        if (data === 'gender_M' || data === 'gender_F') {
            const gender = language === 'RU'
                ? (data === 'gender_M' ? 'М' : 'Ж')
                : (data === 'gender_M' ? 'M' : 'F');
            console.log(`Updating gender to ${gender} for userId=${userId}`);
            await User.updateOne(
                { telegramId: userId },
                { gender, updatedAt: new Date() }
            );
            clearGlobalStates(userId);
            console.log(`Gender updated to ${gender} for userId=${userId}, returning edit fields`);
            return {
                text: language === 'RU'
                    ? `✅ Поле обновлено! Выберите поле для редактирования:`
                    : `✅ Field updated! Select a field to edit:`,
                reply_markup: await createEditFieldsKeyboard(userId, language),
                parse_mode: 'HTML'
            };
        }

        // Обработка ввода текстовых/числовых полей
        if (text && global.editingProfileState?.[userId]?.field) {
            const field = global.editingProfileState[userId].field;
            const fieldLabels = getFieldLabels(language);
            const label = fieldLabels[field] || field;
            let updateData = { updatedAt: new Date() };

            switch (field) {
                case 'nickname':
                case 'userId':
                case 'name':
                case 'country':
                case 'city': {
                    const validationError = validateText(text, label, language);
                    if (validationError) {
                        console.log(`Validation error for ${field}: ${validationError}, userId=${userId}`);
                        return {
                            text: validationError,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
                                ]
                            }
                        };
                    }
                    updateData[field] = text;
                    break;
                }
                case 'trophies':
                case 'age': {
                    const value = validateNumber(text, label, language);
                    if (typeof value === 'string') {
                        console.log(`Validation error for ${field}: ${value}, userId=${userId}`);
                        return {
                            text: value,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
                                ]
                            }
                        };
                    }
                    updateData[field] = value;
                    break;
                }
                case 'valorPath': {
                    if (text.toLowerCase() === (language === 'RU' ? 'пропустить' : 'skip')) {
                        updateData.valorPath = null;
                    } else {
                        const value = validateNumber(text, label, language);
                        if (typeof value === 'string') {
                            console.log(`Validation error for ${field}: ${value}, userId=${userId}`);
                            return {
                                text: value,
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
                                    ]
                                }
                            };
                        }
                        updateData.valorPath = value;
                    }
                    break;
                }
                case 'syndicate': {
                    if (text.toLowerCase() === (language === 'RU' ? 'пропустить' : 'skip')) {
                        updateData.syndicate = null;
                    } else {
                        const validationError = validateText(text, label, language);
                        if (validationError) {
                            console.log(`Validation error for ${field}: ${validationError}, userId=${userId}`);
                            return {
                                text: validationError,
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: language === 'RU' ? '⬅️ Назад' : '⬅️ Back', callback_data: 'profile_edit' }]
                                    ]
                                }
                            };
                        }
                        updateData.syndicate = text;
                    }
                    break;
                }
            }

            console.log(`Updating field ${field} to ${updateData[field]} for userId=${userId}`);
            await User.updateOne({ telegramId: userId }, updateData);
            clearGlobalStates(userId);
            console.log(`Field ${field} updated for userId=${userId}, returning edit fields`);
            const keyboard = await createEditFieldsKeyboard(userId, language);
            console.log(`Response keyboard after update: ${JSON.stringify(keyboard, null, 2)}`);
            return {
                text: language === 'RU'
                    ? `✅ Поле обновлено! Выберите поле для редактирования:`
                    : `✅ Field updated! Select a field to edit:`,
                reply_markup: keyboard,
                parse_mode: 'HTML'
            };
        }

        console.warn(`Unknown profile data: ${data}, userId=${userId}`);
        return {
            text: language === 'RU' ? 'Используйте меню ниже:' : 'Use the menu below:',
            reply_markup: {
                inline_keyboard: getMainInlineKeyboard(language)
            }
        };
    } catch (error) {
        console.error(`Error in profile handler: userId=${userId}, data=${data}`, error.stack);
        return {
            text: language === 'RU' ? 'Произошла ошибка.' : 'An error occurred.',
            reply_markup: {
                inline_keyboard: getMainInlineKeyboard(language)
            }
        };
    }
};

module.exports = profileHandler;
module.exports.createEditFieldsKeyboard = createEditFieldsKeyboard;