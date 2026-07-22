const express = require('express');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, '../database.db'));

app.use(express.urlencoded({ extended: true }));

db.run(`CREATE TABLE IF NOT EXISTS users (uid INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.send('Fields required.');
    db.run(`INSERT INTO users (username, password) VALUES ('${username}', '${password}')`, function (err) {
        if (err) return res.send('Username taken.');
        res.redirect('/');
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = '${username}'`, (err, user) => {
        if (!user) return res.send('Invalid user.');
        if (user.password !== password) return res.send('Wrong password.');
        res.redirect(`/dashboard?uid=${user.uid}&username=${username}`);
    });
});

app.get('/dashboard', (req, res) => {
    const { uid, username } = req.query;
    if (!uid || !username) return res.redirect('/');

    db.all('SELECT posts.id, posts.content, posts.user_id, users.username as author FROM posts JOIN users ON posts.user_id = users.uid', [], (err, posts) => {
        if (err) return res.status(500).send('Unable to load dashboard.');

        let html = fs.readFileSync(path.join(__dirname, 'post.html'), 'utf8');
        let postList = '';

        if (posts) {
            posts.forEach(post => {
                let deleteLink = '';
                if (post.user_id == uid) {
                    deleteLink = ` <a href="/delete-post?id=${post.id}&uid=${uid}&username=${username}">[Delete]</a>`;
                }
                postList += `<li><strong>${post.author}</strong>: ${post.content}${deleteLink}</li>`;
            });
        }

        html = html.replaceAll('{{username}}', username);
        html = html.replaceAll('{{uid}}', uid);
        html = html.replace('{{post_list}}', postList);
        res.send(html);
    });
});

app.post('/add-post', (req, res) => {
    const { content, uid, username } = req.body;
    if (!content || !uid || !username) return res.redirect('/');

    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [uid, content], err => {
        if (err) return res.status(500).send('Unable to save post.');
        res.redirect(`/dashboard?uid=${uid}&username=${username}`);
    });
});

app.get('/delete-post', (req, res) => {
    const { id, uid, username } = req.query;
    db.get(`SELECT user_id FROM posts WHERE id = ${id}`, (err, post) => {
        if (post && post.user_id == uid) {
            db.run(`DELETE FROM posts WHERE id = ${id}`, () => {
                res.redirect(`/dashboard?uid=${uid}&username=${username}`);
            });
        } else {
            res.redirect(`/dashboard?uid=${uid}&username=${username}`);
        }
    });
});

app.post('/delete-account', (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.redirect('/');
    db.run(`DELETE FROM posts WHERE user_id = ${uid}`, () => {
        db.run(`DELETE FROM users WHERE uid = ${uid}`, () => {
            res.redirect('/');
        });
    });
});

app.listen(3000, () => console.log('http://localhost:3000'));