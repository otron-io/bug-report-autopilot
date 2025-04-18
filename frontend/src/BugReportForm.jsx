/**
 * BugReportForm.jsx
 * 
 * A React component for submitting bug reports with screenshots and follow-up questions.
 * Provides a 3-step workflow:
 * 1. User inputs bug description (in any terminology)
 * 2. AI processes and analyzes the bug
 * 3. Shows follow-up questions or confirmation before creating a ticket
 */

import React, { useState, useRef } from 'react';
import { 
  Container, Box, Paper, Stepper, 
  Title, Text, Textarea, Button, 
  Group, FileInput, Image, Alert,
  Divider, Loader, SimpleGrid,
  TextInput, Code, CopyButton, Tooltip
} from './ui-components'; // Import your UI components (Mantine, MUI, etc.)

// Configure these based on your setup
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
const REPO_PATH = process.env.REACT_APP_REPO_PATH || '/path/to/your/repo';

// Initialize Supabase client (if used for image uploads)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const BugReportForm = () => {
  // Form state
  const [description, setDescription] = useState('');
  
  // Image upload state
  const [screenshots, setScreenshots] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState([]);
  const fileInputRef = useRef(null);

  // Workflow state
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [linearCreated, setLinearCreated] = useState(false);
  
  // Follow-up questions state
  const [followUpResponses, setFollowUpResponses] = useState({});
  const [showFollowUp, setShowFollowUp] = useState(false);

  /**
   * Upload screenshots to Supabase storage
   * @returns {Promise<string[]>} Array of image URLs
   */
  const uploadScreenshots = async () => {
    if (!screenshots || screenshots.length === 0) {
      return [];
    }
    
    const uploadedUrls = [];
    setUploadProgress(0);
    
    try {
      for (let i = 0; i < screenshots.length; i++) {
        const file = screenshots[i];
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        
        // Upload to Supabase
        const { data, error } = await supabase.storage
          .from('images')
          .upload(`bug-reports/${fileName}`, file, {
            cacheControl: '3600',
            upsert: false
          });
          
        if (error) throw error;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('images')
          .getPublicUrl(`bug-reports/${fileName}`);
          
        uploadedUrls.push(urlData.publicUrl);
        
        // Update progress
        setUploadProgress(Math.round(((i + 1) / screenshots.length) * 100));
      }
      
      setUploadedImages(uploadedUrls);
      return uploadedUrls;
    } catch (error) {
      console.error('Error uploading images:', error);
      throw new Error('Failed to upload images. Please try again.');
    }
  };
  
  /**
   * Initial bug report submission
   * Sends the user's description to the backend for AI analysis
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Validate required fields
      if (!description) {
        throw new Error('Bug description is required');
      }
      
      // Show the processing/loading step
      setActive(1);
      
      // Upload screenshots if any
      let screenshotUrls = [];
      if (screenshots && screenshots.length > 0) {
        screenshotUrls = await uploadScreenshots();
      }
      
      // Send description to backend for AI analysis
      const response = await fetch(`${API_BASE_URL}/api/bug-report/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description,
          repoPath: REPO_PATH,
          screenshots: screenshotUrls
        })
      });
      
      // Handle API errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process bug report');
      }
      
      // Process backend response
      const data = await response.json();
      setReport(data);
      
      // Set up follow-up questions if the AI determined we need more info
      if (data.needs_more_info) {
        // Initialize empty responses for each question
        const initialResponses = {};
        data.needs_more_info.requests.forEach(request => {
          initialResponses[request.type] = '';
        });
        setFollowUpResponses(initialResponses);
        setShowFollowUp(true);
      }
      
      // Show either the follow-up questions or report confirmation
      setActive(2);
    } catch (err) {
      setError(err.message);
      setActive(0); // Return to input form on error
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Confirm bug report and create Linear ticket
   * Called when user confirms the analysis is correct
   */
  const handleConfirmReport = async () => {
    setLoading(true);
    
    try {
      // Create Linear ticket from the report
      const response = await fetch(`${API_BASE_URL}/api/bug-report/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reportId: report.id,
        })
      });
      
      // Handle API errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to confirm bug report');
      }
      
      // Update with Linear issue data
      const data = await response.json();
      setReport(data);
      setLinearCreated(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Submit additional information for unclear bug reports
   * Called when user responds to follow-up questions
   */
  const handleFollowUpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Send follow-up responses to backend
      const response = await fetch(`${API_BASE_URL}/api/bug-report/${report.id}/additional-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          responses: followUpResponses
        })
      });
      
      // Handle API errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit additional information');
      }
      
      // Hide follow-up form
      setShowFollowUp(false);
      
      // Automatically create Linear ticket after follow-up
      await handleConfirmReport();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Reset the form and process
  const handleReset = () => {
    setDescription('');
    setActive(0);
    setError('');
    setReport(null);
    setFollowUpResponses({});
    setShowFollowUp(false);
    setLinearCreated(false);
    setScreenshots([]);
    setUploadedImages([]);
  };
  
  // Helper to generate a user-friendly summary of the bug
  const getUserFriendlySummary = () => {
    if (!report || !report.report_json) return '';
    
    return `We detected an issue with ${report.report_json.title}. This appears to be affecting your experience because ${report.report_json.suspected_root_cause.split('.')[0]}.`;
  };
  
  return (
    <Container maxWidth="lg" sx={{ py: 4, my: 2 }}>
      <Title variant="h4" align="center" gutterBottom>
        Report a Bug
      </Title>
      
      <Stepper activeStep={active} alternativeLabel>
        <Stepper.Step label="Describe Bug" />
        <Stepper.Step label="Processing" />
        <Stepper.Step label="Report" />
      </Stepper>
      
      {/* Step 1: Bug Description Form */}
      {active === 0 && (
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          <form onSubmit={handleSubmit}>
            <Title variant="h6" gutterBottom>What's Not Working?</Title>
            
            <Textarea
              label="Bug Description"
              placeholder="What's not working? Describe the bug in as much detail as possible..."
              required
              multiline
              rows={5}
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              margin="normal"
              variant="outlined"
            />
            
            {/* Screenshot upload section */}
            <Box sx={{ mt: 3, mb: 3 }}>
              <Text fontWeight="bold" mb={1}>Upload Screenshots (Optional)</Text>
              <Text variant="body2" color="textSecondary" mb={2}>
                Visual evidence helps us understand your issue better. Upload screenshots showing the bug.
              </Text>
              
              <FileInput
                placeholder="Choose files..."
                accept="image/*"
                multiple
                inputRef={fileInputRef}
                onChange={setScreenshots}
              />
              
              {/* Preview uploaded images */}
              {screenshots && screenshots.length > 0 && (
                <SimpleGrid columns={3} spacing={1} sx={{ mt: 2 }}>
                  {screenshots.map((file, index) => (
                    <Box key={index}>
                      <Image
                        src={URL.createObjectURL(file)}
                        alt={`Screenshot ${index + 1}`}
                        sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 1 }}
                      />
                      <Text variant="caption" align="center">
                        {file.name}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </Box>
            
            {error && (
              <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                {error}
              </Alert>
            )}
            
            <Box display="flex" justifyContent="flex-end" mt={2}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={loading || !description}
              >
                Submit Bug Report
              </Button>
            </Box>
          </form>
        </Paper>
      )}
      
      {/* Step 2: Processing */}
      {active === 1 && (
        <Paper elevation={3} sx={{ p: 3, mt: 3, textAlign: 'center' }}>
          <Loader size="large" sx={{ mb: 3 }} />
          <Title variant="h5" gutterBottom>Processing Your Bug Report</Title>
          <Text mb={2}>
            Please wait while our AI analyzes the codebase and generates a comprehensive bug report.
            This may take a few minutes depending on the size of the repository.
          </Text>
          
          {/* Show upload progress if uploading screenshots */}
          {screenshots && screenshots.length > 0 && uploadProgress > 0 && uploadProgress < 100 && (
            <Box sx={{ mb: 2 }}>
              <Text fontWeight="bold" mb={1}>Uploading Screenshots: {uploadProgress}%</Text>
              <Box
                sx={{
                  width: '100%',
                  bgcolor: 'grey.200',
                  borderRadius: 1,
                  height: 8,
                  overflow: 'hidden'
                }}
              >
                <Box
                  sx={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    bgcolor: 'primary.main',
                    transition: 'width 0.3s ease-in-out'
                  }}
                />
              </Box>
            </Box>
          )}
          
          <Divider sx={{ my: 2 }} />
          <Text variant="body2" color="textSecondary">
            We're scanning relevant files, analyzing code patterns, and identifying potential issues.
          </Text>
        </Paper>
      )}
      
      {/* Step 3: Report or Follow-up */}
      {active === 2 && report && (
        <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
          {/* Follow-up Questions Form */}
          {showFollowUp && report.needs_more_info && (
            <>
              <Title variant="h5" gutterBottom>Additional Information Needed</Title>
              
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Title variant="h6" gutterBottom>{report.report_json.title}</Title>
                <Text fontWeight="bold" gutterBottom>{getUserFriendlySummary()}</Text>
                
                <Divider sx={{ my: 2 }} />
                
                <form onSubmit={handleFollowUpSubmit}>
                  <Text mb={2}>
                    To help us better understand and fix this issue, please provide the following information:
                  </Text>
                  
                  {report.needs_more_info.requests.map((request) => (
                    <Box key={request.type} sx={{ mb: 3 }}>
                      <Text fontWeight="bold" gutterBottom>{request.question}</Text>
                      {request.type === 'screenshot' ? (
                        <TextInput
                          placeholder="Paste a URL to your screenshot or describe what's visible"
                          fullWidth
                          value={followUpResponses[request.type] || ''}
                          onChange={(e) => setFollowUpResponses({
                            ...followUpResponses,
                            [request.type]: e.target.value
                          })}
                        />
                      ) : (
                        <Textarea
                          placeholder="Your answer..."
                          rows={2}
                          fullWidth
                          value={followUpResponses[request.type] || ''}
                          onChange={(e) => setFollowUpResponses({
                            ...followUpResponses,
                            [request.type]: e.target.value
                          })}
                        />
                      )}
                    </Box>
                  ))}
                  
                  {error && (
                    <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                      {error}
                    </Alert>
                  )}
                  
                  <Box display="flex" justifyContent="space-between" mt={3}>
                    <Button
                      variant="outlined"
                      onClick={handleReset}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      disabled={loading}
                    >
                      Submit Information
                    </Button>
                  </Box>
                </form>
              </Paper>
            </>
          )}
          
          {/* Confirmation screen */}
          {!showFollowUp && !linearCreated && (
            <>
              <Title variant="h5" gutterBottom>Confirm Bug Report</Title>
              
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Title variant="h6" gutterBottom>{report.report_json.title}</Title>
                
                <Text fontWeight="bold" variant="h6" gutterBottom>Is this the issue you're experiencing?</Text>
                <Text gutterBottom variant="body1">
                  {getUserFriendlySummary()}
                </Text>
                
                <Divider sx={{ my: 2 }} />
                
                <Text fontWeight="bold" gutterBottom>Technical Analysis:</Text>
                <Text paragraph>{report.report_json.suspected_root_cause}</Text>
                
                <Text fontWeight="bold" gutterBottom>Evidence Found:</Text>
                <ul>
                  {report.report_json.evidence.slice(0, 3).map((item, index) => (
                    <li key={index}>
                      <Text>{item}</Text>
                    </li>
                  ))}
                </ul>
                
                {/* Show screenshots if included */}
                {uploadedImages && uploadedImages.length > 0 && (
                  <>
                    <Text fontWeight="bold" gutterBottom>Your Screenshots:</Text>
                    <SimpleGrid columns={3} spacing={1} sx={{ mt: 2, mb: 2 }}>
                      {uploadedImages.map((url, index) => (
                        <Box key={index}>
                          <Image
                            src={url}
                            alt={`Screenshot ${index + 1}`}
                            sx={{ 
                              width: '100%', 
                              height: 120, 
                              objectFit: 'cover', 
                              borderRadius: 1,
                              cursor: 'pointer' 
                            }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        </Box>
                      ))}
                    </SimpleGrid>
                  </>
                )}
                
                <Text fontWeight="bold" gutterBottom>Developer Next Steps:</Text>
                <ul>
                  {report.report_json.next_steps.slice(0, 3).map((item, index) => (
                    <li key={index}>
                      <Text>{item}</Text>
                    </li>
                  ))}
                </ul>
              </Paper>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              
              <Box display="flex" justifyContent="space-between">
                <Button
                  variant="outlined"
                  onClick={handleReset}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmReport}
                  variant="contained"
                  color="primary"
                  disabled={loading}
                >
                  Confirm & Submit Bug Report
                </Button>
              </Box>
            </>
          )}
          
          {/* Final report after confirmation */}
          {!showFollowUp && linearCreated && (
            <>
              <Title variant="h5" gutterBottom>Bug Report Submitted</Title>
              
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Title variant="h6" gutterBottom>{report.report_json.title}</Title>
                  <Box>
                    {report.linear_issue && (
                      <Button
                        component="a"
                        href={report.linear_issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="contained"
                        color="primary"
                        size="small"
                        sx={{ mr: 1 }}
                      >
                        Linear #{report.linear_issue.number}
                      </Button>
                    )}
                    <CopyButton value={report.report_markdown}>
                      {({ copied, copy }) => (
                        <Tooltip title={copied ? "Copied" : "Copy full report"}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={copy}
                          >
                            {copied ? "Copied!" : "Copy Report"}
                          </Button>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Box>
                </Box>
                
                {report.linear_issue && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Box display="flex" alignItems="center">
                      <Text fontWeight="bold" mr={1}>Created Linear Issue:</Text>
                      <Link href={report.linear_issue.url} target="_blank">
                        #{report.linear_issue.number}
                      </Link>
                    </Box>
                  </Alert>
                )}
                
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Text>Thank you! Your bug report has been submitted and our team will investigate this issue.</Text>
                </Alert>
                
                <Text fontWeight="bold" gutterBottom>Summary:</Text>
                <Text paragraph>{getUserFriendlySummary()}</Text>
                
                <Divider sx={{ my: 2 }} />
                
                <Text fontWeight="bold" gutterBottom>Technical Root Cause:</Text>
                <Text paragraph>{report.report_json.suspected_root_cause}</Text>
                
                <Text fontWeight="bold" gutterBottom>Developer Next Steps:</Text>
                <ul>
                  {report.report_json.next_steps.map((item, index) => (
                    <li key={index}>
                      <Text>{item}</Text>
                    </li>
                  ))}
                </ul>
                
                {/* Show screenshots in final report too */}
                {uploadedImages && uploadedImages.length > 0 && (
                  <>
                    <Text fontWeight="bold" gutterBottom>Screenshots:</Text>
                    <SimpleGrid columns={3} spacing={1} sx={{ mt: 2, mb: 2 }}>
                      {uploadedImages.map((url, index) => (
                        <Box key={index}>
                          <Image
                            src={url}
                            alt={`Screenshot ${index + 1}`}
                            sx={{ 
                              width: '100%', 
                              height: 120, 
                              objectFit: 'cover',
                              borderRadius: 1,
                              cursor: 'pointer' 
                            }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        </Box>
                      ))}
                    </SimpleGrid>
                  </>
                )}
              </Paper>
              
              <Text fontWeight="bold" gutterBottom>Files Analyzed:</Text>
              <Code
                sx={{ 
                  display: 'block',
                  mb: 3,
                  maxHeight: 150,
                  overflow: 'auto'
                }}
              >
                {report.files_analyzed.join('\n')}
              </Code>
              
              <Box display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleReset}
                >
                  Report Another Bug
                </Button>
              </Box>
            </>
          )}
        </Paper>
      )}
    </Container>
  );
};

export default BugReportForm;