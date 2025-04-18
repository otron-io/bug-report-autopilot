/**
 * Bug Report AI Controller
 * 
 * Handles the processing and analysis of bug reports using AI.
 * This controller integrates with OpenAI for analysis, Supabase for storage,
 * and optionally with Linear for ticket creation.
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { LinearClient } = require('@linear/sdk');

/**
 * Initialize clients based on environment variables
 */
let openai = null;
let supabase = null;
let linearClient = null;

/**
 * In-memory storage fallback when Supabase is unavailable
 */
const inMemoryReports = new Map();

/**
 * Initialize the controller with configuration
 * @param {Object} config - Configuration object
 */
function initialize(config) {
  // Initialize OpenAI
  if (config.openaiApiKey) {
    try {
      openai = new OpenAI({ apiKey: config.openaiApiKey });
      console.log('OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
    }
  }

  // Initialize Supabase
  if (config.supabaseUrl && config.supabaseKey) {
    try {
      supabase = createClient(config.supabaseUrl, config.supabaseKey);
      console.log('Supabase client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
    }
  }

  // Initialize Linear (optional)
  if (config.linearApiKey) {
    try {
      linearClient = new LinearClient({ apiKey: config.linearApiKey });
      console.log('Linear client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Linear client:', error);
    }
  }
}

/**
 * Search the codebase for relevant files based on the bug report
 * @param {string} bugReport - User submitted bug report
 * @param {string} repoPath - Path to the repository
 * @returns {Promise<string[]>} - Array of relevant file paths
 */
async function searchCodebase(bugReport, repoPath, fileSystem) {
  try {
    // Get list of all files in the repository
    const allFiles = await fileSystem.listFiles(repoPath);
    
    // If OpenAI API is available, use it for intelligent file selection
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: `You are a code analysis expert. Based on the bug report, identify which files in the repository are most likely to be relevant. Output ONLY a JSON array of file paths, with no explanations or other text.`
            },
            {
              role: "user",
              content: `Bug report: ${bugReport}\n\nAvailable files: ${JSON.stringify(allFiles)}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        });
        
        // Parse the response
        const parsedResponse = JSON.parse(completion.choices[0].message.content);
        return parsedResponse.files.slice(0, 10);
      } catch (error) {
        console.error('Error using OpenAI for file selection:', error);
        // Fall through to simple keyword-based matching
      }
    }
    
    // Simple keyword-based matching as fallback
    console.log('Using simple keyword matching for file selection');
    const keywords = bugReport.toLowerCase().split(/\s+/);
    
    // Score files based on keyword matches in their paths
    const scoredFiles = allFiles.map(file => {
      const lowerPath = file.toLowerCase();
      const score = keywords.reduce((sum, keyword) => 
        sum + (lowerPath.includes(keyword) ? 1 : 0), 0);
      return { file, score };
    });
    
    // Sort by score (descending) and take top 10
    return scoredFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.file);
  } catch (error) {
    console.error('Error searching codebase:', error);
    return [];
  }
}

/**
 * Read code snippets from files
 * @param {string[]} filePaths - Array of file paths
 * @param {Object} fileSystem - File system interface
 * @returns {Promise<Object>} - Object with file paths as keys and content as values
 */
async function readCodeSnippets(filePaths, fileSystem) {
  try {
    const codeSnippets = {};
    
    for (const filePath of filePaths) {
      try {
        const content = await fileSystem.readFile(filePath);
        codeSnippets[filePath] = content;
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        codeSnippets[filePath] = `Error reading file: ${error.message}`;
      }
    }
    
    return codeSnippets;
  } catch (error) {
    console.error('Error reading code snippets:', error);
    throw error;
  }
}

/**
 * Generate AI-powered bug report from user description and code
 * 
 * @param {Object} bugData - Bug information from user (description, logs, steps, screenshots)
 * @param {Object} codeSnippets - Relevant code extracted from the codebase
 * @returns {Promise<Object>} - Structured bug report object
 */
async function generateBugReport(bugData, codeSnippets) {
  try {
    // Create a prompt for the AI with the bug data and code snippets
    const snippetsText = Object.entries(codeSnippets)
      .map(([filePath, content]) => `File: ${filePath}\n\n${content}\n\n`)
      .join('---\n');
    
    // Format screenshot URLs if provided
    const screenshotsText = bugData.screenshots && bugData.screenshots.length > 0 
      ? `\n\nScreenshots: ${bugData.screenshots.join('\n')}`
      : '';
    
    // If OpenAI API is available, use it for report generation
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1",
          messages: [
            {
              role: "system",
              content: `# Bug Analysis Expert System

Your role is to bridge the gap between user-reported bugs and technical solutions.

## Primary Tasks
1. Translate user language (often non-technical) into developer terminology
2. Identify technical root causes from code analysis
3. Provide specific evidence from the codebase
4. Recommend precise technical fixes
5. Incorporate evidence from screenshots when available

## Analysis Guidelines
- Interpret business terms in their technical context
- Reference specific files, functions, and line numbers when possible
- Identify patterns and anti-patterns in the code
- Consider potential edge cases and interactions between components
- If screenshots are provided, incorporate insights from them into your analysis

## Response Structure
Return a JSON object with this exact schema:
{
    "title": "Clear, concise bug title",
    "suspected_root_cause": "Technical explanation with code structure references",
    "evidence": ["Specific file/line references", "Code patterns found", "Error conditions", "Visual evidence from screenshots"],
    "next_steps": ["Precise technical actions for developers"]
}

Focus on being specific, actionable, and technically accurate while making the bug understandable to developers who didn't write the original code.`
            },
            {
              role: "user",
              content: `Bug Report: ${bugData.description}\n\n` + 
                        `Error Log/Trace: ${bugData.logs || 'None provided'}\n\n` +
                        `Reproduction Steps: ${bugData.steps || 'None provided'}\n\n` +
                        `${screenshotsText}\n\n` +
                        `Code Snippets:\n${snippetsText}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        });
        
        // Parse the AI-generated report
        return JSON.parse(completion.choices[0].message.content);
      } catch (error) {
        console.error('Error using OpenAI for report generation:', error);
        // Fall through to mock report if AI fails
      }
    }
    
    // Generate a simple mock report when OpenAI isn't available
    console.log('Using fallback bug report generation (no AI)');
    
    return {
      "title": bugData.description.substring(0, 50) + (bugData.description.length > 50 ? '...' : ''),
      "suspected_root_cause": "Unable to generate detailed analysis without AI integration.",
      "evidence": [
        "Reported bug description",
        "Available code files (analysis unavailable)",
        bugData.screenshots?.length > 0 ? "Provided screenshots (analysis unavailable)" : "No screenshots provided"
      ],
      "next_steps": [
        "Review the reported description manually",
        "Check the relevant files identified in the report",
        "Implement proper error handling and validation"
      ]
    };
  } catch (error) {
    console.error('Error generating bug report:', error);
    
    // Return a minimal fallback report
    return {
      "title": "Bug Report Analysis",
      "suspected_root_cause": "Analysis could not be completed due to a technical issue.",
      "evidence": ["Error during bug report generation"],
      "next_steps": ["Try again later or contact support for assistance"]
    };
  }
}

/**
 * Formats the bug report JSON into a well-structured Markdown document
 * 
 * @param {Object} reportJson - The parsed JSON report from the AI
 * @returns {string} - Formatted markdown string
 */
function generateMarkdownReport(reportJson) {
  // Extract file paths from evidence for a dedicated section
  const filePaths = reportJson.evidence
    .filter(item => item.includes('/') || item.includes('\\'))
    .map(item => {
      const filePathMatch = item.match(/([\/\\][^\/\\:]+[\/\\][^\/\\:]+\.(js|jsx|ts|tsx|css|html|json))/);
      return filePathMatch ? filePathMatch[1] : null;
    })
    .filter(Boolean); // Remove nulls
    
  // Create a clean, developer-friendly markdown report
  return `# Bug Report: ${reportJson.title}

## Suspected Root Cause
${reportJson.suspected_root_cause}

## Technical Evidence
${reportJson.evidence.map(item => `- ${item}`).join('\n')}

## Recommended Next Steps for Developers
${reportJson.next_steps.map(item => `- ${item}`).join('\n')}

${filePaths.length > 0 ? `
## Files Involved
${filePaths.map(file => `- \`${file}\``).join('\n')}
` : ''}

---
Report generated by Bug Report AI
`;
}

/**
 * Check if the bug report needs additional information from the user
 * 
 * @param {Object} reportJson - JSON bug report
 * @returns {Object|null} - Additional information request or null if not needed
 */
function checkIfNeedsMoreInfo(reportJson) {
  // Enhanced validation of report quality to determine if we need more info
  
  // Keywords indicating uncertainty in the analysis or vague descriptions
  const uncertaintyTerms = [
    'unclear', 'unknown', 'uncertain', 'possible', 'might', 'could be',
    'not enough information', 'insufficient', 'additional details needed',
    'vague', 'ambiguous', 'sometimes', 'occasionally', 'intermittent'
  ];
  
  const rootCause = reportJson.suspected_root_cause.toLowerCase();
  const hasUncertainty = uncertaintyTerms.some(term => rootCause.includes(term));
  
  // Check if evidence is thin or lacks specificity
  const thinEvidence = reportJson.evidence.length < 2;
  const vagueEvidence = reportJson.evidence.some(item => 
    item.length < 20 || 
    !item.includes('/') || // No file paths
    (item.includes('code') && !item.includes(':')) // Mentions code but no specific references
  );
  
  // Check if next steps request more information or are too generic
  const requestsMoreInfo = reportJson.next_steps.some(step => {
    const lowerStep = step.toLowerCase();
    return lowerStep.includes('provide more') || 
            lowerStep.includes('additional info') || 
            lowerStep.includes('reproduction steps') ||
            lowerStep.includes('more details') ||
            lowerStep.includes('clarify');
  });
  
  const needsMoreInfo = hasUncertainty || thinEvidence || vagueEvidence || requestsMoreInfo;
  
  if (needsMoreInfo) {
    // Generate more contextual follow-up questions based on the specific gap
    const requests = [];
    
    // Check if we need reproduction steps
    if (rootCause.includes('reproduce') || 
        !rootCause.includes('steps to') ||
        reportJson.next_steps.some(step => step.toLowerCase().includes('reproduce'))) {
      requests.push({
        type: 'reproduction_steps',
        question: 'Please provide specific steps to reproduce this issue. What were you doing right before the problem occurred?'
      });
    }
    
    // Check if we need environment details
    if (rootCause.includes('environment') || 
        vagueEvidence ||
        reportJson.next_steps.some(step => step.toLowerCase().includes('environment'))) {
      requests.push({
        type: 'environment',
        question: 'What environment are you experiencing this issue in? (browser, OS, device, screen size, etc.)'
      });
    }
    
    // Check if we need version information
    if (rootCause.includes('version') || 
        reportJson.next_steps.some(step => step.toLowerCase().includes('version'))) {
      requests.push({
        type: 'version',
        question: 'What version of the software are you using? Is this a recent change?'
      });
    }
    
    // Check for user context
    if (reportJson.title.toLowerCase().includes('user') || 
        rootCause.toLowerCase().includes('user')) {
      requests.push({
        type: 'user_context',
        question: 'What were you trying to accomplish when you encountered this bug? What is your user role?'
      });
    }
    
    // Check for data specific questions
    if (rootCause.toLowerCase().includes('data') || 
        reportJson.evidence.some(e => e.toLowerCase().includes('data'))) {
      requests.push({
        type: 'data_context',
        question: 'What kind of data were you working with when the issue occurred? Any specific inputs that trigger the problem?'
      });
    }
    
    // Only ask for more screenshots if none were provided
    if (!reportJson.evidence.some(e => e.toLowerCase().includes('screenshot'))) {
      requests.push({
        type: 'screenshot',
        question: 'Could you provide a screenshot or screen recording that shows the issue?'
      });
    }
    
    return {
      needs_more_info: true,
      confidence: hasUncertainty ? 'low' : (vagueEvidence ? 'medium-low' : 'medium'),
      requests: requests
    };
  }
  
  return null;
}

/**
 * Create a Linear issue from the bug report
 * 
 * @param {Object} reportJson - JSON bug report
 * @param {string} reportMarkdown - Markdown formatted report
 * @param {Array} files - List of files analyzed
 * @param {Object} config - Configuration object with team ID
 * @returns {Promise<Object>} - Linear issue data or null if Linear is not configured
 */
async function createLinearIssue(reportJson, reportMarkdown, files, screenshots = [], config = {}) {
  if (!linearClient) {
    console.log('Linear integration not configured. Skipping issue creation.');
    return null;
  }

  try {
    // Get default team ID from config or fetch the first team
    let teamId = config.teamId;
    
    if (!teamId) {
      try {
        const teams = await linearClient.teams();
        if (teams.nodes.length > 0) {
          teamId = teams.nodes[0].id;
        } else {
          console.warn('No teams found in Linear account. Cannot create issue.');
          return null;
        }
      } catch (error) {
        console.error('Error fetching Linear teams:', error);
        return null;
      }
    }
    
    // Prepare a description including the AI analysis and files examined
    const filesList = files.map(file => `- \`${file}\``).join('\\n');
    
    // Add screenshots section if screenshots provided
    const screenshotsSection = screenshots && screenshots.length > 0
      ? `\\n\\n## Screenshots\\n${screenshots.map(url => `![Screenshot](${url})`).join('\\n')}`
      : '';
    
    const description = `## AI Bug Analysis\\n${reportMarkdown}\\n\\n## Files Examined\\n${filesList}${screenshotsSection}`;
    
    // Prepare labels based on suspected root cause
    let labelIds = [];
    try {
      const labels = await linearClient.issueLabels();
      const bugLabel = labels.nodes.find(label => label.name.toLowerCase() === 'bug');
      if (bugLabel) {
        labelIds.push(bugLabel.id);
      }
      
      // Add priority labels if appropriate
      if (reportJson.suspected_root_cause.toLowerCase().includes('crash') || 
          reportJson.suspected_root_cause.toLowerCase().includes('critical')) {
        const priorityLabel = labels.nodes.find(label => 
          label.name.toLowerCase() === 'high' || 
          label.name.toLowerCase() === 'urgent'
        );
        if (priorityLabel) {
          labelIds.push(priorityLabel.id);
        }
      }
    } catch (labelError) {
      console.error('Error fetching labels, continuing without labels:', labelError);
    }
    
    // Create the issue
    const issue = await linearClient.createIssue({
      teamId,
      title: reportJson.title,
      description,
      labelIds,
      priority: 2 // Medium priority by default
    });
    
    // Return with the correct structure for frontend display
    return {
      id: issue.id,
      number: issue.number,
      url: issue.url,
      title: issue.title || reportJson.title
    };
  } catch (error) {
    console.error('Error in Linear issue creation process:', error);
    return null;
  }
}

/**
 * Store bug report data in database or in-memory fallback
 * 
 * @param {Object} reportJson - Generated report in JSON format
 * @param {string} reportMarkdown - Markdown version of the report
 * @param {Object|null} linearIssue - Created Linear issue data (if available)
 * @param {Object} userData - User information like email, name
 * @param {Array} filesAnalyzed - List of code files analyzed 
 * @param {Array} screenshots - List of screenshot URLs uploaded by user
 * @returns {Promise<Object>} - Stored report data
 */
async function storeBugReport(reportJson, reportMarkdown, linearIssue = null, userData = {}, filesAnalyzed = [], screenshots = []) {
  try {
    // Add timestamp
    reportJson.created_at = new Date().toISOString();
    
    // Add Linear issue information if available
    const linearData = linearIssue ? {
      linear_issue_id: linearIssue.id,
      linear_issue_number: linearIssue.number,
      linear_issue_url: linearIssue.url
    } : {};
    
    // Add user information
    const userFields = userData.email ? {
      reporter_email: userData.email,
      reporter_name: userData.name || null,
      status: 'open',
      feedback_requested: false
    } : {};
    
    // Prepare report data
    const reportData = {
      id: `report-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: reportJson.title,
      content_json: reportJson,
      content_markdown: reportMarkdown,
      created_at: reportJson.created_at,
      ...linearData,
      ...userFields,
      files_analyzed: filesAnalyzed,
      screenshots: screenshots // Store screenshot URLs
    };
    
    // Use Supabase if available, otherwise use in-memory storage
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('bug_reports')
          .insert([reportData])
          .select()
          .single();
          
        if (!error && data) {
          return data;
        }
        // Fall through to in-memory storage if Supabase fails
      } catch (supabaseError) {
        console.log('Using in-memory storage as fallback:', supabaseError);
      }
    } else {
      console.log('Using in-memory storage (Supabase not configured)');
    }
    
    // In-memory storage fallback
    inMemoryReports.set(reportData.id, reportData);
    
    return reportData;
  } catch (error) {
    console.error('Error storing bug report:', error);
    
    // Last resort fallback - create a minimal report object
    const fallbackReport = {
      id: `fallback-${Date.now()}`,
      title: reportJson.title || 'Bug Report',
      content_json: reportJson,
      content_markdown: reportMarkdown,
      created_at: new Date().toISOString(),
      files_analyzed: filesAnalyzed,
      screenshots: screenshots
    };
    
    inMemoryReports.set(fallbackReport.id, fallbackReport);
    
    return fallbackReport;
  }
}

/**
 * Analyze a bug report without creating a Linear issue
 */
async function analyzeBugReport(data, fileSystem) {
  try {
    const { 
      description, 
      logs, 
      steps, 
      repoPath,
      email,
      name,
      additionalContext,
      screenshots // Array of screenshot URLs
    } = data;
    
    // Input validation
    if (!description) {
      throw new Error("Bug description is required");
    }
    
    if (!repoPath) {
      throw new Error("Repository path is required");
    }
    
    // Step 1: Search the codebase for relevant files
    const relevantFiles = await searchCodebase(description, repoPath, fileSystem);
    
    // Step 2: Read code snippets from the relevant files
    const codeSnippets = await readCodeSnippets(relevantFiles, fileSystem);
    
    // Step 3: Generate the bug report using AI
    const bugData = { 
      description, 
      logs, 
      steps,
      additionalContext,
      screenshots: screenshots || []
    };
    const reportJson = await generateBugReport(bugData, codeSnippets);
    
    // Step 4: Generate a Markdown version of the report
    const reportMarkdown = generateMarkdownReport(reportJson);
    
    // Step 5: Check if we need to request additional information
    const needsMoreInfo = checkIfNeedsMoreInfo(reportJson);
    
    // Step 6: Store the report in the database
    const userData = { email, name };
    const storedReport = await storeBugReport(
      reportJson, 
      reportMarkdown, 
      null, 
      userData, 
      relevantFiles, 
      screenshots || []
    );
    
    // Step 7: Return the report for confirmation
    return {
      id: storedReport.id,
      report_json: reportJson,
      report_markdown: reportMarkdown,
      files_analyzed: relevantFiles,
      screenshots: screenshots || [],
      needs_more_info: needsMoreInfo,
      timestamp: new Date().toISOString(),
      pending_confirmation: true
    };
  } catch (error) {
    console.error('Error analyzing bug report:', error);
    throw error;
  }
}

/**
 * Confirm a bug report and create a Linear issue
 */
async function confirmBugReport(reportId, config) {
  try {
    if (!reportId) {
      throw new Error("Report ID is required");
    }
    
    // Get the stored report
    let reportData;
    
    // Try Supabase first if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('bug_reports')
          .select('*')
          .eq('id', reportId)
          .single();
          
        if (!error && data) {
          reportData = data;
        }
      } catch (supabaseError) {
        console.warn('Supabase retrieval failed, checking in-memory:', supabaseError);
      }
    }
    
    // Check in-memory storage if not found in Supabase
    if (!reportData && inMemoryReports.has(reportId)) {
      reportData = inMemoryReports.get(reportId);
    }
    
    if (!reportData) {
      throw new Error("Bug report not found");
    }
    
    // Extract the report data
    const reportJson = reportData.content_json;
    const reportMarkdown = reportData.content_markdown;
    const filesAnalyzed = reportData.files_analyzed || [];
    const screenshots = reportData.screenshots || [];
    
    // Create a Linear issue
    const linearIssue = await createLinearIssue(
      reportJson, 
      reportMarkdown, 
      filesAnalyzed,
      screenshots,
      config
    );
    
    // Update the report with Linear issue data
    let updatedReport;
    
    if (supabase) {
      try {
        const linearData = linearIssue ? {
          linear_issue_id: linearIssue.id,
          linear_issue_number: linearIssue.number,
          linear_issue_url: linearIssue.url
        } : {};
        
        const { data, error } = await supabase
          .from('bug_reports')
          .update({
            ...linearData,
            status: 'confirmed',
            last_updated: new Date().toISOString()
          })
          .eq('id', reportId)
          .select()
          .single();
          
        if (!error) {
          updatedReport = data;
        }
      } catch (supabaseError) {
        console.warn('Supabase update failed, falling back to in-memory:', supabaseError);
      }
    }
    
    // Update in-memory storage if Supabase update failed or not available
    if (!updatedReport && inMemoryReports.has(reportId)) {
      const report = inMemoryReports.get(reportId);
      updatedReport = {
        ...report,
        linear_issue_id: linearIssue?.id,
        linear_issue_number: linearIssue?.number,
        linear_issue_url: linearIssue?.url,
        status: 'confirmed',
        last_updated: new Date().toISOString()
      };
      inMemoryReports.set(reportId, updatedReport);
    }
    
    // Return the updated report
    return {
      id: reportId,
      report_json: reportJson,
      report_markdown: reportMarkdown,
      files_analyzed: filesAnalyzed,
      screenshots: screenshots,
      linear_issue: linearIssue ? {
        id: linearIssue.id,
        number: linearIssue.number,
        url: linearIssue.url
      } : null,
      timestamp: new Date().toISOString(),
      confirmed: true
    };
  } catch (error) {
    console.error('Error confirming bug report:', error);
    throw error;
  }
}

/**
 * Submit additional information for a bug report
 */
async function submitAdditionalInfo(reportId, responses) {
  try {
    if (!reportId) {
      throw new Error("Bug report ID is required");
    }
    
    if (!responses || Object.keys(responses).length === 0) {
      throw new Error("Additional information is required");
    }
    
    let reportData;
    let updatedReport;
    
    // First try to get the report from Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('bug_reports')
          .select('*')
          .eq('id', reportId)
          .single();
          
        if (!error && data) {
          reportData = data;
          
          // Update the content with additional information
          const updatedContentJson = { 
            ...reportData.content_json,
            additional_info: {
              ...reportData.content_json.additional_info || {},
              ...responses,
              submitted_at: new Date().toISOString()
            }
          };
          
          // Update in Supabase
          const { data: updatedData, error: updateError } = await supabase
            .from('bug_reports')
            .update({
              content_json: updatedContentJson,
              feedback_requested: false,
              last_updated: new Date().toISOString()
            })
            .eq('id', reportId)
            .select()
            .single();
            
          if (!updateError) {
            updatedReport = updatedData;
          }
        }
      } catch (supabaseError) {
        console.warn('Supabase operations failed, using in-memory:', supabaseError);
      }
    }
    
    // Try in-memory if Supabase failed or isn't available
    if (!reportData && inMemoryReports.has(reportId)) {
      reportData = inMemoryReports.get(reportId);
    }
    
    // If we still don't have a report, it's not found
    if (!reportData) {
      throw new Error("Bug report not found");
    }
    
    // If we haven't updated the report in Supabase, update it in memory
    if (!updatedReport) {
      // Update the content with additional information
      const updatedContentJson = { 
        ...reportData.content_json,
        additional_info: {
          ...reportData.content_json.additional_info || {},
          ...responses,
          submitted_at: new Date().toISOString()
        }
      };
      
      // Create updated report
      updatedReport = {
        ...reportData,
        content_json: updatedContentJson,
        feedback_requested: false,
        last_updated: new Date().toISOString()
      };
      
      // Store in memory
      inMemoryReports.set(reportId, updatedReport);
    }
    
    // Update the Linear issue with the additional information if available
    if (reportData.linear_issue_id && linearClient) {
      try {
        // Format the responses for the Linear issue
        const formattedResponses = Object.entries(responses)
          .map(([type, response]) => `### ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}\n${response}`)
          .join('\n\n');
        
        // Add a comment to the Linear issue
        await linearClient.issueComment({
          issueId: reportData.linear_issue_id,
          body: `## Additional Information From User\n\n${formattedResponses}`
        });
      } catch (linearError) {
        console.error('Error updating Linear issue:', linearError);
        // Don't fail the whole request if Linear update fails
      }
    }
    
    return {
      message: "Additional information submitted successfully",
      id: updatedReport.id
    };
  } catch (error) {
    console.error('Error submitting additional information:', error);
    throw error;
  }
}

/**
 * Get a bug report by ID
 */
async function getBugReport(reportId) {
  try {
    if (!reportId) {
      throw new Error("Bug report ID is required");
    }
    
    // Try Supabase first if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('bug_reports')
          .select('*')
          .eq('id', reportId)
          .single();
          
        if (!error && data) {
          return data;
        }
        // Fall through to in-memory if no results or error
      } catch (supabaseError) {
        console.warn('Supabase retrieval failed, checking in-memory:', supabaseError);
      }
    }
    
    // Check in-memory storage
    if (inMemoryReports.has(reportId)) {
      return inMemoryReports.get(reportId);
    }
    
    throw new Error("Bug report not found");
  } catch (error) {
    console.error('Error fetching bug report:', error);
    throw error;
  }
}

// Export all functions for modularity
module.exports = {
  initialize,
  analyzeBugReport,
  confirmBugReport,
  submitAdditionalInfo,
  getBugReport,
  storeBugReport,
  generateBugReport,
  generateMarkdownReport,
  checkIfNeedsMoreInfo,
  createLinearIssue,
  searchCodebase,
  readCodeSnippets
};