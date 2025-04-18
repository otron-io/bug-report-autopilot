/**
 * Bug Report AI API Server
 * 
 * Main entry point for the backend service.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const bugReportRoutes = require('./routes/bugReportRoutes');

// Load environment variables
dotenv.config();

// Create Express application
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.use('/api/bug-report', bugReportRoutes);

// Root endpoint for health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Bug Report AI API is running'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Bug Report AI server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/bug-report`);
  
  // Log configuration status
  console.log('\nConfiguration status:');
  console.log(`- OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✅' : 'Not configured ❌'}`);
  console.log(`- Supabase: ${process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured ✅' : 'Not configured ❌'}`);
  console.log(`- Linear: ${process.env.LINEAR_API_KEY ? 'Configured ✅' : 'Not configured ❌'}`);
});

module.exports = app; // For testing