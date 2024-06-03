const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // Parse JSON bodies
app.use(fileUpload()); // File upload middleware

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(__dirname + '/uploads'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/signup.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/signup.html');
});

// Authentication routes
app.post('/login', (req, res) => {
});

app.post('/signup', (req, res) => {
});

// Your existing routes
app.get('/services', (req, res) => {
  res.sendFile(__dirname + '/public/services.html');
});

app.get('/contact', (req, res) => {
  res.sendFile(__dirname + '/public/contact.html');
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

  const videoPath = __dirname + '/uploads/video.mp4';
  const subtitlesPath = __dirname + '/uploads/subtitles.srt';
  const outputPath = path.join(__dirname, 'uploads', outputFileName);

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

      const fullFontPath = `fonts/${selectedFontFile}`;

      const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
      const acceptedSubtitleFormats = ['.srt', '.ass'];

      if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
        return res.status(400).send('Selected subtitle format is not supported.');
      }

      const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${subtitlesPath}:force_style='Fontfile=${fullFontPath}'" ${outputPath}`;

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
          secure: false, // Set to true if using port 465 (secure)
          auth: {
            user: 'vpsest@gmail.com',
            pass: process.env.APP_KEY, // Ensure APP_KEY is set in your .env file
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

        // Send the download link to the client
        res.send(downloadLink);

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
