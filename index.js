const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto'); // For generating unique filenames

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(express.json());

app.use('/uploads', express.static(__dirname + '/uploads'));

// Initialize variable to store the last password entry timestamp
let lastPasswordEntryTimestamp = null;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/check-password', (req, res) => {
  const correctPassword = process.env.PASSWORD;
  const { password } = req.body;

  // Check if the last password entry was more than 24 hours ago
  if (lastPasswordEntryTimestamp && Date.now() - lastPasswordEntryTimestamp < 24 * 60 * 60 * 1000) {
    return res.json({ success: true, message: 'Password entry not required. Last entry within 24 hours.' });
  }

  if (password === correctPassword) {
    // Update the last password entry timestamp
    lastPasswordEntryTimestamp = Date.now();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post('/upload', (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;

  // Generate unique filenames for the uploaded files
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const videoPath = path.join(__dirname, `/uploads/video_${uniqueId}.mp4`);
  const subtitlesPath = path.join(__dirname, `/uploads/subtitles_${uniqueId}.srt`);
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

      const ffmpegProcess = exec(ffmpegCommand);

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
        const downloadLink = `http://${req.hostname}:${port}/uploads/${outputFileName}`;

        // Send an email with the download link
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: 'vpsest@gmail.com',
            pass: process.env.APP_KEY, // Use app-specific password here
          },
        });

        const mailOptions = {
          from: 'vpsest@gmail.com',
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
      });
    });
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
