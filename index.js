const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto'); // For generating unique filenames
const translate = require('@vitalets/google-translate-api');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Authentication middleware
const authenticateToken = require('./middleware/auth');

// Standard response function
function sendResponse(res, statusCode, message, data = null) {
  res.status(statusCode).json({ success: statusCode < 400, message, data });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Video upload and processing route
app.post('/upload', authenticateToken, async (req, res) => {
  // Validate input using Joi
  const uploadSchema = Joi.object({
    video: Joi.any().required(),
    subtitles: Joi.any().required(),
    logo: Joi.any(),
    font: Joi.string(),
    outputFileName: Joi.string().default('output.mp4'),
    email: Joi.string().email().required(),
  });

  const { error, value } = uploadSchema.validate(req.body);
  if (error) {
    return sendResponse(res, 400, error.details[0].message);
  }

  if (!req.files || !req.files.video || !req.files.subtitles) {
    return sendResponse(res, 400, 'Please upload both video and subtitles.');
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
      return sendResponse(res, 500, 'Error occurred while uploading the video.');
    }

    subtitlesFile.mv(subtitlesPath, (err) => {
      if (err) {
        console.error(`Error: ${err.message}`);
        return sendResponse(res, 500, 'Error occurred while uploading the subtitles.');
      }

      if (logoFile) {
        logoFile.mv(logoPath, (err) => {
          if (err) {
            console.error(`Error: ${err.message}`);
            return sendResponse(res, 500, 'Error occurred while uploading the logo.');
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
      return sendResponse(res, 400, 'Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return sendResponse(res, 400, 'Selected subtitle format is not supported.');
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
      return sendResponse(res, 400, 'Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return sendResponse(res, 400, 'Selected subtitle format is not supported.');
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
      return sendResponse(res, 500, 'Error occurred during video processing.');
    });

    ffmpegProcess.on('exit', async (code, signal) => {
      if (code === 0) {
        const downloadLink = `http://localhost:${port}/uploads/${outputFileName}`;
        sendResponse(res, 200, 'Video processed successfully.', { downloadLink });

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL,
            pass: process.env.APP_KEY
          }
        });

        const mailOptions = {
          from: process.env.EMAIL,
          to: userEmail,
          subject: 'Video Processed',
          text: `Your video has been processed successfully. You can download it from the following link: ${downloadLink}`,
        };

        await transporter.sendMail(mailOptions);
      } else {
        console.error(`Process exited with code: ${code} and signal: ${signal}`);
        return sendResponse(res, 500, 'Video processing failed.');
      }
    });
  };
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  sendResponse(res, 500, 'Something went wrong.');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
