const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path'); // Import the path module

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());

app.use('/uploads', express.static(__dirname + '/uploads'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});
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
  const outputPath = __dirname + '/uploads/output.mp4';

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

      const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${subtitlesPath}:force_style='Fontfile=${fullFontPath}'" uploads/${outputFileName}`;

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

        // Send an email with the download link
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // Set to true if using port 465 (secure)
          auth: {
            user: 'vpsest@gmail.com',
            pass: process.env.APP_KEY, // Remove the quotes around process.env.APP_KEY
          },
        });

        const mailOptions = {
          from: 'vpsest@gmail.com',
          to: userEmail,
          subject: 'Video Encoding Completed',
          text: `Your video has been successfully encoded. You can download it using the following link: http://:vidburner.vpsest.repl.co/uploads/${outputFileName}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(`Email sending error: ${error}`);
          } else {
            console.log(`Email sent: ${info.response}`);
          }
        });
      });
    });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
