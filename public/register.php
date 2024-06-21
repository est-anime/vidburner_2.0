<?php
require __DIR__ . '/vendor/autoload.php'; // Adjust path to autoload.php if necessary

use Dotenv\Dotenv;

// Load dotenv
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Get environment variables
$db_username = $_ENV['user'];
$db_password = $_ENV['pass'];
$db_name = $_ENV['vidburner_db'];
$db_host = $_ENV['localhost'];

// Create connection
$conn = new mysqli($db_host, $db_username, $db_password, $db_name);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Process registration form submission
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $email = $_POST['email'];
    $password = $_POST['password'];
    $confirm_password = $_POST['confirm_password'];

    // Validate input
    // Check if passwords match
    if ($password != $confirm_password) {
        die("Passwords do not match");
    }

    // Sanitize inputs (you should use prepared statements for security)
    $username = mysqli_real_escape_string($conn, $username);
    $email = mysqli_real_escape_string($conn, $email);
    $password = mysqli_real_escape_string($conn, $password);

    // Hash password (use bcrypt or Argon2 for secure hashing, not plain MD5 or SHA)
    $hashed_password = md5($password);

    // Insert into database
    $sql = "INSERT INTO users (username, email, password) VALUES ('$username', '$email', '$hashed_password')";

    if ($conn->query($sql) === TRUE) {
        echo "Registration successful";
        // Redirect to login page or any other page
        header("Location: login.html");
        exit();
    } else {
        echo "Error: " . $sql . "<br>" . $conn->error;
    }
}

$conn->close();
?>
