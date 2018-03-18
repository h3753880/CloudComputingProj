<!DOCTYPE html>
<html>
<body>

<?php

$servername = "localhost";
$username = "root";
$password = "";
$dbname = "dockertest";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);
// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$sql = "DELETE FROM account";

if ($conn->query($sql) === TRUE) {
    echo "<p>New record DELETED successfully</p>";
} else {
    echo "Error: " . $sql . "<br>" . $conn->error;
}

$conn->close();

?> 

</body>
</html>