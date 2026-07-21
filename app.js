const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const app = express();
const db = new sqlite3.Database('database.db');

app.use(express.urlencoded({ extended: true }));

db.run(`CREATE TABLE IF NOT EXISTS users (
  uid INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`);

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/register', (req, res) => res.sendFile(__dirname + '/register.html'));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.send('Both fields required. <a href="/register">Try again</a>');

    const hashed = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashed], function (err) {
        if (err) return res.send('Username already taken. <a href="/register">Try again</a>');
        res.send('Registration successful! Your UID is ' + this.lastID + '. <a href="/">Login now</a>');
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.send('Invalid credentials. <a href="/">Retry</a>');
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.send('Invalid credentials. <a href="/">Retry</a>');
        res.send('Welcome ' + username + '! (UID: ' + user.uid + ') <a href="/">Logout</a>');
    });
});

app.listen(3000, () => console.log('http://localhost:3000'));