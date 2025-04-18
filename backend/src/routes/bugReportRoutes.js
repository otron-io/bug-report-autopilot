/**
 * Bug Report API Routes
 * 
 * Express routes for bug report API endpoints.
 */

const express = require('express');
const router = express.Router();
const bugReportController = require('../controllers/bugReportController');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// Create a simplified file system interface for the controller
const fileSystem = {
  async listFiles(repoPath) {
    const getAllFiles = (dir, fileList = []) => {
      try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          // Skip node_modules, .git, etc.
          if (file === 'node_modules' || file === '.git' || file === 'dist') {
            continue;
          }
          
          if (stat.isDirectory()) {
            getAllFiles(filePath, fileList);
          } else {
            // Only include relevant file types
            if (/\.(js|jsx|ts|tsx|css|html|json)$/.test(file)) {
              fileList.push(filePath);
            }
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
      }
      
      return fileList;
    };
    
    return getAllFiles(repoPath);
  },
  
  async readFile(filePath) {
    return fs.promises.readFile(filePath, 'utf8');
  }
};

// Set up rate limiting
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Max 10 requests per 5 minutes
  message: 'Too many bug reports submitted, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize the controller with config from environment
bugReportController.initialize({
  openaiApiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  linearApiKey: process.env.LINEAR_API_KEY,
  linearTeamId: process.env.LINEAR_TEAM_ID
});

/**
 * POST /api/bug-report/analyze
 * Analyze bug report without creating a ticket
 */
router.post('/analyze', apiLimiter, async (req, res) => {
  try {
    const result = await bugReportController.analyzeBugReport(req.body, fileSystem);
    res.json(result);
  } catch (error) {
    console.error('Route error - analyze bug report:', error);
    res.status(500).json({ 
      message: "An error occurred while analyzing the bug report",
      error: error.message 
    });
  }
});

/**
 * POST /api/bug-report/confirm
 * Confirm a bug report and create a Linear ticket
 */
router.post('/confirm', async (req, res) => {
  try {
    const { reportId } = req.body;
    
    if (!reportId) {
      return res.status(400).json({ message: "Report ID is required" });
    }
    
    const config = {
      teamId: process.env.LINEAR_TEAM_ID
    };
    
    const result = await bugReportController.confirmBugReport(reportId, config);
    res.json(result);
  } catch (error) {
    console.error('Route error - confirm bug report:', error);
    res.status(500).json({ 
      message: "An error occurred while confirming the bug report",
      error: error.message 
    });
  }
});

/**
 * POST /api/bug-report/:id/additional-info
 * Submit additional information for a bug report
 */
router.post('/:id/additional-info', async (req, res) => {
  try {
    const { id } = req.params;
    const { responses } = req.body;
    
    if (!responses || Object.keys(responses).length === 0) {
      return res.status(400).json({ message: "Additional information is required" });
    }
    
    const result = await bugReportController.submitAdditionalInfo(id, responses);
    res.json(result);
  } catch (error) {
    console.error('Route error - submit additional info:', error);
    res.status(500).json({ 
      message: "An error occurred while submitting additional information",
      error: error.message 
    });
  }
});

/**
 * GET /api/bug-report/:id
 * Get a bug report by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await bugReportController.getBugReport(id);
    res.json(report);
  } catch (error) {
    console.error('Route error - get bug report:', error);
    res.status(404).json({ 
      message: "Bug report not found",
      error: error.message 
    });
  }
});

module.exports = router;