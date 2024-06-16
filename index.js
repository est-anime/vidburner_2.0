const express = require('express');
const { google } = require('googleapis');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(express.json());

// Set up Google OAuth2 credentials
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/google/callback' // Redirect URI
);

// Redirect user to Google Sign-In page
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
  });
  res.redirect(authUrl);
});

// Handle callback after Google Sign-In
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Create a folder named "vidburner" in the user's Google Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderMetadata = {
      name: 'vidburner',
      mimeType: 'application/vnd.google-apps.folder',
    };
    const response = await drive.files.create({
      resource: folderMetadata,
      fields: 'id',
    });

    // Save user's credentials and folder ID for future use
    // For production, you may want to securely store these credentials
    const userCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      folderId: response.data.id,
    };
    // Save userCredentials to a database or secure storage

    res.send('Google Sign-In successful. You can now upload videos to Google Drive.');
  } catch (error) {
    console.error('Error during Google Sign-In:', error);
    res.status(500).send('Error during Google Sign-In. Please try again.');
  }
});

// Handle file upload
app.post('/upload', async (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;
  const logoFile = req.files.logo;
  const uploadToDrive = req.body.driveUpload === 'on';

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
    const fontMapping = {
      'Arial-Bold': 'Arial-Bold.ttf',
      'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
      'Tungsten-Bold': 'Tungsten-Bold.ttf'
    };

    const selectedFontFile = fontMapping[selectedFont];

    if (!selectedFontFile) {
      return res.status(400).send('Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return res.status(400).send('Selected subtitle format is not supported.');
    }

    const ffmpegCommand = `ffmpeg -i "${videoPath}" -i "${logoPath}" -filter_complex "[1][0]scale2ref=w=iw/5:h=ow/mdar[logo][video];[video][logo]overlay=W-w-10:10,subtitles=${subtitlesPath}:force_style='FontName=${fullFontPath}'" "${outputPath}"`;

    executeFfmpeg(ffmpegCommand);
  };

  const processVideoWithoutLogo = () => {
    const fontMapping = {
      'Arial-Bold': 'Arial-Bold.ttf',
      'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
      'Tungsten-Bold': 'Tungsten-Bold.ttf'
    };

    const selectedFontFile = fontMapping[selectedFont];

    if (!selectedFontFile) {
      return res.status(400).send('Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return res.status(400).send('Selected subtitle format is not supported.');
    }

    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vf "subtitles=${subtitlesPath}:force_style='FontName=${fullFontPath}'" "${outputPath}"`;

    executeFfmpeg(ffmpegCommand);
  };

  const executeFfmpeg = (command) => {
    const ffmpegProcess = exec(command);

    let totalFrames = 0;
    let processedFrames = 0;
    readline.createInterface({ input: ffmpegProcess.stderr })
      .on('line', (line) => {
        if (line.includes('frame=')) {
          const match = line.match(/frame=\s*(\d+)/);
          if (match && match[1]) {
            processedFrames = parseInt(match[1]);
          }
        }
        if (line.includes('fps=')) {
          const match = line.match(/fps=\s*([\d.]+)/);
          if (match && match[1]) {
            totalFrames = parseInt(match[1]);
          }
        }
        if (totalFrames > 0 && processedFrames > 0) {
          const progressPercent = (processedFrames / totalFrames) * 100;
          res.write(`data: ${progressPercent}\n\n`);
        }
      });

    ffmpegProcess.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      return res.status(500).send('Error occurred during video processing.');
    });

    ffmpegProcess.on('exit', () => {
      res.write('data: 100\n\n');
      res.end();

      // Construct the download link
      const downloadLink = `http://${req.hostname}/uploads/${outputFileName}`;

      // Send an email with the download link
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.Email,
          pass: process.env.APP_KEY,
        },
      });

      const mailOptions = {
        from: process.env.Email,
        to: userEmail,
        subject: 'Video Encoding Completed',
        text: `Your video has been successfully encoded. You can download it using the following link: ${downloadLink}`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error(`Email sending error: ${error}`);
        } else {
          console.log(`Email sent: ${info.response}`);
        }
      });

      // Delete the processed video after 24 hours
      setTimeout(() => {
        fs.unlink(outputPath, (err) => {
          if (err) {
            console.error(`Error deleting file: ${err}`);
          } else {
            console.log('Processed video deleted successfully after 24 hours.');
          }
        });
      }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

      // Upload to Google Drive if enabled
      if (uploadToDrive) {
        uploadToGoogleDrive(outputPath, outputFileName, userEmail);
      }
    });
  };

  const uploadToGoogleDrive = async (filePath, fileName, userEmail) => {
    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Create file metadata
      const fileMetadata = {
        name: fileName,
        parents: [userCredentials.folderId], // Upload to 'vidburner' folder
      };

      // Create media
      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath),
      };

      // Upload file to Google Drive
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });

      console.log('File uploaded to Google Drive. File ID:', response.data.id);

      // Send email notification with Google Drive link
      const downloadLink = `https://drive.google.com/file/d/${response.data.id}/view`;
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.Email,
          pass: process.env.APP_KEY,
        },
      });
      const mailOptions = {
        from: process.env.Email,
        to: userEmail,
        subject: 'Video Uploaded to Google Drive',
        text: `Your video has been uploaded to Google Drive. You can access it using the following link: ${downloadLink}`,
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error(`Email sending error: ${error}`);
        } else {
          console.log(`Email sent: ${info.response}`);
        }
      });
    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
    }
  };

});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
