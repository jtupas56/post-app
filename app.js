const express = require('express');
const sqlite3 = require('sqlite3');
const app = express();
const db = new sqlite3.Database(':memory:');

app.use(express.urlencoded({ extended: true }));

db.serialize(() => {
    db.run("CREATE TABLE users (username TEXT, password TEXT)");
    db.run("INSERT INTO users (username, password) VALUES ('admin', 'pass')");
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (err) return res.send('Database error');
        row ? res.send(`Welcome ${username}`) : res.send('Invalid <a href="/">retry</a>');
    });
});

app.listen(3000, () => console.log('Click http://localhost:3000'));