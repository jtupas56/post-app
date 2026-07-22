const express = require('express');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const csurf = require('csurf');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, '../database.db'));
const logDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });

app.use(helmet());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: 'supersecretchangeit',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
        },
    })
);
app.use(csurf());

function renderTemplate(filePath, values) {
    let html = fs.readFileSync(filePath, 'utf8');
    Object.entries(values).forEach(([key, value]) => {
        html = html.replaceAll(`{{${key}}}`, value);
    });
    return html;
}

function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[&<>"']/g, (char) => {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char];
    });
}

function requireAuth(req, res, next) {
    if (!req.session.uid) {
        return res.redirect('/');
    }
    next();
}

db.run(`CREATE TABLE IF NOT EXISTS users (uid INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`);

app.get('/', (req, res) => {
    const html = renderTemplate(path.join(__dirname, 'index.html'), {
        csrfToken: req.csrfToken(),
    });
    res.send(html);
});

app.get('/register', (req, res) => {
    const html = renderTemplate(path.join(__dirname, 'register.html'), {
        csrfToken: req.csrfToken(),
    });
    res.send(html);
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.send('Fields required.');

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, passwordHash], function (err) {
            if (err) return res.send('Username taken.');
            res.redirect('/');
        });
    } catch (error) {
        res.status(500).send('Registration error.');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.send('Fields required.');

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).send('Login error.');
        if (!user) return res.send('Invalid user.');

        if (!bcrypt.compareSync(password, user.password)) return res.send('Wrong password.');

        req.session.uid = user.uid;
        req.session.username = user.username;
        res.redirect('/dashboard');
    });
});

app.get('/dashboard', requireAuth, (req, res) => {
    db.all('SELECT posts.id, posts.content, posts.user_id, users.username as author FROM posts JOIN users ON posts.user_id = users.uid', [], (err, posts) => {
        if (err) return res.status(500).send('Unable to load dashboard.');

        let postList = '';
        if (posts) {
            posts.forEach((post) => {
                let deleteForm = '';
                if (post.user_id === req.session.uid) {
                    deleteForm = ` <form action="/delete-post" method="POST" class="d-inline ms-2"><input type="hidden" name="id" value="${post.id}"><input type="hidden" name="_csrf" value="{{csrfToken}}"><button type="submit" class="btn btn-link btn-sm p-0 m-0 text-danger">[Delete]</button></form>`;
                }
                postList += `<li class="list-group-item"><strong>${escapeHtml(post.author)}</strong>: ${escapeHtml(post.content)}${deleteForm}</li>`;
            });
        }

        const html = renderTemplate(path.join(__dirname, 'post.html'), {
            username: escapeHtml(req.session.username),
            post_list: postList,
            csrfToken: req.csrfToken(),
        });
        res.send(html);
    });
});

app.post('/add-post', requireAuth, (req, res) => {
    const { content } = req.body;
    if (!content) return res.redirect('/dashboard');

    db.run('INSERT INTO posts (user_id, content) VALUES (?, ?)', [req.session.uid, content], (err) => {
        if (err) return res.status(500).send('Unable to save post.');
        res.redirect('/dashboard');
    });
});

app.post('/delete-post', requireAuth, (req, res) => {
    const { id } = req.body;
    if (!id) return res.redirect('/dashboard');

    db.get('SELECT user_id FROM posts WHERE id = ?', [id], (err, post) => {
        if (err || !post) return res.redirect('/dashboard');
        if (post.user_id !== req.session.uid) return res.redirect('/dashboard');

        db.run('DELETE FROM posts WHERE id = ?', [id], () => {
            res.redirect('/dashboard');
        });
    });
});

app.post('/delete-account', requireAuth, (req, res) => {
    db.run('DELETE FROM posts WHERE user_id = ?', [req.session.uid], () => {
        db.run('DELETE FROM users WHERE uid = ?', [req.session.uid], () => {
            req.session.destroy(() => {
                res.redirect('/');
            });
        });
    });
});

app.get('/logout', requireAuth, (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        const message = 'Invalid CSRF token. Please refresh the page and try again.';
        const entry = `[${new Date().toISOString()}] CSRF token failure: ${req.method} ${req.originalUrl}\n`;
        fs.appendFile(path.join(logDir, 'error.log'), entry, () => { });
        return res.status(403).send(message);
    }

    const entry = `[${new Date().toISOString()}] Server error: ${err.message} ${req.method} ${req.originalUrl}\n`;
    fs.appendFile(path.join(logDir, 'error.log'), entry, () => { });
    console.error(err);
    res.status(500).send('Internal server error.');
});

app.listen(3000, () => console.log('http://localhost:3000'));
