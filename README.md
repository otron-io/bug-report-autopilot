# Bug Report AI

A modern AI-powered bug reporting system that turns user reports into developer-ready tickets.

## 🚀 Features

- **User-Friendly Reporting**: Simple interface for users to describe bugs in their own language
- **AI Analysis**: Translates user reports into precise technical descriptions
- **Screenshot Integration**: Direct image upload support for visual context
- **Smart Follow-ups**: Contextual follow-up questions when more information is needed
- **Linear Integration**: Direct creation of Linear tickets with complete technical details
- **Supabase Storage**: Efficient storage of reports and screenshots

## 🏗️ Architecture

The system consists of two main components:

1. **Frontend**: React-based UI for submitting bug reports and viewing analysis
2. **Backend**: Node.js service that uses AI to analyze bugs and generate reports

## 📋 Requirements

- Node.js 16+
- Supabase account (for storage and optional database)
- OpenAI API key
- Linear API key (optional)

## 🛠️ Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys and configuration

# Start development server
npm run dev
```

## 🔧 Configuration

Configure the following environment variables:

- `OPENAI_API_KEY`: For AI-powered analysis
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: For storage
- `LINEAR_API_KEY`: For issue creation (optional)

## 📖 Usage

The workflow consists of three steps:

1. User submits a bug description with optional screenshots
2. AI processes the report and generates a technical analysis
3. System shows follow-up questions or confirmation before creating a ticket

## 🤝 Contributing

We welcome contributions! Please see our [contributing guide](CONTRIBUTING.md) for details.

## 📄 License

Released under the MIT License. See [LICENSE](LICENSE) for details.