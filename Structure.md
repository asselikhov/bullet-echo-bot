bullet-echo-bot/
├── src/
│   ├── handlers/
│   │   ├── start.js           # Handler for /start command
│   │   ├── registration.js    # Handler for user registration process
│   │   ├── mainMenu.js        # Handler for main menu navigation
│   │   ├── search.js 
│   │   ├── profile.js         # Handler for user profile management
│   │   ├── settings.js        # Handler for user settings (e.g., language selection)
│   │   ├── heroes.js          # Handler for hero management (add, edit, view)
│   ├── models/
│   │   ├── User.js            # Mongoose model for User
│   │   ├── Party.js 
│   │   ├── Hero.js            # Mongoose model for Hero
│   ├── constants/
│   │   ├── motivations.js
│   │   ├── heroes.js          # Hero translations and class data
│   ├── utils/
│   │   ├── keyboards.js       # Centralized keyboard generation (e.g., main menu)
│   │   ├── helpers.js         # Utility functions (e.g., formatDateTime, field labels)
│   ├── bot.js                 # Main bot logic, webhook setup, and message handlers
│   ├── db.js                  # MongoDB connection setup
├── .env                       # Environment variables (TELEGRAM_TOKEN, MONGODB_URI)
├── package.json               # Project dependencies and scripts
├── README.md                  # Project documentation