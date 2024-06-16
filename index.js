const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Google OAuth2 credentials
const clientId = 'YOUR_CLIENT_ID';
const clientSecret = 'YOUR_CLIENT_SECRET';
const redirectUri = 'YOUR_REDIRECT_URI'; // This should be set in your Google Cloud Console

// Create OAuth2 client
const oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

// Generate Google OAuth2 authentication URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive']
});

// Google Drive API
const drive = google.drive({
  version: 'v3',
  auth: oAuth2Client
});

// Google Sign-In route
app.get('/google-login', (req, res) => {
  res.redirect(authUrl);
});

// Google OAuth2 callback route
app.get('/google-auth-callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    res.redirect('/upload');
  } catch (error) {
    console.error('Error authenticating with Google:', error);
    res.status(500).send('Error authenticating with Google.');
  }
});

// Upload route (after successful authentication)
app.get('/upload', (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;
  const logoFile = req.files.logo;

  // Generate unique filenames for the uploaded files
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const videoPath = path.join(__dirname, `/uploads/video_${uniqueId}.mp4`);
  const subtitlesPath = path.join(__dirname, `/uploads/subtitles_${uniqueId}.srt`);
  const logoPath = logoFile ? path.join(__dirname, `/uploads/logo_${uniqueId}.png`) : null;
  const outputPath = path.join(__dirname, '/uploads', outputFileName);

  videoFile.mv(videoPath, (err) => {
    if (err) {
      console.error(`Error: ${err.message}`);
      return res.status(500).send('Error occurred while uploading the video.');
    }

    subtitlesFile.mv(subtitlesPath, (err) => {
      if (err) {
        console.error(`Error: ${err.message}`);
        return res.status(500).send('Error occurred while uploading the subtitles.');
      }

      if (logoFile) {
        logoFile.mv(logoPath, (err) => {
          if (err) {
            console.error(`Error: ${err.message}`);
            return res.status(500).send('Error occurred while uploading the logo.');
          }
          processVideoWithLogo();
        });
      } else {
        processVideoWithoutLogo();
      }
    });
  });

  const processVideoWithLogo = () => {
    // Your existing code for processing videos with logo
    // Make sure to replace placeholders with actual values
  };

  const processVideoWithoutLogo = () => {
    // Your existing code for processing videos without logo
    // Make sure to replace placeholders with actual values
  };

  // Function to upload file to Google Drive
  const uploadToDrive = async (filePath, mimeType) => {
    try {
      const response = await drive.files.create({
        requestBody: {
          name: path.basename(filePath),
          mimeType: mimeType
        },
        media: {
          mimeType: mimeType,
          body: fs.createReadStream(filePath)
        }
      });

      console.log('File uploaded to Google Drive:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      throw error;
    }
  };

  // Upload processed video to Google Drive
  const uploadEncodedVideoToDrive = async () => {
    try {
      const uploadedVideo = await uploadToDrive(outputPath, 'video/mp4');
res.status(200).send('Video uploaded to Google Drive successfully.');
} catch (error) {
console.error('Error uploading video to Google Drive:', error);
res.status(500).send('Error uploading video to Google Drive.');
}
};

// Process video and upload to Google Drive
const processVideoAndUploadToDrive = async () => {
try {
// Your existing code to process the video

vbnet
Copy code
  // Upload processed video to Google Drive
  await uploadEncodedVideoToDrive();
} catch (error) {
  console.error('Error processing video and uploading to Google Drive:', error);
  res.status(500).send('Error processing video and uploading to Google Drive.');
}
};

// Call the function to process the video and upload to Google Drive
processVideoAndUploadToDrive();
});

app.listen(port, '0.0.0.0', () => {
console.log(Server running on http://0.0.0.0:${port});
});
