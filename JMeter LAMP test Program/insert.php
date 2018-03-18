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

$sql = "INSERT INTO account VALUES(";
$text = "aaaaaaa";

for ($x = 0; $x <= 12; $x++) {
    $text .= $text;
} 

for ($i = 0; $i <= 1000; $i++) { 
	if ($conn->query($sql .$i .",'" .$text . "'')") === TRUE) {
	    echo "<p>New record created successfully</p>";
	} else {
	    echo "Error: " . $sql . "<br>" . $conn->error;
	}
} 


$conn->close();
?> 

</body>
</html>