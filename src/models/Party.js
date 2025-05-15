const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
    organizerId: { type: String, required: true, index: true },
    gameMode: { type: String, required: true },
    playerCount: { type: Number, required: true, min: 1, max: 5 }, // Поддерживает до 5 игроков
    classId: { type: String, required: true },
    heroId: { type: String, required: true },
    groupMessageId: { type: Number }, // Removed required constraint
    applications: [{
        applicantId: { type: String, required: true },
        heroId: { type: String, required: true },
        classId: { type: String },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        appliedAt: { type: Date, default: Date.now }
    }],
    shortId: { type: String, unique: true, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Индексы
partySchema.index({ organizerId: 1, createdAt: -1 });
partySchema.index({ groupMessageId: 1 });
partySchema.index({ shortId: 1 });

module.exports = mongoose.model('Party', partySchema);