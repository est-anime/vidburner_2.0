const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const readline = require('readline');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto'); // For generating unique filename
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const session = require('express-session');
const dotenv = require('dotenv');
const axios = require('axios'); // For making HTTP requests

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));

// MongoDB Atlas connection URI
const uri = process.env.MONGODB_URI; // Replace with your MongoDB Atlas connection string
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

client.connect(err => {
  if (err) {
    console.error('Failed to connect to MongoDB Atlas:', err);
    return;
  }
  console.log('Connected successfully to MongoDB Atlas');
});

const db = client.db('burner');
const historyCollection = db.collection('history');
const usersCollection = db.collection('users');
const codesCollection = db.collection('codes'); // Define codesCollection here


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Middleware to check if user is already authenticated
function checkAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect('/burn');
  }
  next();
}

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Routes for login and register pages
app.get('/login', checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/burn', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'service', 'burn.html'));
});

app.get('/subscription', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subscription.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.post('/register', async (req, res) => {
  const { username, email, password, confirm_password } = req.body;

  if (!username || !email || !password || !confirm_password) {
    return res.status(400).send('All fields are required');
  }

  if (password !== confirm_password) {
    return res.status(400).send('Passwords do not match');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const usersCollection = client.db('burner').collection('users');

  try {
    const result = await usersCollection.insertOne({ username, email, password: hashedPassword });
    console.log('User registered successfully:', result.insertedId);
    res.status(200).send('<script>window.location.href = "/login";</script>');
  } catch (error) {
    console.error('Error inserting into MongoDB Atlas:', error);
    res.status(500).send('Server error');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  const usersCollection = client.db('burner').collection('users');

  try {
    const user = await usersCollection.findOne({ username });
    if (!user) {
      return res.status(401).send('Invalid username or password');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send('Invalid username or password');
    }

    req.session.user = user;
    res.status(200).redirect('/burn'); // Redirect to burn page after successful login
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).send('Server error');
  }
});

// Route to serve the dashboard
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Endpoint to fetch encoding history for the authenticated user
app.get('/history', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user._id; // Assuming your user document has an _id field
  try {
    const history = await historyCollection.find({ userId: new ObjectId(userId) }).toArray();
    res.json(history);
  } catch (error) {
    console.error('Error fetching history from MongoDB:', error);
    res.status(500).send('Error fetching history');
  }
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin-login', (req, res) => {
 const adminUsername = process.env.ADMIN_USERNAME;
 const adminPassword = process.env.ADMIN_PASSWORD;

  if (req.body.username === adminUsername && req.body.password === adminPassword) {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.status(401).send('Invalid credentials');
  }
});

app.get('/admin', (req, res) => {
  if (req.session.admin) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } else {
    res.redirect('/admin-login');
  }
});

app.get('/download/:fileName', async (req, res) => {
  const fileName = req.params.fileName;

  try {
    const historyEntry = await historyCollection.findOne({ fileName: fileName });

    if (!historyEntry) {
      return res.status(404).send('File not found');
    }

    const currentTime = new Date();
    if (currentTime > historyEntry.linkExpiration) {
      return res.status(410).send('Link has expired');
    }

    const filePath = path.join(__dirname, 'uploads', fileName);
    res.download(filePath);
  } catch (error) {
    console.error('Error fetching file for download:', error);
    res.status(500).send('Server error');
  }
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin-login');
});

app.post('/admin/generate-code', (req, res) => {
  if (!req.session.admin) {
    return res.status(401).send('Unauthorized');
  }

  const code = crypto.randomBytes(8).toString('hex');

  db.collection('codes').insertOne({ code, used: false })
    .then(result => res.json({ code }))
    .catch(error => res.status(500).send('Error generating code'));
});

app.post('/submit-code', ensureAuthenticated, async (req, res) => {
  const { code } = req.body;
  const userId = req.session.user._id;

  try {
    const codeDoc = await db.collection('codes').findOne({ code, used: false });

    if (!codeDoc) {
      return res.status(400).json({ success: false, message: 'Invalid or already used code' });
    }

    await db.collection('codes').updateOne({ _id: codeDoc._id }, { $set: { used: true } });
    await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: { isPremium: true } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing code:', error);
    res.status(500).send('Server error');
  }
});

app.post('/encode', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user._id;
  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

  const currentDate = new Date();
  const currentDateString = currentDate.toISOString().split('T')[0];

  const encodedToday = await historyCollection.countDocuments({
    userId: new ObjectId(userId),
    timestamp: { $gte: new Date(`${currentDateString}T00:00:00.000Z`), $lte: new Date(`${currentDateString}T23:59:59.999Z`) }
  });

  const maxMinutes = user.isPremium ? 100 : 24;

  if (encodedToday >= maxMinutes) {
    return res.status(403).send(`You have reached your daily limit of ${maxMinutes} minutes.`);
  }
  });

// Serve the enter-code.html file
  app.get('/enter-code', ensureAuthenticated, async (req, res) => {
  const userId = req.session.user._id;

  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (user.isPremium) {
      // If user is already premium, display a message
      return res.send('You are already a premium user!');
    }

    // Otherwise, render the enter-code.html page
    res.sendFile(path.join(__dirname, 'public', 'enter-code.html'));
  } catch (error) {
    console.error('Error checking user premium status:', error);
    res.status(500).send('Server error');
  }
});

app.post('/enter-code', ensureAuthenticated, async (req, res) => {
  const { code } = req.body;

  try {
    console.log('Received code:', code);
    const premiumCode = await codesCollection.findOne({ code, used: false });

    if (!premiumCode) {
      return res.status(400).send('Invalid or already used code');
    }

    const userId = req.session.user._id;
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (user.isPremium) {
      // If user is already premium, return a message
      return res.status(400).send('You are already a premium user!');
    }

    // Update user to premium
    const updateResult = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { isPremium: true }, $unset: { minutesUsed: "" } }
    );

    // Mark code as used
    const codeUpdateResult = await codesCollection.updateOne({ code }, { $set: { used: true } });

    console.log('User update result:', updateResult);
    console.log('Code update result:', codeUpdateResult);

    res.status(200).send('You are now a premium user!');
  } catch (error) {
    console.error('Error upgrading user to premium:', error);
    res.status(500).send('Server error');
  }
});

app.post('/upload', isAuthenticated, (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;
  const logoFile = req.files.logo;
  const userId = req.session.user._id; // Get the user ID from the session

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

    ffmpegProcess.on('exit', async () => {
      res.write('data: 100\n\n');
      res.end();
      
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      // Insert encoding history into the database
      const historyItem = {
        userId: new ObjectId(userId),
        fileName: outputFileName,
        status: 'Completed',
        timestamp: new Date(),
        downloadLink: downloadLink,
        linkExpiration: expirationTime
      };

      try {
        await historyCollection.insertOne(historyItem);
        console.log('Encoding history inserted successfully');
      } catch (error) {
        console.error('Error inserting encoding history:', error);
      }

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
    });
  };
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
