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

// Process login form submission
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $password = $_POST['password'];

    // Sanitize inputs (you should use prepared statements for security)
    $username = mysqli_real_escape_string($conn, $username);
    $password = mysqli_real_escape_string($conn, $password);

    // Query the database
    $sql = "SELECT * FROM users WHERE username='$username'";
    $result = $conn->query($sql);

    if ($result->num_rows == 1) {
        $row = $result->fetch_assoc();
        // Verify password (you should use password_hash() and password_verify() in production)
        if ($password == $row['password']) {
            // Password is correct, redirect to burn page
            header("Location: https://vidburner.online/burn");
            exit();
        } else {
            echo "Incorrect password";
        }
    } else {
        echo "User not found";
    }
}

$conn->close();
?>
